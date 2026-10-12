import { useSyncExternalStore } from 'react'
import { preferredVoice, releaseAudio, type VoiceId } from './audio'
import { getSupabase } from './supabase'
import type { TtsMessage, TtsRequest } from './tts.worker'
import { encodeWav16 } from './wav'

/**
 * Voices words in the teacher's browser with Kokoro and stores the files.
 * The queue lives outside React, so voicing goes on after a dialog closes.
 */
export type VoicingState = {
  model: 'idle' | 'loading' | 'ready' | 'error'
  loaded: number
  total: number
  pending: ReadonlySet<string>
  failed: ReadonlySet<string>
  /** 'webgpu' is fast; 'wasm' is the CPU fallback. */
  device: 'webgpu' | 'wasm' | null
  lastError: string | null
}

let state: VoicingState = {
  model: 'idle',
  loaded: 0,
  total: 0,
  pending: new Set(),
  failed: new Set(),
  device: null,
  lastError: null,
}
const listeners = new Set<() => void>()
const voicedListeners = new Set<(itemId: string) => void>()

function update(patch: Partial<VoicingState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useVoicing(): VoicingState {
  return useSyncExternalStore(subscribe, () => state)
}

/** Called after a word got its new audio, to refresh the list. */
export function onVoiced(listener: (itemId: string) => void) {
  voicedListeners.add(listener)
  return () => {
    voicedListeners.delete(listener)
  }
}

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, { resolve: (value: { samples: Float32Array; rate: number }) => void; reject: (error: Error) => void }>()

// The worker must show signs of life at least this often. Preparing the model after the download
// sends nothing for a while, and Safari is slow at it, so loading gets more time than one word.
const WORD_LIMIT_MS = 60_000
const LOADING_LIMIT_MS = 5 * 60_000
let watchdog: number | null = null

function stopWatchdog() {
  if (watchdog !== null) window.clearTimeout(watchdog)
  watchdog = null
}

function feedWatchdog() {
  stopWatchdog()
  if (waiting.size === 0) return
  watchdog = window.setTimeout(() => restartWorker('tts_timeout'), state.model === 'ready' ? WORD_LIMIT_MS : LOADING_LIMIT_MS)
}

/** Fails every waiting request and drops the worker; the next request starts a fresh one. */
function restartWorker(reason: string) {
  stopWatchdog()
  console.error('Voicing stopped:', reason)
  for (const request of waiting.values()) request.reject(new Error(reason))
  waiting.clear()
  worker?.terminate()
  worker = null
  update({ model: 'error', lastError: reason })
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<TtsMessage>) => {
    const message = event.data
    feedWatchdog()
    if (message.type === 'progress') update({ loaded: message.loaded, total: message.total })
    else if (message.type === 'ready') update({ model: 'ready', device: message.device, lastError: null })
    else if (message.type === 'fallback') {
      console.warn('Voicing on the GPU failed, switching to the CPU:', message.reason)
      update({ loaded: 0, total: 0 })
    }
    else {
      const request = waiting.get(message.id)
      waiting.delete(message.id)
      feedWatchdog()
      if (message.type === 'done') request?.resolve({ samples: message.samples, rate: message.rate })
      else {
        console.error('Voicing failed:', message.message)
        update({ lastError: message.message, ...(state.model !== 'ready' && { model: 'error' as const }) })
        request?.reject(new Error(message.message))
      }
    }
  }
  worker.onerror = (event) => restartWorker(event.message || 'tts_worker_failed')
  return worker
}

function synthesize(text: string, voice: VoiceId) {
  if (state.model === 'idle' || state.model === 'error') update({ model: 'loading' })
  const id = nextId++
  return new Promise<{ samples: Float32Array; rate: number }>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    getWorker().postMessage({ id, text, voice } satisfies TtsRequest)
    feedWatchdog()
  })
}

let queue: Promise<void> = Promise.resolve()
// A word can be queued twice (the teacher fixed a typo), so pending is a count.
const queued = new Map<string, number>()

function setQueued(itemId: string, delta: number) {
  const count = (queued.get(itemId) ?? 0) + delta
  if (count > 0) queued.set(itemId, count)
  else queued.delete(itemId)
  update({ pending: new Set(queued.keys()) })
}

/** Queues words for voicing. Each word gets a fresh file; the old one is deleted when nothing uses it. */
export function voiceItems(lessonId: string, items: Array<{ id: string; term: string }>, voice: VoiceId = preferredVoice()) {
  if (items.length === 0) return
  const failed = new Set(state.failed)
  for (const item of items) failed.delete(item.id)
  update({ failed })
  for (const item of items) {
    setQueued(item.id, 1)
    queue = queue.then(() => voiceOne(lessonId, item, voice))
  }
}

async function voiceOne(lessonId: string, item: { id: string; term: string }, voice: VoiceId) {
  try {
    const { samples, rate } = await synthesize(item.term, voice)
    const supabase = getSupabase()
    const path = `${lessonId}/${item.id}-${crypto.randomUUID().slice(0, 8)}.wav`
    const previous = await supabase.from('lesson_items').select('audio_url').eq('id', item.id).maybeSingle()
    if (!previous.data) return // The word was deleted meanwhile.
    const uploaded = await supabase.storage
      .from('lesson-audio')
      .upload(path, new Blob([encodeWav16(samples, rate)], { type: 'audio/wav' }), { contentType: 'audio/wav', upsert: false })
    if (uploaded.error) throw new Error(uploaded.error.message)
    const saved = await supabase.from('lesson_items').update({ audio_url: path, audio_source: `kokoro:${voice}` }).eq('id', item.id)
    if (saved.error) {
      await supabase.storage.from('lesson-audio').remove([path])
      throw new Error(saved.error.message)
    }
    await releaseAudio([(previous.data as { audio_url: string | null }).audio_url])
    voicedListeners.forEach((listener) => listener(item.id))
  } catch {
    update({ failed: new Set(state.failed).add(item.id) })
  } finally {
    setQueued(item.id, -1)
  }
}
