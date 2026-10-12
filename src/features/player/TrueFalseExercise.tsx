import { useEffect, useMemo, useState } from 'react'
import { ru } from '../../i18n/ru'
import { pickSpoken } from '../../lib/kidsRounds'
import { rngFromSeed } from '../../lib/shuffle'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'
import { BigButton, KidsFeedback, sayWord } from './kids'

/** A picture and a word. Half of the time the word belongs to another picture. */
export function TrueFalseExercise({
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
    <ExerciseShell token={token} exercise="true_false" items={items} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <Body key={`${ctx.item.id}:${ctx.turn}`} token={token} items={items} ctx={ctx} />}
    </ExerciseShell>
  )
}

function Body({ token, items, ctx }: { token: string; items: PlayerItem[]; ctx: ShellContext }) {
  const spoken = useMemo(
    () => pickSpoken(items, ctx.item, rngFromSeed(`${token}:true_false:${ctx.item.id}:${ctx.turn}`)),
    [ctx.item, ctx.turn, items, token],
  )
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null)
  const answered = ctx.phase === 'feedback'

  useEffect(() => {
    void sayWord(spoken)
  }, [spoken])

  function reply(value: 'yes' | 'no') {
    if (answered || answer) return
    setAnswer(value)
    ctx.submit((spoken.id === ctx.item.id) === (value === 'yes'), { chosenId: spoken.id, text: value })
  }

  return (
    <div className="text-center">
      {ctx.item.imageUrl && (
        <img src={ctx.item.imageUrl} alt="" className="mx-auto aspect-square w-full max-w-xs rounded-3xl bg-white object-contain p-2" />
      )}
      <div className="mt-4 flex justify-center">
        <BigButton label={ru.kids.listen} tone="soft" className="h-16 w-16 text-3xl" onClick={() => void sayWord(spoken)}>
          🔊
        </BigButton>
      </div>
      <div className="mt-6 flex justify-center gap-8">
        <BigButton label={ru.kids.yes} tone="good" disabled={answered} className={answer === 'yes' ? 'scale-110' : ''} onClick={() => reply('yes')}>
          👍
        </BigButton>
        <BigButton label={ru.kids.no} tone="bad" disabled={answered} className={answer === 'no' ? 'scale-110' : ''} onClick={() => reply('no')}>
          👎
        </BigButton>
      </div>
      {answered && <KidsFeedback correct={Boolean(ctx.correct)} item={ctx.item} onDone={ctx.next} />}
    </div>
  )
}
