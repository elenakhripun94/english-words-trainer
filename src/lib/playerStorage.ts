import { createQueue, type QueueState } from './queue'

function key(token: string, exercise: string) {
  return `ewt-play:${token}:${exercise}`
}

export function loadQueue(token: string, exercise: string, itemIds: string[]): QueueState {
  try {
    const raw = localStorage.getItem(key(token, exercise))
    if (raw) {
      const saved = JSON.parse(raw) as QueueState
      const known = new Set(itemIds)
      const queue = saved.queue.filter((id) => known.has(id))
      if (queue.length > 0 || Object.keys(saved.firstTry).length > 0) {
        return { ...saved, queue }
      }
    }
  } catch {
    // Ignore a broken save and start over.
  }
  return createQueue(itemIds)
}

export function saveQueue(token: string, exercise: string, state: QueueState) {
  localStorage.setItem(key(token, exercise), JSON.stringify(state))
}

export function clearQueue(token: string, exercise: string) {
  localStorage.removeItem(key(token, exercise))
}
