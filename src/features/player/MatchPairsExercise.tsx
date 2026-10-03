import { useMemo, useState } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import type { ExerciseSettings } from '../../lib/exercises'
import { splitIntoRounds } from '../../lib/rounds'
import { seededShuffle } from '../../lib/shuffle'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { deliverAnswer, deliverComplete } from './sync'

export function MatchPairsExercise({
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
  onFinish: (moves: number) => void
}) {
  const rounds = useMemo(
    () => splitIntoRounds(seededShuffle(items, `${token}:match_pairs`), settings.pairsPerRound ?? 6),
    [items, settings.pairsPerRound, token],
  )
  const [roundIndex, setRoundIndex] = useState(0)
  const [moves, setMoves] = useState(0)
  const round = useMemo(() => rounds[roundIndex] ?? [], [rounds, roundIndex])
  const cards = useMemo(
    () =>
      seededShuffle(
        round.flatMap((item) => [
          { key: `${item.id}:image`, itemId: item.id, side: 'image' as const },
          { key: `${item.id}:word`, itemId: item.id, side: 'word' as const },
        ]),
        `${token}:match_pairs:${roundIndex}`,
      ),
    [round, roundIndex, token],
  )
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [lock, setLock] = useState(false)

  function cardByKey(key: string) {
    return cards.find((card) => card.key === key)
  }

  async function choose(key: string) {
    if (lock || openKeys.includes(key) || matched.includes(cardByKey(key)?.itemId ?? '')) return
    const next = [...openKeys, key]
    setOpenKeys(next)
    if (next.length < 2) return
    const [first, second] = next.map((id) => cardByKey(id))
    if (!first || !second) return
    setLock(true)
    if (first.side === second.side) {
      window.setTimeout(() => {
        setOpenKeys([])
        setLock(false)
      }, 700)
      return
    }
    const image = first.side === 'image' ? first : second
    const word = first.side === 'word' ? first : second
    const correct = image.itemId === word.itemId
    setMoves((value) => value + 1)
    await deliverAnswer(
      token,
      { exercise: 'match_pairs', itemId: image.itemId, chosenItemId: word.itemId },
      practice,
    )
    if (correct) {
      const item = round.find((entry) => entry.id === image.itemId)
      if (item) void playTerm(item.term, item.audioUrl)
      const done = [...matched, image.itemId]
      setMatched(done)
      setOpenKeys([])
      setLock(false)
      if (done.length === round.length) {
        if (roundIndex + 1 >= rounds.length) {
          if (!practice) await deliverComplete(token, 'match_pairs', false, false)
          onFinish(moves + 1)
        }
      }
      return
    }
    window.setTimeout(() => {
      setOpenKeys([])
      setLock(false)
    }, 1000)
  }

  function nextRound() {
    setRoundIndex((value) => value + 1)
    setMatched([])
    setOpenKeys([])
  }

  const roundDone = matched.length === round.length && round.length > 0

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" onClick={onExit}>
          ← {ru.player.toList}
        </Button>
        <p className="text-sm text-muted">
          {ru.player.round} {roundIndex + 1} / {rounds.length}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cards.map((card) => {
          const item = round.find((entry) => entry.id === card.itemId)
          const shown = openKeys.includes(card.key) || matched.includes(card.itemId)
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={shown}
              className={`flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-line text-sm font-semibold ${shown ? 'bg-card' : 'card-back text-white'}`}
              onClick={() => void choose(card.key)}
            >
              {shown ? (
                card.side === 'image' && item?.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="px-1">{item?.term}</span>
                )
              ) : (
                '?'
              )}
            </button>
          )
        })}
      </div>
      {roundDone && roundIndex + 1 < rounds.length && (
        <Button className="mt-4 w-full" onClick={nextRound}>
          {ru.player.next}
        </Button>
      )}
    </div>
  )
}
