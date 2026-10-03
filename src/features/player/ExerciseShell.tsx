import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import type { ExerciseType } from '../../lib/exercises'
import { normalizeAnswer } from '../../lib/answers'
import { clearQueue, loadQueue, saveQueue } from '../../lib/playerStorage'
import { confirmFeedback, isFinished, submitCurrent, type QueueState } from '../../lib/queue'
import { seededShuffle } from '../../lib/shuffle'
import type { PlayerItem } from './api'
import { deliverAnswer, deliverComplete } from './sync'

export type FinishStats = {
  kind: 'score'
  correct: number
  total: number
  mistakeIds: string[]
}

export type ShellContext = {
  item: PlayerItem
  phase: 'question' | 'feedback'
  correct: boolean | null
  almost: boolean
  heard: string | null
  left: number
  total: number
  submitChoice: (chosenId: string) => void
  submitText: (text: string, almost: boolean) => void
  submitSkip: () => void
  next: () => void
}

export function ExerciseShell({
  token,
  exercise,
  items,
  practice,
  onExit,
  onFinish,
  children,
}: {
  token: string
  exercise: ExerciseType
  items: PlayerItem[]
  practice: boolean
  onExit: () => void
  onFinish: (stats: FinishStats) => void
  children: (ctx: ShellContext) => ReactNode
}) {
  const storageKey = practice ? `${exercise}:practice` : exercise
  const [state, setState] = useState<QueueState>(() =>
    loadQueue(
      token,
      storageKey,
      seededShuffle(items, `${token}:${exercise}`).map((item) => item.id),
    ),
  )
  const [almost, setAlmost] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const reported = useRef(false)
  const started = useRef(performance.now())
  const item = items.find((candidate) => candidate.id === state.queue[0])

  useEffect(() => {
    if (state.phase === 'question') started.current = performance.now()
  }, [state.queue, state.phase])

  useEffect(() => {
    const next = items.find((candidate) => candidate.id === state.queue[1])
    if (!next?.imageUrl) return
    const image = new Image()
    image.src = next.imageUrl
  }, [items, state.queue])

  useEffect(() => {
    if (item || reported.current || !isFinished(state)) return
    reported.current = true
    clearQueue(token, storageKey)
    onFinish(toStats(state))
  }, [item, onFinish, state, storageKey, token])

  async function commit(localCorrect: boolean, extra: { chosenId?: string; text?: string; skip?: boolean; heard?: string; almost?: boolean }) {
    if (!item || state.phase !== 'question') return
    const server = await deliverAnswer(
      token,
      {
        exercise,
        itemId: item.id,
        chosenItemId: extra.chosenId ?? null,
        answerText: extra.text ?? extra.heard ?? null,
        skipped: Boolean(extra.skip),
        durationMs: Math.round(performance.now() - started.current),
      },
      practice,
    )
    const correct = extra.skip ? false : server ?? localCorrect
    setAlmost(Boolean(extra.almost) && !correct)
    setHeard(extra.heard ?? null)
    const next = submitCurrent(state, correct, Boolean(extra.skip))
    setState(next)
    saveQueue(token, storageKey, next)
  }

  function next() {
    const updated = confirmFeedback(state)
    setAlmost(false)
    setHeard(null)
    if (isFinished(updated)) {
      if (reported.current) return
      reported.current = true
      clearQueue(token, storageKey)
      if (!practice) void deliverComplete(token, exercise, false, false)
      onFinish(toStats(updated))
      return
    }
    saveQueue(token, storageKey, updated)
    setState(updated)
  }

  if (!item) return null
  const total = new Set([...state.queue, ...Object.keys(state.firstTry)]).size
  const pending = state.phase === 'feedback' && (state.lastCorrect || state.pendingSkip) ? 1 : 0
  const left = Math.max(state.queue.length - pending, 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onExit}>
          ← {ru.player.toList}
        </Button>
        <p className="text-sm text-muted">
          {ru.player.left}: {left}
        </p>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent" style={{ width: `${total === 0 ? 0 : ((total - left) / total) * 100}%` }} />
      </div>
      {children({
        item,
        phase: state.phase,
        correct: state.lastCorrect,
        almost,
        heard,
        left,
        total,
        submitChoice: (chosenId) => void commit(chosenId === item.id, { chosenId }),
        submitText: (text, isAlmost) =>
          void commit(normalizeAnswer(text) === normalizeAnswer(item.term), { text, almost: isAlmost }),
        submitSkip: () => void commit(false, { skip: true }),
        next,
      })}
    </div>
  )
}

function toStats(state: QueueState): FinishStats {
  const entries = Object.entries(state.firstTry)
  return {
    kind: 'score',
    correct: entries.filter(([, ok]) => ok).length,
    total: entries.length,
    mistakeIds: entries.filter(([, ok]) => !ok).map(([id]) => id),
  }
}
