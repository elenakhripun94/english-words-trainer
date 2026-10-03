import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { normalizeAnswer } from '../../lib/answers'
import type { ExerciseSettings } from '../../lib/exercises'
import { assembleAnswer, buildLetterTiles, termSlots, type LetterTile } from '../../lib/letters'
import { rngFromSeed } from '../../lib/shuffle'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { ExerciseShell } from './ExerciseShell'

export function SpellExercise({
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
    <ExerciseShell token={token} exercise="spell" items={items} practice={practice} onExit={onExit} onFinish={(stats) => onFinish(stats.mistakeIds)}>
      {(ctx) => <SpellBody item={ctx.item} token={token} settings={settings} phase={ctx.phase} correct={ctx.correct} onCheck={ctx.submitText} onNext={ctx.next} />}
    </ExerciseShell>
  )
}

function SpellBody({
  item,
  token,
  settings,
  phase,
  correct,
  onCheck,
  onNext,
}: {
  item: PlayerItem
  token: string
  settings: ExerciseSettings
  phase: 'question' | 'feedback'
  correct: boolean | null
  onCheck: (text: string, almost: boolean) => void
  onNext: () => void
}) {
  const slots = useMemo(() => termSlots(item.term), [item.term])
  const tiles = useMemo(
    () => buildLetterTiles(item.term, settings.extraLetters ?? 0, rngFromSeed(`${token}:spell:${item.id}`)),
    [item.id, item.term, settings.extraLetters, token],
  )
  const [placed, setPlaced] = useState<Array<string | null>>([])

  useEffect(() => {
    setPlaced(slots.filter((slot) => slot.kind === 'letter').map(() => null))
  }, [item.id, slots])

  const used = new Set(placed.filter((id): id is string => Boolean(id)))
  const answer = assembleAnswer(
    item.term,
    placed.map((id) => tiles.find((tile) => tile.id === id)?.letter ?? ''),
  )

  function place(tile: LetterTile) {
    if (phase === 'feedback' || used.has(tile.id)) return
    const index = placed.findIndex((value) => value === null)
    if (index < 0) return
    const next = [...placed]
    next[index] = tile.id
    setPlaced(next)
  }

  function removeAt(index: number) {
    if (phase === 'feedback') return
    const next = [...placed]
    next[index] = null
    setPlaced(next)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (phase === 'feedback' && event.key === 'Enter') onNext()
      if (phase !== 'question') return
      if (event.key === 'Backspace') {
        let index = -1
        for (let cursor = placed.length - 1; cursor >= 0; cursor -= 1) {
          if (placed[cursor]) {
            index = cursor
            break
          }
        }
        if (index >= 0) removeAt(index)
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        const tile = tiles.find((candidate) => !used.has(candidate.id) && candidate.letter.toLowerCase() === event.key.toLowerCase())
        if (tile) place(tile)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  let letterIndex = -1
  return (
    <div>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="mx-auto aspect-square w-full max-w-xs rounded-3xl object-cover" />}
      {settings.showTranslation !== false && item.translation && <p className="mt-3 text-center text-lg">{item.translation}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-1">
        {slots.map((slot, index) => {
          if (slot.kind === 'sep') {
            return (
              <span key={`sep-${index}`} className="px-1 text-2xl">
                {slot.char}
              </span>
            )
          }
          letterIndex += 1
          const current = letterIndex
          const tileId = placed[current]
          const letter = tiles.find((tile) => tile.id === tileId)?.letter ?? ''
          const expected = Array.from(item.term).filter((char) => /[^\s\u002D\u2010-\u2015'’‘`´]/.test(char))[current]
          const wrong = phase === 'feedback' && letter.toLowerCase() !== (expected ?? '').toLowerCase()
          return (
            <button
              key={`letter-${current}`}
              type="button"
              className={`h-12 w-9 rounded-lg border text-xl font-semibold ${wrong ? 'border-bad bg-bad-bg' : 'border-line bg-white'}`}
              onClick={() => removeAt(current)}
            >
              {letter}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={used.has(tile.id) || phase === 'feedback'}
            className="h-12 w-10 rounded-xl bg-accent-soft text-lg font-semibold text-accent disabled:opacity-30"
            onClick={() => place(tile)}
          >
            {tile.letter}
          </button>
        ))}
      </div>
      <div className="mt-4 text-center">
        <Button variant="ghost" aria-label={ru.player.listen} onClick={() => void playTerm(item.term, item.audioUrl)}>
          {ru.player.listen}
        </Button>
      </div>
      {phase === 'question' ? (
        <Button className="mt-4 w-full" disabled={placed.some((value) => value === null)} onClick={() => onCheck(answer, false)}>
          {ru.player.check}
        </Button>
      ) : (
        <div className="mt-4">
          <p className={correct ? 'text-good' : 'text-bad'}>{correct ? ru.player.correct : ru.player.wrong}</p>
          {!correct && <p className="mt-1 font-serif text-2xl">{item.term}</p>}
          <Button className="mt-3 w-full" onClick={onNext}>
            {ru.player.next}
          </Button>
        </div>
      )}
      <span className="sr-only">{normalizeAnswer(answer)}</span>
    </div>
  )
}
