import { useMemo, useState } from 'react'
import { cx } from '../../lib/cx'
import type { ExerciseSettings } from '../../lib/exercises'
import { scramble } from '../../lib/kidsRounds'
import { rngFromSeed } from '../../lib/shuffle'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'
import { KidsFeedback } from './kids'

const GRIDS: Record<number, { cols: number; rows: number }> = {
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
}

export function PuzzleExercise({
  token,
  items,
  settings,
  practice,
  onExit,
  onFinish,
}: {
  token: string
  items: PlayerItem[]
  settings: ExerciseSettings
  practice: boolean
  onExit: () => void
  onFinish: (mistakeIds: string[]) => void
}) {
  return (
    <ExerciseShell token={token} exercise="puzzle" items={items} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <Body key={`${ctx.item.id}:${ctx.turn}`} token={token} settings={settings} ctx={ctx} />}
    </ExerciseShell>
  )
}

function Body({ token, settings, ctx }: { token: string; settings: ExerciseSettings; ctx: ShellContext }) {
  const grid = GRIDS[settings.pieces ?? 4] ?? GRIDS[4]
  const count = grid.cols * grid.rows
  const initial = useMemo(() => scramble(count, rngFromSeed(`${token}:puzzle:${ctx.item.id}`)), [count, ctx.item.id, token])
  const [order, setOrder] = useState(initial)
  const [selected, setSelected] = useState<number | null>(null)
  const solved = order.every((piece, index) => piece === index)
  const answered = ctx.phase === 'feedback'

  function tap(slot: number) {
    if (answered || solved) return
    if (selected === null) {
      setSelected(slot)
      return
    }
    const next = [...order]
    ;[next[selected], next[slot]] = [next[slot], next[selected]]
    setOrder(next)
    setSelected(null)
    if (next.every((piece, index) => piece === index)) ctx.submit(true)
  }

  return (
    <div>
      <div
        className="mx-auto grid aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-white"
        style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)`, gridTemplateRows: `repeat(${grid.rows}, 1fr)` }}
      >
        {order.map((piece, slot) => {
          const col = piece % grid.cols
          const row = Math.floor(piece / grid.cols)
          return (
            <button
              key={piece}
              type="button"
              aria-pressed={selected === slot}
              disabled={answered}
              onClick={() => tap(slot)}
              className={cx(
                'relative overflow-hidden outline outline-1 outline-white disabled:cursor-default',
                selected === slot && 'z-10 outline-4 outline-accent',
              )}
            >
              {ctx.item.imageUrl && (
                <img
                  src={ctx.item.imageUrl}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none object-cover"
                  style={{
                    width: `${grid.cols * 100}%`,
                    height: `${grid.rows * 100}%`,
                    left: `${-col * 100}%`,
                    top: `${-row * 100}%`,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
      {answered && <KidsFeedback correct item={ctx.item} onDone={ctx.next} />}
    </div>
  )
}
