import { enqueueOutbox, readOutbox, writeOutbox, type OutboxEntry } from '../../lib/outbox'
import { sendAnswer, sendComplete } from './api'

export async function flushOutbox(token: string) {
  const entries = readOutbox(token)
  const left: OutboxEntry[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    try {
      if (entry.kind === 'answer') await sendAnswer(token, entry.payload)
      else await sendComplete(token, entry.payload.exercise, entry.payload.unsupported)
    } catch {
      left.push(...entries.slice(index))
      break
    }
  }
  writeOutbox(token, left)
}

export async function deliverAnswer(token: string, payload: Parameters<typeof sendAnswer>[1], practice: boolean) {
  if (practice) return null
  try {
    return await sendAnswer(token, payload)
  } catch {
    enqueueOutbox(token, { kind: 'answer', payload })
    return null
  }
}

export async function deliverComplete(token: string, exercise: Parameters<typeof sendComplete>[1], unsupported: boolean, practice: boolean) {
  if (practice) return
  try {
    await flushOutbox(token)
    await sendComplete(token, exercise, unsupported)
  } catch {
    enqueueOutbox(token, { kind: 'complete', payload: { exercise, unsupported } })
  }
}
