import type { ExerciseSettings, ExerciseType } from '../../lib/exercises'
import { resolveImageUrl } from '../../lib/images'
import type { AnswerPayload } from '../../lib/outbox'
import { getSupabase } from '../../lib/supabase'

export type PlayerItem = {
  id: string
  term: string
  phonetic: string | null
  audioUrl: string | null
  imageUrl: string | null
  translation: string | null
  imageAuthor: string | null
  imageLicense: string | null
  imageSourceUrl: string | null
}

export type PlayerExercise = {
  type: ExerciseType
  position: number
  settings: ExerciseSettings
  available: boolean
}

export type PlayerProgress = {
  exercise: ExerciseType
  completed_at: string | null
  unsupported: boolean
}

export type PlayerAssignment = {
  studentName: string
  lesson: { title: string; topic: string | null; description: string | null; level: string | null }
  items: PlayerItem[]
  exercises: PlayerExercise[]
  progress: PlayerProgress[]
}

export async function fetchAssignment(token: string): Promise<PlayerAssignment> {
  const { data, error } = await getSupabase().rpc('get_assignment', { p_token: token })
  if (error) throw new Error(error.message)
  const raw = data as {
    student_name: string
    lesson: PlayerAssignment['lesson']
    items: Array<{
      id: string
      term: string
      phonetic: string | null
      audio_url: string | null
      image_url: string | null
      translation: string | null
      image_author: string | null
      image_license: string | null
      image_source_url: string | null
    }>
    exercises: PlayerExercise[]
    progress: PlayerProgress[]
  }
  return {
    studentName: raw.student_name,
    lesson: raw.lesson,
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      term: item.term,
      phonetic: item.phonetic,
      audioUrl: item.audio_url,
      imageUrl: resolveImageUrl(item.image_url),
      translation: item.translation,
      imageAuthor: item.image_author,
      imageLicense: item.image_license,
      imageSourceUrl: item.image_source_url,
    })),
    exercises: raw.exercises ?? [],
    progress: raw.progress ?? [],
  }
}

export async function sendAnswer(token: string, payload: AnswerPayload): Promise<boolean | null> {
  const { data, error } = await getSupabase().rpc('submit_answer', {
    p_token: token,
    p_exercise: payload.exercise,
    p_item_id: payload.itemId,
    p_chosen_item_id: payload.chosenItemId ?? null,
    p_answer_text: payload.answerText ?? null,
    p_skipped: payload.skipped ?? false,
    p_duration_ms: payload.durationMs ?? null,
  })
  if (error) throw new Error(error.message)
  return data as boolean | null
}

export async function sendComplete(token: string, exercise: ExerciseType, unsupported = false) {
  const { error } = await getSupabase().rpc('complete_exercise', {
    p_token: token,
    p_exercise: exercise,
    p_unsupported: unsupported,
  })
  if (error) throw new Error(error.message)
}
