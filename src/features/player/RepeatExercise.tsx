import { useEffect, useRef, useState } from 'react'
import { ru } from '../../i18n/ru'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'
import { BigButton, KidsFeedback, SoundButton, sayWord } from './kids'

const MAX_RECORDING_MS = 3000

/** Listen, say it, hear yourself. Nothing is graded and the recording never leaves the device. */
export function RepeatExercise({
  token,
  items,
  practice,
  onExit,
  onFinish,
}: {
  token: string
  items: PlayerItem[]
  practice: boolean
  onExit: () => void
  onFinish: (mistakeIds: string[]) => void
}) {
  return (
    <ExerciseShell token={token} exercise="repeat" items={items} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <Body key={`${ctx.item.id}:${ctx.turn}`} ctx={ctx} />}
    </ExerciseShell>
  )
}

function canRecord() {
  return typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

function Body({ ctx }: { ctx: ShellContext }) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded' | 'blocked'>(canRecord() ? 'idle' : 'blocked')
  const [recording, setRecording] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | null>(null)
  const answered = ctx.phase === 'feedback'

  useEffect(() => {
    void sayWord(ctx.item)
  }, [ctx.item])

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
    },
    [],
  )

  useEffect(() => () => {
    if (recording) URL.revokeObjectURL(recording)
  }, [recording])

  async function record() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const media = new MediaRecorder(stream)
      const chunks: Blob[] = []
      media.ondataavailable = (event) => chunks.push(event.data)
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const url = URL.createObjectURL(new Blob(chunks, { type: media.mimeType }))
        setRecording(url)
        setState('recorded')
        void new Audio(url).play().catch(() => undefined)
      }
      recorder.current = media
      media.start()
      setState('recording')
      timer.current = window.setTimeout(stop, MAX_RECORDING_MS)
    } catch {
      setState('blocked')
    }
  }

  function stop() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  return (
    <div className="text-center">
      {ctx.item.imageUrl && (
        <img src={ctx.item.imageUrl} alt="" className="mx-auto aspect-square w-full max-w-xs rounded-3xl bg-white object-contain p-2" />
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <SoundButton item={ctx.item} />
        {state === 'recording' ? (
          <BigButton label={ru.kids.stop} tone="bad" className="animate-pulse" onClick={stop}>
            ⏹️
          </BigButton>
        ) : state === 'blocked' ? (
          <span className="text-5xl opacity-40" role="img" aria-label={ru.player.unsupportedTitle}>
            🎤🚫
          </span>
        ) : (
          <BigButton label={ru.kids.record} tone="soft" disabled={answered} onClick={() => void record()}>
            🎤
          </BigButton>
        )}
        {recording && state === 'recorded' && (
          <BigButton label={ru.kids.myVoice} tone="soft" onClick={() => void new Audio(recording).play().catch(() => undefined)}>
            🗣️
          </BigButton>
        )}
      </div>
      {(state === 'recorded' || state === 'blocked') && (
        <div className="mt-6">
          <BigButton
            label={ru.kids.next}
            disabled={answered || sent}
            onClick={() => {
              setSent(true)
              ctx.submit(true)
            }}
          >
            ➡️
          </BigButton>
        </div>
      )}
      {answered && <KidsFeedback correct item={ctx.item} onDone={ctx.next} />}
    </div>
  )
}
