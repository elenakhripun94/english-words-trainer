import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { isAlmost } from '../../lib/answers'
import type { ExerciseSettings } from '../../lib/exercises'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { ExerciseShell } from './ExerciseShell'

export function DictationExercise({
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
    <ExerciseShell
      token={token}
      exercise="dictation"
      items={items}
      practice={practice}
      onExit={onExit}
      onFinish={(stats) => onFinish(stats.mistakeIds)}
    >
      {(ctx) => (
        <DictationBody
          item={ctx.item}
          phase={ctx.phase}
          correct={ctx.correct}
          almost={ctx.almost}
          showImage={settings.showImageAfter !== false}
          onCheck={ctx.submitText}
          onNext={ctx.next}
        />
      )}
    </ExerciseShell>
  )
}

function DictationBody({
  item,
  phase,
  correct,
  almost,
  showImage,
  onCheck,
  onNext,
}: {
  item: PlayerItem
  phase: 'question' | 'feedback'
  correct: boolean | null
  almost: boolean
  showImage: boolean
  onCheck: (text: string, almost: boolean) => void
  onNext: () => void
}) {
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [item.id])
  useEffect(() => {
    if (phase === 'question') void playTerm(item.term, item.audioUrl)
  }, [item, phase])

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (phase === 'feedback') onNext()
        else onCheck(value, isAlmost(value, item.term))
      }}
    >
      <div className="flex gap-2">
        <Button variant="soft" aria-label={ru.player.listenAgain} onClick={() => void playTerm(item.term, item.audioUrl)}>
          {ru.player.listenAgain}
        </Button>
        <Button variant="ghost" onClick={() => void playTerm(item.term, null, { rate: 0.7 })}>
          {ru.player.slow}
        </Button>
      </div>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={ru.player.typeHere}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="rounded-2xl border border-line bg-white px-4 py-3 text-2xl"
        disabled={phase === 'feedback'}
      />
      {phase === 'feedback' && (
        <div aria-live="polite">
          <p className={correct ? 'text-good' : 'text-bad'}>{correct ? ru.player.correct : almost ? ru.player.almost : ru.player.wrong}</p>
          {!correct && <p className="font-serif text-2xl">{item.term}</p>}
          {showImage && item.imageUrl && <img src={item.imageUrl} alt="" className="mx-auto mt-3 aspect-square w-full max-w-xs rounded-3xl object-cover" />}
        </div>
      )}
      <Button type="submit">{phase === 'feedback' ? ru.player.next : ru.player.check}</Button>
    </form>
  )
}
