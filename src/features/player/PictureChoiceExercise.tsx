import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ru } from '../../i18n/ru'
import type { ExerciseSettings } from '../../lib/exercises'
import { buildQuestion } from '../../lib/questions'
import { rngFromSeed } from '../../lib/shuffle'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'
import { Draggable, KidsFeedback, PictureOption, SoundButton, sayWord } from './kids'

/** «Послушай и найди», «Найди по тени», «Покорми мишку», «Лопни шарик»: one asked word, several pictures. */
export type PictureChoiceMode = 'listen_find' | 'shadow' | 'feed' | 'balloons'

export function PictureChoiceExercise({
  mode,
  token,
  items,
  settings,
  practice,
  onExit,
  onFinish,
}: {
  mode: PictureChoiceMode
  token: string
  items: PlayerItem[]
  settings: ExerciseSettings
  practice: boolean
  onExit: () => void
  onFinish: (mistakeIds: string[]) => void
}) {
  return (
    <ExerciseShell token={token} exercise={mode} items={items} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <Body key={`${ctx.item.id}:${ctx.turn}`} mode={mode} token={token} items={items} settings={settings} ctx={ctx} />}
    </ExerciseShell>
  )
}

function Body({
  mode,
  token,
  items,
  settings,
  ctx,
}: {
  mode: PictureChoiceMode
  token: string
  items: PlayerItem[]
  settings: ExerciseSettings
  ctx: ShellContext
}) {
  const options = useMemo(
    () => buildQuestion(items, ctx.item.id, settings.options ?? (mode === 'balloons' ? 4 : 3), rngFromSeed(`${token}:${mode}:${ctx.item.id}:${ctx.turn}`)),
    [ctx.item.id, ctx.turn, items, mode, settings.options, token],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const answered = ctx.phase === 'feedback'

  useEffect(() => {
    // The shadow is a visual riddle: the word sounds only after the answer.
    if (mode !== 'shadow') void sayWord(ctx.item)
  }, [ctx.item, mode])

  function choose(id: string) {
    if (answered || picked) return
    setPicked(id)
    ctx.submitChoice(id)
  }

  function stateOf(id: string) {
    if (!answered) return 'idle' as const
    if (id === ctx.item.id) return 'right' as const
    return id === picked ? ('wrong' as const) : ('idle' as const)
  }

  const feedback = answered && <KidsFeedback correct={Boolean(ctx.correct)} item={ctx.item} onDone={ctx.next} />

  if (mode === 'balloons') {
    return (
      <div>
        <div className="mb-2 flex justify-center">
          <SoundButton item={ctx.item} small />
        </div>
        <div className="relative h-[62dvh] overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 to-sky-50">
          {options.map((option, index) => (
            <Balloon
              key={option.id}
              item={option}
              index={index}
              count={options.length}
              popped={answered && option.id === ctx.item.id && picked === option.id}
              wrong={stateOf(option.id) === 'wrong'}
              disabled={answered}
              onPick={() => choose(option.id)}
            />
          ))}
        </div>
        {feedback}
      </div>
    )
  }

  if (mode === 'feed') {
    const fed = answered && picked === ctx.item.id
    return (
      <div>
        <div className="mb-3 flex justify-center">
          <SoundButton item={ctx.item} small />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {options.map((option) =>
            fed && option.id === ctx.item.id ? (
              <span key={option.id} />
            ) : (
              <Draggable key={option.id} disabled={answered} onTap={() => choose(option.id)} onDrop={(zone) => zone === 'bear' && choose(option.id)}>
                <PictureOption item={option} state={stateOf(option.id)} disabled={answered} className="pointer-events-none w-full" />
              </Draggable>
            ),
          )}
        </div>
        <div
          data-drop="bear"
          className="mx-auto mt-6 flex h-44 w-44 items-center justify-center rounded-full border-4 border-dashed border-accent/40 bg-accent-soft text-8xl"
          role="img"
          aria-label={ru.exercises.names.feed}
        >
          {fed ? '😋' : answered ? '🙅' : '🐻'}
        </div>
        {feedback}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-center">
        {mode === 'shadow' && ctx.item.imageUrl ? (
          <img
            src={ctx.item.imageUrl}
            alt=""
            className={`aspect-square w-48 rounded-3xl bg-white object-contain p-2 transition ${answered ? '' : 'silhouette'}`}
          />
        ) : (
          <SoundButton item={ctx.item} />
        )}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3" aria-live="polite">
        {options.map((option) => (
          <PictureOption key={option.id} item={option} state={stateOf(option.id)} disabled={answered} onClick={() => choose(option.id)} />
        ))}
      </div>
      {feedback}
    </div>
  )
}

const BALLOON_COLORS = ['#f87171', '#60a5fa', '#facc15', '#4ade80', '#c084fc', '#fb923c']

function Balloon({
  item,
  index,
  count,
  popped,
  wrong,
  disabled,
  onPick,
}: {
  item: PlayerItem
  index: number
  count: number
  popped: boolean
  wrong: boolean
  disabled: boolean
  onPick: () => void
}) {
  const width = Math.min(30, 92 / count)
  const style = {
    left: `${(index + 0.5) * (100 / count) - width / 2}%`,
    width: `${width}%`,
    '--float-duration': `${8 + (index % 3) * 1.5}s`,
    '--float-delay': `${-index * 2.3}s`,
  } as CSSProperties
  return (
    <button
      type="button"
      className="balloon absolute flex flex-col items-center"
      style={style}
      disabled={disabled}
      aria-label={item.term}
      onClick={onPick}
    >
      {popped ? (
        <span className="pop-in text-7xl">💥</span>
      ) : (
        <>
          <span
            className={`block aspect-[4/5] w-full overflow-hidden rounded-[50%] border-4 p-2 shadow-lg ${wrong ? 'shake' : ''}`}
            style={{ borderColor: BALLOON_COLORS[index % BALLOON_COLORS.length], background: 'white' }}
          >
            {item.imageUrl && <img src={item.imageUrl} alt="" draggable={false} className="h-full w-full rounded-[50%] object-contain" />}
          </span>
          <span className="block h-10 w-px bg-ink/40" />
        </>
      )}
    </button>
  )
}
