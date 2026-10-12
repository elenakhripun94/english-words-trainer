import { useEffect, useMemo, useState } from 'react'
import { categoryById } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { categoriesOf } from '../../lib/exercises'
import { boxesFor } from '../../lib/kidsRounds'
import { rngFromSeed } from '../../lib/shuffle'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'
import { Draggable, KidsFeedback, sayWord, useNoText } from './kids'

/** Only words with a group take part. */
export function SortGroupsExercise({
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
  const grouped = useMemo(() => items.filter((item) => (item.category ?? '').trim()), [items])
  return (
    <ExerciseShell token={token} exercise="sort_groups" items={grouped} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <Body key={`${ctx.item.id}:${ctx.turn}`} token={token} items={grouped} ctx={ctx} />}
    </ExerciseShell>
  )
}

function Body({ token, items, ctx }: { token: string; items: PlayerItem[]; ctx: ShellContext }) {
  const noText = useNoText()
  const target = ctx.item.category ?? ''
  const boxes = useMemo(
    () => boxesFor(categoriesOf(items), target, rngFromSeed(`${token}:sort_groups:${ctx.item.id}:${ctx.turn}`)),
    [ctx.item.id, ctx.turn, items, target, token],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const answered = ctx.phase === 'feedback'

  useEffect(() => {
    void sayWord(ctx.item)
  }, [ctx.item])

  function put(box: string) {
    if (answered || picked) return
    setPicked(box)
    ctx.submit(box === target, { text: box })
  }

  return (
    <div className="text-center">
      <Draggable disabled={answered} onTap={() => void sayWord(ctx.item)} onDrop={put} className="mx-auto w-44">
        {ctx.item.imageUrl && (
          <img
            src={ctx.item.imageUrl}
            alt={ctx.item.term}
            draggable={false}
            className={cx('aspect-square w-full rounded-3xl border-4 bg-white object-contain p-1', answered && picked !== target ? 'shake border-bad' : 'border-line')}
          />
        )}
      </Draggable>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {boxes.map((box) => {
          const category = categoryById(box)
          return (
            <button
              key={box}
              type="button"
              data-drop={box}
              disabled={answered}
              onClick={() => put(box)}
              aria-label={category?.label ?? box}
              className={cx(
                'flex min-h-32 flex-col items-center justify-center rounded-3xl border-4 bg-[#f6e7cf] p-3 disabled:cursor-default',
                answered && box === target ? 'border-good' : answered && box === picked ? 'border-bad' : 'border-[#d9b98b]',
              )}
            >
              <span className="text-6xl" aria-hidden="true">
                {category?.emoji ?? '📦'}
              </span>
              {!noText && <span className="mt-1 font-semibold">{category?.label ?? box}</span>}
            </button>
          )
        })}
      </div>
      {answered && <KidsFeedback correct={Boolean(ctx.correct)} item={ctx.item} onDone={ctx.next} />}
    </div>
  )
}
