import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getLesson, listResults, type ResultRow } from '../../api/db'
import { TeacherShell } from '../../components/Shell'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { cx } from '../../lib/cx'
import type { ExerciseType } from '../../lib/exercises'

export function ResultsPage() {
  const { id = '' } = useParams()
  const lesson = useQuery({ queryKey: ['lesson', id], queryFn: () => getLesson(id) })
  const results = useQuery({
    queryKey: ['results', id],
    queryFn: () => listResults(id),
    refetchInterval: 30_000,
  })

  const rows = results.data ?? []
  const exercises = uniqueExercises(rows)
  const students = uniqueStudents(rows)

  return (
    <TeacherShell>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <Link to={`/lessons/${id}`} className="text-sm text-muted no-underline">
            ← {lesson.data?.title ?? ru.nav.lessons}
          </Link>
          <h1 className="font-serif text-4xl">{ru.results.title}</h1>
        </div>
        <Button variant="ghost" onClick={() => void results.refetch()}>
          {ru.results.refresh}
        </Button>
      </div>
      {results.isLoading && <Spinner />}
      {rows.length === 0 && !results.isLoading && <EmptyState>{ru.results.empty}</EmptyState>}
      {students.length > 0 && (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="p-3">{ru.publish.names}</th>
                {exercises.map((exercise) => (
                  <th key={exercise} className="p-3 font-semibold">
                    {ru.exercises.names[exercise]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <Link to={`/assignments/${student.assignmentId}`} className="font-semibold text-ink">
                      {student.name}
                    </Link>
                  </td>
                  {exercises.map((exercise) => {
                    const cell = rows.find((row) => row.student_id === student.id && row.exercise === exercise)
                    return (
                      <td key={exercise} className="p-2">
                        {cell && <ResultCell row={cell} />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TeacherShell>
  )
}

function uniqueExercises(rows: ResultRow[]): ExerciseType[] {
  const map = new Map<ExerciseType, number>()
  for (const row of rows) map.set(row.exercise, row.exercise_position)
  return [...map.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([type]) => type)
    .filter((type) => type !== 'pronounce')
}

function uniqueStudents(rows: ResultRow[]) {
  const map = new Map<string, { id: string; name: string; assignmentId: string }>()
  for (const row of rows) {
    if (!map.has(row.student_id)) {
      map.set(row.student_id, { id: row.student_id, name: row.student_name, assignmentId: row.assignment_id })
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function ResultCell({ row }: { row: ResultRow }) {
  if (!row.available) return <span className="text-muted">{ru.results.unavailable}</span>
  if (row.status === 'unsupported' || row.unsupported) return <span className="text-muted">{ru.results.unsupported}</span>
  if (row.status === 'not_opened') return <span className="text-muted">{ru.results.notOpened}</span>

  const tone =
    row.exercise === 'match_pairs'
      ? movesTone(row.moves_per_pair)
      : percentTone(row.first_try_percent)
  const label =
    row.exercise === 'match_pairs'
      ? `${row.moves_per_pair ?? '—'} ${ru.results.moves}`
      : `${row.first_try_percent ?? 0}%`
  return (
    <div className={cx('rounded-xl px-2 py-1', tone === 'good' && 'bg-good-bg text-good', tone === 'warn' && 'bg-warn-bg text-warn', tone === 'bad' && 'bg-bad-bg text-bad')}>
      <div className="font-semibold">{label}</div>
      <div className="text-xs">{row.status === 'completed' ? ru.results.completed : ru.results.inProgress}</div>
    </div>
  )
}

function percentTone(value: number | null): 'good' | 'warn' | 'bad' {
  const percent = value ?? 0
  if (percent >= 90) return 'good'
  if (percent >= 60) return 'warn'
  return 'bad'
}

function movesTone(value: number | null): 'good' | 'warn' | 'bad' {
  const moves = value ?? 99
  if (moves <= 1.5) return 'good'
  if (moves <= 2.5) return 'warn'
  return 'bad'
}
