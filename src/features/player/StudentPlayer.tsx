import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Button, Spinner } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'
import type { ExerciseType } from '../../lib/exercises'
import { primeSpeech } from '../../lib/speech'
import { fetchAssignment, type PlayerItem } from './api'
import { ChoiceExercise } from './ChoiceExercise'
import { DictationExercise } from './DictationExercise'
import { MatchPairsExercise } from './MatchPairsExercise'
import { MemorizeExercise } from './MemorizeExercise'
import { PronounceExercise } from './PronounceExercise'
import { SpellExercise } from './SpellExercise'
import { flushOutbox } from './sync'

type Screen =
  | { name: 'home' }
  | { name: 'play'; exercise: ExerciseType; practice: boolean; onlyIds?: string[] }
  | { name: 'finish'; exercise: ExerciseType; correct?: number; total?: number; moves?: number; mistakeIds?: string[] }

export function StudentPlayer() {
  const { token = '' } = useParams()
  const assignment = useQuery({ queryKey: ['assignment', token], queryFn: () => fetchAssignment(token), retry: false })
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  useEffect(() => {
    primeSpeech()
    void flushOutbox(token)
    const onOnline = () => void flushOutbox(token)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [token])

  if (assignment.isLoading) return <PlayerFrame><Spinner /></PlayerFrame>
  if (assignment.isError) {
    const invalid = errorText(assignment.error) === ru.player.invalidLink || String(assignment.error).includes('invalid_token')
    return (
      <PlayerFrame>
        <h1 className="font-serif text-3xl">{invalid ? ru.player.invalidLink : ru.errors.generic}</h1>
        {!invalid && <Button className="mt-4" onClick={() => void assignment.refetch()}>{ru.retry}</Button>}
      </PlayerFrame>
    )
  }
  if (!assignment.data) return null
  const data = assignment.data
  const visible = data.exercises
    .filter((exercise) => exercise.available && exercise.type !== 'pronounce')
    .sort((a, b) => a.position - b.position)

  function itemsFor(onlyIds?: string[]) {
    if (!onlyIds) return data.items
    return data.items.filter((item) => onlyIds.includes(item.id))
  }

  function progressOf(type: ExerciseType) {
    return data.progress.find((row) => row.exercise === type)
  }

  const next = visible.find((exercise) => !progressOf(exercise.type)?.completed_at)

  return (
    <PlayerFrame>
      {screen.name === 'home' && (
        <div>
          <p className="font-serif text-3xl">{data.studentName}</p>
          <h1 className="mt-2 font-serif text-4xl">{ru.player.title}</h1>
          <ul className="mt-5 grid gap-2">
            {visible.map((exercise) => {
              const done = Boolean(progressOf(exercise.type)?.completed_at)
              return (
                <li key={exercise.type}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-left"
                    onClick={() => setScreen({ name: 'play', exercise: exercise.type, practice: done })}
                  >
                    <span className="font-semibold">{ru.exercises.names[exercise.type]}</span>
                    <span className="text-sm text-muted">{done ? ru.player.done : ''}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {visible.length > 0 && (
            <Button className="mt-5 w-full" onClick={() => setScreen({ name: 'play', exercise: (next ?? visible[0]).type, practice: !next })}>
              {next ? (data.progress.some((row) => row.completed_at) ? ru.player.continue : ru.player.start) : ru.player.allDone}
            </Button>
          )}
        </div>
      )}
      {screen.name === 'finish' && (
        <Finish
          screen={screen}
          onList={() => {
            void assignment.refetch()
            setScreen({ name: 'home' })
          }}
          onRepeat={
            screen.mistakeIds && screen.mistakeIds.length > 0
              ? () => setScreen({ name: 'play', exercise: screen.exercise, practice: true, onlyIds: screen.mistakeIds })
              : undefined
          }
        />
      )}
      {screen.name === 'play' && (
        <Play
          token={token}
          exercise={screen.exercise}
          practice={screen.practice}
          items={itemsFor(screen.onlyIds)}
          settings={visible.find((exercise) => exercise.type === screen.exercise)?.settings ?? {}}
          onExit={() => {
            void assignment.refetch()
            setScreen({ name: 'home' })
          }}
          onScore={(correct, total, mistakeIds) => setScreen({ name: 'finish', exercise: screen.exercise, correct, total, mistakeIds })}
          onCards={() => setScreen({ name: 'finish', exercise: 'memorize', total: data.items.length })}
          onMoves={(moves) => setScreen({ name: 'finish', exercise: 'match_pairs', moves, total: data.items.length })}
          onUnsupported={() => {
            void assignment.refetch()
            setScreen({ name: 'home' })
          }}
        />
      )}
    </PlayerFrame>
  )
}

function Play({
  token,
  exercise,
  practice,
  items,
  settings,
  onExit,
  onScore,
  onCards,
  onMoves,
  onUnsupported,
}: {
  token: string
  exercise: ExerciseType
  practice: boolean
  items: PlayerItem[]
  settings: { options?: number; pairsPerRound?: number; extraLetters?: number; showTranslation?: boolean; showImageAfter?: boolean; maxTries?: number }
  onExit: () => void
  onScore: (correct: number, total: number, mistakeIds: string[]) => void
  onCards: () => void
  onMoves: (moves: number) => void
  onUnsupported: () => void
}) {
  if (exercise === 'memorize') return <MemorizeExercise token={token} items={items} practice={practice} onExit={onExit} onFinish={onCards} />
  if (exercise === 'pick_word' || exercise === 'pick_image' || exercise === 'pick_translation') {
    return (
      <ChoiceExercise
        mode={exercise}
        token={token}
        items={items}
        settings={settings}
        practice={practice}
        onExit={onExit}
        onFinish={(mistakeIds) => onScore(items.length - mistakeIds.length, items.length, mistakeIds)}
      />
    )
  }
  if (exercise === 'spell') {
    return <SpellExercise token={token} items={items} settings={settings} practice={practice} onExit={onExit} onFinish={(mistakeIds) => onScore(items.length - mistakeIds.length, items.length, mistakeIds)} />
  }
  if (exercise === 'dictation') {
    return <DictationExercise token={token} items={items} settings={settings} practice={practice} onExit={onExit} onFinish={(mistakeIds) => onScore(items.length - mistakeIds.length, items.length, mistakeIds)} />
  }
  if (exercise === 'pronounce') {
    return (
      <PronounceExercise
        token={token}
        items={items}
        settings={settings}
        practice={practice}
        onExit={onExit}
        onFinish={(mistakeIds) => onScore(items.length - mistakeIds.length, items.length, mistakeIds)}
        onUnsupported={onUnsupported}
      />
    )
  }
  return <MatchPairsExercise token={token} items={items} settings={settings} practice={practice} onExit={onExit} onFinish={onMoves} />
}

function Finish({ screen, onList, onRepeat }: { screen: Extract<Screen, { name: 'finish' }>; onList: () => void; onRepeat?: () => void }) {
  return (
    <div className="text-center">
      <h1 className="font-serif text-4xl">{ru.player.finishTitle}</h1>
      {screen.exercise === 'memorize' && <p className="mt-3 text-lg">{ru.player.finishCards}</p>}
      {screen.exercise === 'match_pairs' && (
        <p className="mt-3 text-lg">
          {ru.player.finishPairs} {screen.moves} {ru.player.moves}
        </p>
      )}
      {screen.exercise !== 'memorize' && screen.exercise !== 'match_pairs' && (
        <p className="mt-3 text-lg">
          {ru.player.finishScore}: {screen.correct} {ru.lessons.of} {screen.total}
        </p>
      )}
      <div className="mt-5 grid gap-2">
        {onRepeat && <Button onClick={onRepeat}>{ru.player.repeat}</Button>}
        <Button variant="soft" onClick={onList}>
          {ru.player.toList}
        </Button>
      </div>
    </div>
  )
}

function PlayerFrame({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-lg px-4 py-6">{children}</main>
}
