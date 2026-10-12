/// <reference lib="webworker" />
// Kokoro runs here so the editor does not freeze while a word is being voiced.
import { KokoroTTS } from 'kokoro-js'

export type TtsRequest = { id: number; text: string; voice: string }
export type TtsMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'done'; id: number; samples: Float32Array; rate: number }
  | { type: 'error'; id: number; message: string }

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const files = new Map<string, { loaded: number; total: number }>()
let model: Promise<KokoroTTS> | null = null

function post(message: TtsMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

function load() {
  model ??= KokoroTTS.from_pretrained(MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (event: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (event.status !== 'progress' || !event.file || !event.total) return
      files.set(event.file, { loaded: event.loaded ?? 0, total: event.total })
      let loaded = 0
      let total = 0
      for (const file of files.values()) {
        loaded += file.loaded
        total += file.total
      }
      post({ type: 'progress', loaded, total })
    },
  }).then((tts) => {
    post({ type: 'ready' })
    return tts
  })
  model.catch(() => {
    model = null
  })
  return model
}

// Requests are handled one by one: the main thread waits for each answer before sending the next.
self.onmessage = async (event: MessageEvent<TtsRequest>) => {
  const { id, text, voice } = event.data
  try {
    const tts = await load()
    const audio = await tts.generate(text, { voice: voice as never })
    const samples = audio.audio as Float32Array
    post({ type: 'done', id, samples, rate: audio.sampling_rate }, [samples.buffer])
  } catch (error) {
    post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) })
  }
}
