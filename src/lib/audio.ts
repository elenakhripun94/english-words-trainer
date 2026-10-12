import { supabaseUrl } from './env'
import { getSupabase } from './supabase'

/** Kokoro voices offered to the teacher: the best-rated ones per accent and gender. */
export const VOICES = [
  { id: 'af_heart', label: '🇺🇸 женский' },
  { id: 'am_michael', label: '🇺🇸 мужской' },
  { id: 'bf_emma', label: '🇬🇧 женский' },
  { id: 'bm_george', label: '🇬🇧 мужской' },
] as const

export type VoiceId = (typeof VOICES)[number]['id']

export const DEFAULT_VOICE: VoiceId = 'af_heart'

const VOICE_KEY = 'ewt-voice'

export function preferredVoice(): VoiceId {
  try {
    const saved = localStorage.getItem(VOICE_KEY)
    if (VOICES.some((voice) => voice.id === saved)) return saved as VoiceId
  } catch {
    // Storage can be blocked; the default voice is fine.
  }
  return DEFAULT_VOICE
}

export function setPreferredVoice(voice: VoiceId) {
  try {
    localStorage.setItem(VOICE_KEY, voice)
  } catch {
    // Not remembered this time.
  }
}

/** 'kokoro:af_heart' → 'af_heart'. */
export function voiceOf(source: string | null | undefined): VoiceId | null {
  const id = source?.startsWith('kokoro:') ? source.slice('kokoro:'.length) : null
  return VOICES.some((voice) => voice.id === id) ? (id as VoiceId) : null
}

/** A stored file is a path in the lesson-audio bucket; a dictionary recording is a full URL. */
export function resolveAudioUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^(https?:)?\/\//.test(path)) return path
  const base = supabaseUrl()
  if (!base) return null
  return `${base}/storage/v1/object/public/lesson-audio/${path}`
}

/** Deletes stored audio no lesson item points to any more. A copied lesson shares files with the original. */
export async function releaseAudio(paths: Array<string | null | undefined>) {
  const candidates = [...new Set(paths.filter((path): path is string => Boolean(path) && !/^(https?:)?\/\//.test(path ?? '')))]
  if (candidates.length === 0) return
  const supabase = getSupabase()
  const { data, error } = await supabase.from('lesson_items').select('audio_url').in('audio_url', candidates)
  if (error) return
  const used = new Set(((data ?? []) as Array<{ audio_url: string }>).map((row) => row.audio_url))
  const unused = candidates.filter((path) => !used.has(path))
  if (unused.length) await supabase.storage.from('lesson-audio').remove(unused)
}
