import { useEffect, useMemo, useRef, useState } from 'react'
import { ru } from '../../i18n/ru'
import { cx } from '../../lib/cx'
import type { ExerciseSettings } from '../../lib/exercises'
import { stopSpeech } from '../../lib/speech'
import { buildMissingRound } from '../../lib/kidsRounds'
import { rngFromSeed } from '../../lib/shuffle'
import type { PlayerItem } from './api'
import { ExerciseShell, type ShellContext } from './ExerciseShell'
import { BigButton, KidsFeedback, PictureOption, sayWord, wait } from './kids'

export function WhatsMissingExercise({
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
    <ExerciseShell token={token} exercise="whats_missing" items={items} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <Body key={`${ctx.item.id}:${ctx.turn}`} token={token} items={items} settings={settings} ctx={ctx} />}
    </ExerciseShell>
  )
}

function Body({ token, items, settings, ctx }: { token: string; items: PlayerItem[]; settings: ExerciseSettings; ctx: ShellContext }) {
  const round = useMemo(
    () => buildMissingRound(items, ctx.item, settings.options ?? 3, rngFromSeed(`${token}:whats_missing:${ctx.item.id}:${ctx.turn}`)),
    [ctx.item, ctx.turn, items, settings.options, token],
  )
  const [stage, setStage] = useState<'look' | 'hide' | 'guess'>('look')
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const answered = ctx.phase === 'feedback'
  const looking = useRef(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const item of round.shown) {
        if (cancelled || !looking.current) return
        setSpeaking(item.id)
        await sayWord(item)
        await wait(250)
      }
      if (!cancelled) setSpeaking(null)
    })()
    return () => {
      cancelled = true
    }
  }, [round])

  async function hide() {
    looking.current = false
    stopSpeech()
    setSpeaking(null)
    setStage('hide')
    await wait(1200)
    setStage('guess')
  }

  if (stage === 'hide') {
    return (
      <p className="py-24 text-center text-9xl" role="img" aria-hidden="true">
        🙈
      </p>
    )
  }

  return (
    <div className="text-center">
      <div className="grid grid-cols-3 gap-3">
        {round.shown.map((item) =>
          stage === 'guess' && item.id === ctx.item.id && !answered ? (
            <span key={item.id} className="flex aspect-square items-center justify-center rounded-3xl border-4 border-dashed border-line text-5xl">
              ❓
            </span>
          ) : (
            <button
              key={item.id}
              type="button"
              aria-label={item.term}
              onClick={() => void sayWord(item)}
              className={cx(
                'overflow-hidden rounded-3xl border-4 bg-white p-1',
                speaking === item.id ? 'border-accent' : 'border-line',
                answered && item.id === ctx.item.id && 'pop-in border-good',
              )}
            >
              {item.imageUrl && <img src={item.imageUrl} alt="" className="aspect-square w-full object-contain" />}
            </button>
          ),
        )}
      </div>
      {stage === 'look' && (
        <div className="mt-8">
          <BigButton label={ru.kids.ready} onClick={() => void hide()}>
            👁️
          </BigButton>
        </div>
      )}
      {stage === 'guess' && (
        <div className="mt-8 grid grid-cols-3 gap-3 border-t-2 border-dashed border-line pt-6">
          {round.choices.map((choice) => (
            <PictureOption
              key={choice.id}
              item={choice}
              disabled={answered}
              state={!answered ? 'idle' : choice.id === ctx.item.id ? 'right' : choice.id === picked ? 'wrong' : 'idle'}
              onClick={() => {
                if (picked) return
                setPicked(choice.id)
                ctx.submitChoice(choice.id)
              }}
            />
          ))}
        </div>
      )}
      {answered && <KidsFeedback correct={Boolean(ctx.correct)} item={ctx.item} onDone={ctx.next} />}
    </div>
  )
}
