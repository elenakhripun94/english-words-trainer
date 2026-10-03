import type { ExerciseType } from './exercises'

export type AnswerPayload = {
  exercise: ExerciseType
  itemId: string
  chosenItemId?: string | null
  answerText?: string | null
  skipped?: boolean
  durationMs?: number | null
}

export type OutboxEntry =
  | { kind: 'answer'; payload: AnswerPayload }
  | { kind: 'complete'; payload: { exercise: ExerciseType; unsupported?: boolean } }

function key(token: string) {
  return `ewt-outbox:${token}`
}

export function readOutbox(token: string): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(key(token))
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : []
  } catch {
    return []
  }
}

export function writeOutbox(token: string, entries: OutboxEntry[]) {
  localStorage.setItem(key(token), JSON.stringify(entries))
}

export function enqueueOutbox(token: string, entry: OutboxEntry) {
  writeOutbox(token, [...readOutbox(token), entry])
}
