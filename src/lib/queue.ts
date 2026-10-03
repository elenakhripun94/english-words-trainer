export type QueueState = {
  queue: string[]
  phase: 'question' | 'feedback'
  lastCorrect: boolean | null
  pendingSkip: boolean
  firstTry: Record<string, boolean>
}

export function createQueue(ids: string[]): QueueState {
  return {
    queue: ids,
    phase: 'question',
    lastCorrect: null,
    pendingSkip: false,
    firstTry: {},
  }
}

export function submitCurrent(state: QueueState, correct: boolean, skip = false): QueueState {
  const current = state.queue[0]
  if (!current || state.phase !== 'question') return state
  const firstTry = { ...state.firstTry }
  if (!(current in firstTry)) firstTry[current] = correct && !skip
  return {
    ...state,
    phase: 'feedback',
    lastCorrect: skip ? null : correct,
    pendingSkip: skip,
    firstTry,
  }
}

export function confirmFeedback(state: QueueState): QueueState {
  if (state.phase !== 'feedback' || state.queue.length === 0) return state
  const [current, ...rest] = state.queue
  const remove = state.lastCorrect === true || state.pendingSkip
  return {
    ...state,
    queue: remove ? rest : [...rest, current],
    phase: 'question',
    lastCorrect: null,
    pendingSkip: false,
  }
}

export function isFinished(state: QueueState): boolean {
  return state.queue.length === 0
}
