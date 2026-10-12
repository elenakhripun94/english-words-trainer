import { useMemo, useState } from 'react'
import { ru } from '../../i18n/ru'
import type { ExerciseSettings, MemoryVariant } from '../../lib/exercises'
import { splitIntoRounds } from '../../lib/rounds'
import { seededShuffle } from '../../lib/shuffle'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { HomeButton, useNoText } from './kids'
import { deliverAnswer, deliverComplete } from './sync'

type Side = 'image' | 'word' | 'twin' | 'sound'

const SECOND_SIDE: Record<MemoryVariant, Side> = { words: 'word', same: 'twin', sound: 'sound' }

/**
 * Memory game. «words» pairs a picture with its written word, «same» two equal pictures,
 * «sound» a picture with a card that says the word.
 */
export function MatchPairsExercise({
  exercise,
  variant,
  token,
  items,
  settings,
  practice,
  onExit,
  onFinish,
}: {
  exercise: 'match_pairs' | 'memory_images'
  variant: MemoryVariant
  token: string
  items: PlayerItem[]
  settings: ExerciseSettings
  practice: boolean
  onExit: () => void
  onFinish: (moves: number) => void
}) {
  const noText = useNoText()
  const rounds = useMemo(
    () => splitIntoRounds(seededShuffle(items, `${token}:${exercise}`), settings.pairsPerRound ?? 6),
    [exercise, items, settings.pairsPerRound, token],
  )
  const [roundIndex, setRoundIndex] = useState(0)
  const [moves, setMoves] = useState(0)
  const round = useMemo(() => rounds[roundIndex] ?? [], [rounds, roundIndex])
  const cards = useMemo(
    () =>
      seededShuffle(
        round.flatMap((item) => [
          { key: `${item.id}:image`, itemId: item.id, side: 'image' as Side },
          { key: `${item.id}:second`, itemId: item.id, side: SECOND_SIDE[variant] },
        ]),
        `${token}:${exercise}:${roundIndex}`,
      ),
    [exercise, round, roundIndex, token, variant],
  )
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [lock, setLock] = useState(false)

  function cardByKey(key: string) {
    return cards.find((card) => card.key === key)
  }

  async function choose(key: string) {
    const card = cardByKey(key)
    if (!card || lock || openKeys.includes(key) || matched.includes(card.itemId)) return
    const item = round.find((entry) => entry.id === card.itemId)
    // In the picture-only games the word sounds as soon as a card opens.
    if (item && (card.side === 'sound' || variant === 'same')) void playTerm(item.term, item.audioUrl)
    const next = [...openKeys, key]
    setOpenKeys(next)
    if (next.length < 2) return
    const [first, second] = next.map((id) => cardByKey(id))
    if (!first || !second) return
    setLock(true)
    // Two words or two sound cards can never be a pair, so this is not counted as a move.
    if (variant !== 'same' && first.side === second.side) {
      window.setTimeout(() => {
        setOpenKeys([])
        setLock(false)
      }, 700)
      return
    }
    const image = first.side === 'image' ? first : second
    const other = image === first ? second : first
    const correct = image.itemId === other.itemId
    setMoves((value) => value + 1)
    await deliverAnswer(token, { exercise, itemId: image.itemId, chosenItemId: other.itemId }, practice)
    if (correct) {
      const matchedItem = round.find((entry) => entry.id === image.itemId)
      if (matchedItem) window.setTimeout(() => void playTerm(matchedItem.term, matchedItem.audioUrl), variant === 'words' ? 0 : 700)
      const done = [...matched, image.itemId]
      setMatched(done)
      setOpenKeys([])
      setLock(false)
      if (done.length === round.length) {
        if (roundIndex + 1 >= rounds.length) {
          if (!practice) await deliverComplete(token, exercise, false, false)
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
        <HomeButton onExit={onExit} />
        {!noText && (
          <p className="text-sm text-muted">
            {ru.player.round} {roundIndex + 1} / {rounds.length}
          </p>
        )}
      </div>
      <div className={`grid gap-2 ${cards.length <= 8 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'}`}>
        {cards.map((card) => {
          const item = round.find((entry) => entry.id === card.itemId)
          const shown = openKeys.includes(card.key) || matched.includes(card.itemId)
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={shown}
              className={`flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-line text-sm font-semibold ${shown ? 'bg-white' : 'card-back text-white'} ${matched.includes(card.itemId) ? 'opacity-70' : ''}`}
              onClick={() => void choose(card.key)}
            >
              {shown ? <CardFace side={card.side} item={item} /> : <span className="text-2xl">?</span>}
            </button>
          )
        })}
      </div>
      {roundDone && roundIndex + 1 < rounds.length && (
        <button type="button" className="mt-4 w-full rounded-2xl bg-accent py-4 text-3xl text-white" aria-label={ru.player.next} onClick={nextRound}>
          {noText ? '➡️' : ru.player.next}
        </button>
      )}
    </div>
  )
}

function CardFace({ side, item }: { side: Side; item: PlayerItem | undefined }) {
  if (!item) return null
  if (side === 'sound') {
    return (
      <span className="text-5xl" role="img" aria-label={ru.kids.listen}>
        🔊
      </span>
    )
  }
  if (side === 'word') return <span className="px-1">{item.term}</span>
  return item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain p-1" /> : null
}
