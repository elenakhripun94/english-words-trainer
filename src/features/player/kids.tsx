import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { cx } from '../../lib/cx'
import { PICTURE_EXERCISES, type ExerciseType } from '../../lib/exercises'
import { playError, playSuccess } from '../../lib/sfx'
import { playTerm, sayRu } from '../../lib/speech'
import type { PlayerItem } from './api'

/** Lesson-wide mode: true when students cannot read yet. */
export const NoTextContext = createContext(false)

export function useNoText() {
  return useContext(NoTextContext)
}

export const EXERCISE_ICONS: Record<ExerciseType, string> = {
  memorize: '👀',
  pick_word: '🔤',
  pick_image: '👂',
  match_pairs: '🃏',
  pick_translation: '🌍',
  spell: '🧩',
  dictation: '✍️',
  pronounce: '🗣️',
  listen_find: '👂',
  memory_images: '🃏',
  true_false: '👍',
  feed: '🐻',
  balloons: '🎈',
  whats_missing: '🙈',
  shadow: '🌑',
  sort_groups: '📦',
  puzzle: '🧩',
  repeat: '🎤',
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

/** Plays a word, but never waits forever: some browsers do not report the end of speech. */
export function sayWord(item: Pick<PlayerItem, 'term' | 'audioUrl'>) {
  return Promise.race([playTerm(item.term, item.audioUrl), wait(3000)])
}

/** Start screen of an exercise: the instruction is read aloud, the child presses a big button. */
export function IntroGate({ exercise, onExit, children }: { exercise: ExerciseType; onExit: () => void; children: ReactNode }) {
  const noText = useNoText()
  const needed = noText || PICTURE_EXERCISES.has(exercise)
  const [started, setStarted] = useState(!needed)
  const prompt = ru.kids.prompts[exercise]

  useEffect(() => {
    if (!started && prompt) void sayRu(prompt)
  }, [prompt, started])

  if (started) return <>{children}</>
  return (
    <div className="text-center">
      <HomeButton onExit={onExit} />
      <p className="mt-6 text-8xl" aria-hidden="true">
        {EXERCISE_ICONS[exercise]}
      </p>
      {!noText && <h1 className="mt-4 font-serif text-3xl">{ru.exercises.names[exercise]}</h1>}
      {!noText && prompt && <p className="mt-2 text-lg text-muted">{prompt}</p>}
      <div className="mt-8 flex items-center justify-center gap-4">
        {prompt && (
          <BigButton label={ru.kids.listen} tone="soft" onClick={() => void sayRu(prompt)}>
            🔊
          </BigButton>
        )}
        <BigButton label={ru.kids.start} onClick={() => setStarted(true)}>
          ▶️
        </BigButton>
      </div>
    </div>
  )
}

export function HomeButton({ onExit }: { onExit: () => void }) {
  const noText = useNoText()
  return (
    <div className="text-left">
      <Button variant="ghost" aria-label={ru.kids.home} onClick={onExit}>
        {noText ? <span className="text-2xl">🏠</span> : `← ${ru.player.toList}`}
      </Button>
    </div>
  )
}

export function BigButton({
  label,
  tone = 'primary',
  className,
  children,
  ...props
}: {
  label: string
  tone?: 'primary' | 'soft' | 'good' | 'bad'
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-24 w-24 items-center justify-center rounded-full text-5xl shadow-md transition active:scale-95 disabled:opacity-50',
        tone === 'primary' && 'bg-accent text-white',
        tone === 'soft' && 'bg-accent-soft',
        tone === 'good' && 'bg-good-bg ring-4 ring-good/40',
        tone === 'bad' && 'bg-bad-bg ring-4 ring-bad/40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function SoundButton({ item, small = false }: { item: Pick<PlayerItem, 'term' | 'audioUrl'>; small?: boolean }) {
  return (
    <BigButton label={ru.kids.listen} tone="soft" className={small ? 'h-16 w-16 text-3xl' : undefined} onClick={() => void sayWord(item)}>
      🔊
    </BigButton>
  )
}

/**
 * Reaction to an answer: a sound, a big sign, the right word aloud, then the next question.
 * No reading and no «Дальше» button needed.
 */
export function KidsFeedback({ correct, item, onDone }: { correct: boolean; item: PlayerItem; onDone: () => void }) {
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (correct) playSuccess()
      else playError()
      await wait(450)
      if (cancelled) return
      await sayWord(item)
      await wait(correct ? 400 : 900)
      if (!cancelled) done.current()
    })()
    return () => {
      cancelled = true
    }
  }, [correct, item])

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center" aria-live="polite">
      <span className="pop-in rounded-full bg-card/90 p-6 text-8xl shadow-xl" role="img" aria-label={correct ? ru.player.correct : ru.player.wrong}>
        {correct ? '🌟' : '🤔'}
      </span>
    </div>
  )
}

/** A picture to tap. Shows green or red after the answer. */
export function PictureOption({
  item,
  state,
  disabled,
  className,
  style,
  onClick,
}: {
  item: PlayerItem
  state: 'idle' | 'right' | 'wrong'
  disabled?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={style}
      aria-label={item.term}
      className={cx(
        'overflow-hidden rounded-3xl border-4 bg-white p-1 transition disabled:cursor-default',
        state === 'right' && 'border-good',
        state === 'wrong' && 'shake border-bad',
        state === 'idle' && 'border-line hover:border-accent',
        className,
      )}
    >
      {item.imageUrl && <img src={item.imageUrl} alt="" draggable={false} className="aspect-square w-full rounded-2xl object-contain" />}
    </button>
  )
}

/**
 * Something a child can drag onto a drop zone (any element with data-drop) or simply tap.
 */
export function Draggable({
  disabled,
  onDrop,
  onTap,
  className,
  children,
}: {
  disabled?: boolean
  onDrop: (target: string) => void
  onTap?: () => void
  className?: string
  children: ReactNode
}) {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className={cx('touch-none select-none', offset ? 'relative z-30 cursor-grabbing' : 'cursor-grab', className)}
      style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px) scale(1.05)` } : undefined}
      onPointerDown={(event) => {
        if (disabled) return
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        start.current = { x: event.clientX, y: event.clientY }
        setOffset({ x: 0, y: 0 })
      }}
      onPointerMove={(event) => {
        if (!start.current) return
        setOffset({ x: event.clientX - start.current.x, y: event.clientY - start.current.y })
      }}
      onPointerUp={(event) => {
        if (!start.current) return
        const moved = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y)
        start.current = null
        setOffset(null)
        if (moved < 10) {
          onTap?.()
          return
        }
        const zone = document
          .elementsFromPoint(event.clientX, event.clientY)
          .map((element) => (element as HTMLElement).closest<HTMLElement>('[data-drop]'))
          .find(Boolean)
        if (zone?.dataset.drop) onDrop(zone.dataset.drop)
      }}
      onPointerCancel={() => {
        start.current = null
        setOffset(null)
      }}
    >
      {children}
    </div>
  )
}
