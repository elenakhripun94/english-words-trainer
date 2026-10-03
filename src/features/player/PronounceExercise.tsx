import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { normalizeAnswer } from '../../lib/answers'
import type { ExerciseSettings } from '../../lib/exercises'
import { buildStudentLink } from '../../lib/links'
import { clearQueue, loadQueue, saveQueue } from '../../lib/playerStorage'
import { confirmFeedback, createQueue, isFinished, submitCurrent } from '../../lib/queue'
import { isRecognitionSupported, listen } from '../../lib/recognition'
import { seededShuffle } from '../../lib/shuffle'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { deliverAnswer, deliverComplete } from './sync'

const micKey = 'ewt-mic-explained'

export function PronounceExercise({
  token,
  items,
  settings,
  practice,
  onExit,
  onFinish,
  onUnsupported,
}: {
  token: string
  items: PlayerItem[]
  settings: ExerciseSettings
  practice: boolean
  onExit: () => void
  onFinish: (mistakeIds: string[]) => void
  onUnsupported: () => void
}) {
  const [supported] = useState(isRecognitionSupported)
  const [explained, setExplained] = useState(() => localStorage.getItem(micKey) === '1')
  const [blocked, setBlocked] = useState(false)

  if (!supported || blocked) {
    return (
      <div className="grid gap-3">
        <h2 className="font-serif text-3xl">{ru.player.unsupportedTitle}</h2>
        <p>{ru.player.unsupportedBody}</p>
        <Button
          onClick={() => {
            if (!practice) void deliverComplete(token, 'pronounce', true, false)
            onUnsupported()
          }}
        >
          {ru.player.skipExercise}
        </Button>
        <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(buildStudentLink(locationHashToken()))}>
          {ru.player.copyLink}
        </Button>
      </div>
    )
  }

  if (!explained) {
    return (
      <div className="grid gap-3">
        <h2 className="font-serif text-3xl">{ru.exercises.names.pronounce}</h2>
        <p>{ru.player.micExplain}</p>
        <Button
          onClick={() => {
            localStorage.setItem(micKey, '1')
            setExplained(true)
          }}
        >
          {ru.player.micStart}
        </Button>
        <Button variant="ghost" onClick={onExit}>
          {ru.player.toList}
        </Button>
      </div>
    )
  }

  return (
    <PronounceRun
      token={token}
      items={items}
      maxTries={settings.maxTries ?? 3}
      practice={practice}
      onExit={onExit}
      onFinish={onFinish}
      onBlocked={() => setBlocked(true)}
    />
  )
}

function PronounceRun({
  token,
  items,
  maxTries,
  practice,
  onExit,
  onFinish,
  onBlocked,
}: {
  token: string
  items: PlayerItem[]
  maxTries: number
  practice: boolean
  onExit: () => void
  onFinish: (mistakeIds: string[]) => void
  onBlocked: () => void
}) {
  const storageKey = practice ? 'pronounce:practice' : 'pronounce'
  const [state, setState] = useState(() =>
    loadQueue(token, storageKey, seededShuffle(items, `${token}:pronounce`).map((item) => item.id)),
  )
  const [tries, setTries] = useState(0)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const item = items.find((candidate) => candidate.id === state.queue[0])

  useEffect(() => setTries(0), [item?.id])

  if (!item) return null

  async function recognize() {
    if (!item) return
    const current = item
    setListening(true)
    setHeard(null)
    try {
      const alternatives = await listen()
      const match = alternatives.find((alternative) => normalizeAnswer(alternative) === normalizeAnswer(current.term))
      const best = match ?? alternatives[0] ?? ''
      const correct = Boolean(match)
      setHeard(best)
      setTries((value) => value + 1)
      await deliverAnswer(
        token,
        { exercise: 'pronounce', itemId: current.id, answerText: best, durationMs: null },
        practice,
      )
      if (correct) {
        const marked = submitCurrent(state, true, false)
        const updated = confirmFeedback(marked)
        if (isFinished(updated)) {
          clearQueue(token, storageKey)
          if (!practice) await deliverComplete(token, 'pronounce', false, false)
          onFinish(Object.entries(updated.firstTry).filter(([, ok]) => !ok).map(([id]) => id))
          return
        }
        saveQueue(token, storageKey, updated)
        setState(updated)
      } else if (!(current.id in state.firstTry)) {
        const marked = submitCurrent(createQueue([current.id]), false, false)
        const updated = { ...state, firstTry: { ...state.firstTry, ...marked.firstTry } }
        saveQueue(token, storageKey, updated)
        setState(updated)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'not-allowed' || message === 'service-not-allowed') onBlocked()
    } finally {
      setListening(false)
    }
  }

  async function skip() {
    await deliverAnswer(token, { exercise: 'pronounce', itemId: item!.id, skipped: true }, practice)
    const marked = submitCurrent({ ...state, phase: 'question' }, false, true)
    const updated = confirmFeedback(marked)
    if (isFinished(updated)) {
      clearQueue(token, storageKey)
      if (!practice) await deliverComplete(token, 'pronounce', false, false)
      onFinish(Object.entries(updated.firstTry).filter(([, ok]) => !ok).map(([id]) => id))
      return
    }
    saveQueue(token, storageKey, updated)
    setState(updated)
  }

  return (
    <div className="text-center">
      <Button variant="ghost" onClick={onExit}>
        ← {ru.player.toList}
      </Button>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="mx-auto mt-4 aspect-square w-full max-w-xs rounded-3xl object-cover" />}
      <p className="mt-4 font-serif text-4xl">{item.term}</p>
      <Button className="mt-3" variant="ghost" onClick={() => void playTerm(item.term, item.audioUrl)}>
        {ru.player.sample}
      </Button>
      <Button className="mt-4 w-full py-4 text-lg" onClick={() => void recognize()} disabled={listening}>
        {listening ? ru.player.speak : ru.exercises.names.pronounce}
      </Button>
      {heard && (
        <p className="mt-3 text-muted" aria-live="polite">
          {ru.player.heard}: {heard}
        </p>
      )}
      {tries >= maxTries && (
        <Button className="mt-3" variant="ghost" onClick={() => void skip()}>
          {ru.player.skipWord}
        </Button>
      )}
    </div>
  )
}

function locationHashToken() {
  const match = window.location.hash.match(/\/s\/([^/?#]+)/)
  return match?.[1] ?? ''
}
