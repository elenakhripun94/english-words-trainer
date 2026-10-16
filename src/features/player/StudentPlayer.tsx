import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Button, Spinner } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'
import { PAIRS_EXERCISES, type ExerciseSettings, type ExerciseType } from '../../lib/exercises'
import { playSuccess } from '../../lib/sfx'
import { primeSpeech } from '../../lib/speech'
import { fetchAssignment, type PlayerItem } from './api'
import { ChoiceExercise } from './ChoiceExercise'
import { DictationExercise } from './DictationExercise'
import { BigButton, EXERCISE_ICONS, IntroGate, NoTextContext, useNoText } from './kids'
import { MatchPairsExercise } from './MatchPairsExercise'
import { MemorizeExercise } from './MemorizeExercise'
import { PictureChoiceExercise } from './PictureChoiceExercise'
import { PronounceExercise } from './PronounceExercise'
import { PuzzleExercise } from './PuzzleExercise'
import { RepeatExercise } from './RepeatExercise'
import { SortGroupsExercise } from './SortGroupsExercise'
import { SpellExercise } from './SpellExercise'
import { flushOutbox } from './sync'
import { TrueFalseExercise } from './TrueFalseExercise'
import { WhatsMissingExercise } from './WhatsMissingExercise'

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
  const noText = data.lesson.noText
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
  const toHome = () => {
    void assignment.refetch()
    setScreen({ name: 'home' })
  }
  const startLabel = next ? (data.progress.some((row) => row.completed_at) ? ru.player.continue : ru.player.start) : ru.player.allDone

  return (
    <NoTextContext.Provider value={noText}>
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
                      <span className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden="true">
                          {EXERCISE_ICONS[exercise.type]}
                        </span>
                        <span className="font-semibold">{ru.exercises.names[exercise.type]}</span>
                      </span>
                      <span className="text-sm text-muted">{done ? `⭐ ${ru.player.done}` : ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {visible.length > 0 && (
              <Button className="mt-5 w-full" onClick={() => setScreen({ name: 'play', exercise: (next ?? visible[0]).type, practice: !next })}>
                {startLabel}
              </Button>
            )}
          </div>
        )}
        {screen.name === 'finish' && (
          <Finish
            screen={screen}
            onList={toHome}
            onRepeat={
              screen.mistakeIds && screen.mistakeIds.length > 0
                ? () => setScreen({ name: 'play', exercise: screen.exercise, practice: true, onlyIds: screen.mistakeIds })
                : undefined
            }
          />
        )}
        {screen.name === 'play' && (
          <IntroGate key={`${screen.exercise}:${screen.onlyIds?.join(',') ?? ''}`} exercise={screen.exercise} onExit={toHome}>
            <Play
              token={token}
              exercise={screen.exercise}
              practice={screen.practice}
              items={itemsFor(screen.onlyIds)}
              settings={visible.find((exercise) => exercise.type === screen.exercise)?.settings ?? {}}
              onExit={toHome}
              onScore={(correct, total, mistakeIds) => setScreen({ name: 'finish', exercise: screen.exercise, correct, total, mistakeIds })}
              onCards={() => setScreen({ name: 'finish', exercise: 'memorize', total: data.items.length })}
              onMoves={(moves) => setScreen({ name: 'finish', exercise: screen.exercise, moves, total: data.items.length })}
              onUnsupported={toHome}
            />
          </IntroGate>
        )}
      </PlayerFrame>
    </NoTextContext.Provider>
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
  settings: ExerciseSettings
  onExit: () => void
  onScore: (correct: number, total: number, mistakeIds: string[]) => void
  onCards: () => void
  onMoves: (moves: number) => void
  onUnsupported: () => void
}) {
  const noText = useNoText()
  const common = { token, items, practice, onExit }
  const scored = (mistakeIds: string[]) => onScore(items.length - mistakeIds.length, items.length, mistakeIds)

  switch (exercise) {
    case 'memorize':
      return <MemorizeExercise {...common} onFinish={onCards} />
    case 'pick_word':
    case 'pick_image':
    case 'pick_translation':
      return <ChoiceExercise {...common} mode={exercise} settings={settings} onFinish={scored} />
    case 'spell':
      return <SpellExercise {...common} settings={settings} onFinish={scored} />
    case 'dictation':
      return <DictationExercise {...common} settings={settings} onFinish={scored} />
    case 'pronounce':
      return <PronounceExercise {...common} settings={settings} onFinish={scored} onUnsupported={onUnsupported} />
    case 'match_pairs':
      return <MatchPairsExercise {...common} exercise="match_pairs" variant={noText ? 'sound' : 'words'} settings={settings} onFinish={onMoves} />
    case 'memory_images':
      return <MatchPairsExercise {...common} exercise="memory_images" variant={settings.variant ?? 'same'} settings={settings} onFinish={onMoves} />
    case 'listen_find':
    case 'shadow':
    case 'feed':
    case 'balloons':
      return <PictureChoiceExercise {...common} mode={exercise} settings={settings} onFinish={scored} />
    case 'true_false':
      return <TrueFalseExercise {...common} onFinish={scored} />
    case 'whats_missing':
      return <WhatsMissingExercise {...common} settings={settings} onFinish={scored} />
    case 'sort_groups': {
      const grouped = items.filter((item) => (item.category ?? '').trim())
      return (
        <SortGroupsExercise
          {...common}
          onFinish={(mistakeIds) => onScore(grouped.length - mistakeIds.length, grouped.length, mistakeIds)}
        />
      )
    }
    case 'puzzle':
      return <PuzzleExercise {...common} settings={settings} onFinish={scored} />
    case 'repeat':
      return <RepeatExercise {...common} onFinish={scored} />
  }
}

function Finish({ screen, onList, onRepeat }: { screen: Extract<Screen, { name: 'finish' }>; onList: () => void; onRepeat?: () => void }) {
  const noText = useNoText()
  const pairs = PAIRS_EXERCISES.has(screen.exercise)

  useEffect(() => {
    if (noText) playSuccess()
  }, [noText])

  if (noText) {
    const total = screen.total ?? 0
    const ratio = pairs || screen.exercise === 'memorize' || total === 0 ? 1 : (screen.correct ?? 0) / total
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1
    return (
      <div className="text-center">
        <p className="pop-in mt-6 text-8xl" aria-hidden="true">
          🎉
        </p>
        <p className="mt-4 text-6xl" role="img" aria-label={`${stars} / 3`}>
          {'⭐'.repeat(stars)}
          <span className="opacity-20">{'⭐'.repeat(3 - stars)}</span>
        </p>
        <div className="mt-8 flex justify-center gap-6">
          {onRepeat && (
            <BigButton label={ru.player.repeat} tone="soft" onClick={onRepeat}>
              🔁
            </BigButton>
          )}
          <BigButton label={ru.player.toList} onClick={onList}>
            🏠
          </BigButton>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center">
      <h1 className="font-serif text-4xl">{ru.player.finishTitle}</h1>
      {screen.exercise === 'memorize' && <p className="mt-3 text-lg">{ru.player.finishCards}</p>}
      {pairs && (
        <p className="mt-3 text-lg">
          {ru.player.finishPairs} {screen.moves} {ru.player.moves}
        </p>
      )}
      {screen.exercise !== 'memorize' && !pairs && (
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
