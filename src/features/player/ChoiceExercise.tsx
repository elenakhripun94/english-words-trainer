import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import type { ExerciseSettings } from '../../lib/exercises'
import { buildQuestion } from '../../lib/questions'
import { rngFromSeed } from '../../lib/shuffle'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'

export function ChoiceExercise({
  mode,
  token,
  items,
  settings,
  practice,
  onExit,
  onFinish,
}: {
  mode: 'pick_word' | 'pick_image' | 'pick_translation'
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
      exercise={mode}
      items={items}
      practice={practice}
      onExit={onExit}
      onFinish={(stats) => onFinish(stats.mistakeIds)}
    >
      {(ctx) => <ChoiceBody mode={mode} token={token} items={items} settings={settings} ctx={ctx} />}
    </ExerciseShell>
  )
}

function ChoiceBody({
  mode,
  token,
  items,
  settings,
  ctx,
}: {
  mode: 'pick_word' | 'pick_image' | 'pick_translation'
  token: string
  items: PlayerItem[]
  settings: ExerciseSettings
  ctx: ShellContext
}) {
  const options = useMemo(
    () => buildQuestion(items, ctx.item.id, settings.options ?? 4, rngFromSeed(`${token}:${mode}:${ctx.item.id}`)),
    [ctx.item.id, items, mode, settings.options, token],
  )
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => setPicked(null), [ctx.item.id])

  useEffect(() => {
    if (mode === 'pick_image' && ctx.phase === 'question') void playTerm(ctx.item.term, ctx.item.audioUrl)
  }, [ctx.item, ctx.phase, mode])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return
      if (ctx.phase === 'feedback' && event.key === 'Enter') ctx.next()
      const index = Number(event.key) - 1
      if (ctx.phase === 'question' && index >= 0 && options[index]) {
        setPicked(options[index].id)
        ctx.submitChoice(options[index].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctx, options])

  useEffect(() => {
    if (ctx.phase === 'feedback' && mode === 'pick_word') void playTerm(ctx.item.term, ctx.item.audioUrl)
  }, [ctx.phase, ctx.item, mode])

  return (
    <div>
      {mode === 'pick_word' && ctx.item.imageUrl && (
        <img src={ctx.item.imageUrl} alt="" className="mx-auto aspect-square w-full max-w-sm rounded-3xl object-cover" />
      )}
      {mode !== 'pick_word' && (
        <div className="text-center">
          <p className="font-serif text-4xl">{ctx.item.term}</p>
          <Button className="mt-3" variant="soft" aria-label={ru.player.listen} onClick={() => void playTerm(ctx.item.term, ctx.item.audioUrl)}>
            {ru.player.listen}
          </Button>
        </div>
      )}
      <div className={mode === 'pick_image' ? 'mt-4 grid grid-cols-2 gap-3' : 'mt-4 grid gap-3'} aria-live="polite">
        {options.map((option, index) => {
          const correct = option.id === ctx.item.id
          const show = ctx.phase === 'feedback'
          return (
            <button
              key={option.id}
              type="button"
              disabled={ctx.phase === 'feedback'}
              onClick={() => {
                setPicked(option.id)
                ctx.submitChoice(option.id)
              }}
              className={`rounded-2xl border-2 p-3 text-left text-lg font-semibold disabled:cursor-default ${
                show && correct
                  ? 'border-good bg-good-bg'
                  : show && picked === option.id
                    ? 'border-bad bg-bad-bg'
                    : 'border-line bg-card'
              }`}
            >
              <span className="mr-2 text-sm text-muted">{index + 1}</span>
              {mode === 'pick_image' && option.imageUrl ? (
                <img src={option.imageUrl} alt={option.term} className="mt-2 aspect-square w-full rounded-xl object-cover" />
              ) : mode === 'pick_translation' ? (
                option.translation || option.term
              ) : (
                option.term
              )}
            </button>
          )
        })}
      </div>
      {ctx.phase === 'feedback' && (
        <div className="mt-4">
          <p className={ctx.correct ? 'text-good' : 'text-bad'}>{ctx.correct ? ru.player.correct : ru.player.wrong}</p>
          <Button className="mt-3 w-full" onClick={ctx.next}>
            {ru.player.next}
          </Button>
        </div>
      )}
    </div>
  )
}
