import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { loadQueue, saveQueue, clearQueue } from '../../lib/playerStorage'
import { seededShuffle } from '../../lib/shuffle'
import { playTerm } from '../../lib/speech'
import type { PlayerItem } from './api'
import { deliverAnswer, deliverComplete } from './sync'

export function MemorizeExercise({
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
  onFinish: () => void
}) {
  const key = practice ? 'memorize:practice' : 'memorize'
  const [order] = useState(() => seededShuffle(items, `${token}:memorize`))
  const [index, setIndex] = useState(() => {
    const saved = loadQueue(token, key, order.map((item) => item.id))
    const current = saved.queue[0]
    const found = order.findIndex((item) => item.id === current)
    return found >= 0 ? found : 0
  })
  const item = order[index]

  useEffect(() => {
    if (item) void playTerm(item.term, item.audioUrl)
  }, [item])

  if (!item) return null

  async function next() {
    const started = performance.now()
    await deliverAnswer(
      token,
      { exercise: 'memorize', itemId: item.id, durationMs: Math.round(performance.now() - started) },
      practice,
    )
    const following = order[index + 1]
    if (!following) {
      clearQueue(token, key)
      if (!practice) await deliverComplete(token, 'memorize', false, false)
      onFinish()
      return
    }
    saveQueue(token, key, {
      queue: order.slice(index + 1).map((entry) => entry.id),
      phase: 'question',
      lastCorrect: null,
      pendingSkip: false,
      firstTry: {},
    })
    setIndex(index + 1)
  }

  return (
    <div>
      <Button variant="ghost" onClick={onExit}>
        ← {ru.player.toList}
      </Button>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="mx-auto mt-4 aspect-square w-full max-w-sm rounded-3xl object-cover" />}
      <p className="mt-4 text-center font-serif text-4xl">{item.term}</p>
      {item.phonetic && <p className="text-center text-muted">{item.phonetic}</p>}
      {item.translation && <p className="text-center text-lg">{item.translation}</p>}
      {(item.imageAuthor || item.imageLicense) && (
        <p className="mt-2 text-center text-xs text-muted">
          {item.imageAuthor}
          {item.imageLicense ? ` · ${item.imageLicense}` : ''}
          {item.imageSourceUrl ? (
            <>
              {' '}
              <a href={item.imageSourceUrl} className="underline">
                {item.imageLicense || 'source'}
              </a>
            </>
          ) : null}
        </p>
      )}
      <div className="mt-4 grid gap-2">
        <Button variant="soft" aria-label={ru.player.listen} onClick={() => void playTerm(item.term, item.audioUrl)}>
          {ru.player.listen}
        </Button>
        <Button onClick={() => void next()}>{ru.player.next}</Button>
      </div>
    </div>
  )
}
