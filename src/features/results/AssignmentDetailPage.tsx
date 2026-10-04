import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getResultDetail, type AttemptRow, type LessonItem } from '../../api/db'
import { TeacherShell } from '../../components/Shell'
import { Badge, Spinner } from '../../components/ui'
import { ru } from '../../i18n/ru'
import type { ExerciseType } from '../../lib/exercises'

export function AssignmentDetailPage() {
  const { id = '' } = useParams()
  const detail = useQuery({ queryKey: ['assignment', id], queryFn: () => getResultDetail(id) })

  return (
    <TeacherShell>
      {detail.isLoading && <Spinner />}
      {detail.data === null && <p>{ru.lessons.notFound}</p>}
      {detail.data && (
        <DetailBody detail={detail.data} />
      )}
    </TeacherShell>
  )
}

function DetailBody({ detail }: { detail: NonNullable<Awaited<ReturnType<typeof getResultDetail>>> }) {
  return (
    <>
      <Link to={`/lessons/${detail.assignment.lesson_id}/results`} className="text-sm text-muted no-underline">
        ← {ru.results.title}
      </Link>
      <h1 className="mt-2 font-serif text-4xl">{detail.student}</h1>
      <p className="text-muted">{detail.title}</p>
      <p className="mt-2 text-sm text-muted">
        {ru.results.opened}: {formatWhen(detail.assignment.opened_at)} · {ru.results.finished}:{' '}
        {formatWhen(detail.assignment.completed_at)}
      </p>
      <div className="mt-6 grid gap-4">
        {detail.exercises.filter((exercise) => exercise.type !== 'pronounce').map((exercise) => (
          <section key={exercise.type} className="rounded-3xl border border-line bg-card p-4">
            <h2 className="font-serif text-2xl">{ru.exercises.names[exercise.type]}</h2>
            <ul className="mt-3 grid gap-2">
              {detail.items.map((item) => {
                const attempts = detail.attempts.filter(
                  (attempt) => attempt.exercise === exercise.type && attempt.item_id === item.id,
                )
                if (attempts.length === 0) return null
                return (
                  <li key={item.id} className="rounded-2xl bg-paper px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-serif text-lg">{item.term}</span>
                      <AttemptBadge attempts={attempts} />
                    </div>
                    <MistakeText exercise={exercise.type} item={item} attempts={attempts} items={detail.items} />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function AttemptBadge({ attempts }: { attempts: AttemptRow[] }) {
  const meaningful = attempts.filter((attempt) => !attempt.skipped)
  const first = meaningful[0]
  if (!first) return <Badge>{ru.results.skipped}</Badge>
  if (first.is_correct) return <Badge tone="good">{ru.results.firstTry}</Badge>
  if (first.is_correct === false) return <Badge tone="bad">{ru.results.withErrors}</Badge>
  return <Badge>{ru.results.completed}</Badge>
}

function MistakeText({
  exercise,
  item,
  attempts,
  items,
}: {
  exercise: ExerciseType
  item: LessonItem
  attempts: AttemptRow[]
  items: LessonItem[]
}) {
  const wrong = attempts.filter((attempt) => attempt.is_correct === false)
  const skips = attempts.filter((attempt) => attempt.skipped)
  const parts: string[] = []
  if (exercise === 'pick_word' || exercise === 'pick_image' || exercise === 'pick_translation' || exercise === 'match_pairs') {
    const names = wrong
      .map((attempt) => items.find((candidate) => candidate.id === attempt.chosen_item_id))
      .map((candidate) => (exercise === 'pick_translation' ? candidate?.translation : candidate?.term))
      .filter((value): value is string => Boolean(value))
    if (names.length) parts.push(`${ru.results.confuses} ${item.term} ${ru.results.withWord} ${names.join(', ')}`)
  } else if (wrong.some((attempt) => attempt.answer_text)) {
    const texts = wrong.map((attempt) => attempt.answer_text).filter((value): value is string => Boolean(value))
    parts.push(`${ru.results.wrote} ${texts.join(', ')}`)
  }
  if (skips.length) parts.push(ru.results.skipped)
  if (parts.length === 0) return null
  return <p className="mt-1 text-sm text-muted">{parts.join(' · ')}</p>
}

function formatWhen(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
