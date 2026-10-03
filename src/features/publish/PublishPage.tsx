import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getLesson, listAssignments, listExercises, listItems, listStudents, publishLesson, revokeAssignment, studentName } from '../../api/db'
import { TeacherShell } from '../../components/Shell'
import { useToast } from '../../components/Toast'
import { Button, Spinner, TextArea } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'
import { buildStudentLink } from '../../lib/links'

export function PublishPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const lesson = useQuery({ queryKey: ['lesson', id], queryFn: () => getLesson(id) })
  const items = useQuery({ queryKey: ['items', id], queryFn: () => listItems(id) })
  const exercises = useQuery({ queryKey: ['exercises', id], queryFn: () => listExercises(id) })
  const students = useQuery({ queryKey: ['students'], queryFn: listStudents })
  const assignments = useQuery({ queryKey: ['assignments', id], queryFn: () => listAssignments(id) })
  const [names, setNames] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  const missingImage = (items.data ?? []).some((item) => !item.image_path)
  const noWords = (items.data ?? []).length === 0
  const noExercises = (exercises.data ?? []).length === 0
  const assignedIds = new Set((assignments.data ?? []).map((row) => row.student_id))
  const blocked = noWords || missingImage || noExercises

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    toast(ru.publish.copied)
  }

  async function createLinks() {
    setPending(true)
    try {
      await publishLesson(id, names, picked)
      setNames('')
      setPicked([])
      await queryClient.invalidateQueries({ queryKey: ['assignments', id] })
      await queryClient.invalidateQueries({ queryKey: ['lesson', id] })
      await queryClient.invalidateQueries({ queryKey: ['students'] })
      await queryClient.invalidateQueries({ queryKey: ['lessons'] })
    } catch (error) {
      toast(errorText(error))
    } finally {
      setPending(false)
    }
  }

  async function copyAll() {
    const lines = (assignments.data ?? [])
      .filter((row) => !row.revoked)
      .map((row) => `${studentName(row)} — ${buildStudentLink(row.token)}`)
    await copy(lines.join('\n'))
  }

  return (
    <TeacherShell>
      <Link to={`/lessons/${id}`} className="text-sm text-muted no-underline">
        ← {lesson.data?.title ?? ru.nav.lessons}
      </Link>
      <h1 className="mb-4 mt-2 font-serif text-4xl">{ru.publish.title}</h1>
      {assignments.isLoading && <Spinner />}
      {noWords && <p className="mb-3 text-sm text-warn">{ru.publish.empty}</p>}
      {missingImage && <p className="mb-3 text-sm text-warn">{ru.publish.needImages}</p>}
      {noExercises && <p className="mb-3 text-sm text-warn">{ru.publish.noExercises}</p>}
      <div className="grid gap-4 rounded-3xl border border-line bg-card p-4">
        <TextArea label={ru.publish.names} placeholder={ru.publish.namesHint} value={names} onChange={(event) => setNames(event.target.value)} />
        {(students.data ?? []).filter((student) => !assignedIds.has(student.id)).length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm text-muted">{ru.publish.existing}</legend>
            <div className="grid gap-1">
              {students.data
                ?.filter((student) => !assignedIds.has(student.id))
                .map((student) => (
                  <label key={student.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(student.id)}
                      onChange={(event) =>
                        setPicked((current) =>
                          event.target.checked ? [...current, student.id] : current.filter((item) => item !== student.id),
                        )
                      }
                    />
                    {student.name}
                  </label>
                ))}
            </div>
          </fieldset>
        )}
        <Button disabled={blocked || pending || (!names.trim() && picked.length === 0)} onClick={() => void createLinks()}>
          {ru.publish.create}
        </Button>
      </div>
      {(assignments.data ?? []).length > 0 && (
        <div className="mt-4">
          <Button variant="soft" onClick={() => void copyAll()}>
            {ru.publish.copyAll}
          </Button>
          <div className="mt-3 grid gap-2">
            {assignments.data?.map((row) => {
              const link = buildStudentLink(row.token)
              return (
                <article key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card p-3">
                  <div>
                    <p className="font-semibold">{studentName(row)}</p>
                    <p className="max-w-xl truncate text-sm text-muted">{row.revoked ? ru.publish.revoked : link}</p>
                  </div>
                  <div className="flex gap-2">
                    {!row.revoked && (
                      <Button variant="ghost" onClick={() => void copy(link)}>
                        {ru.publish.copy}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (row.revoked || window.confirm(ru.publish.revokeConfirm)) {
                          void revokeAssignment(row.id, !row.revoked).then(() =>
                            queryClient.invalidateQueries({ queryKey: ['assignments', id] }),
                          )
                        }
                      }}
                    >
                      {row.revoked ? ru.publish.restore : ru.publish.revoke}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </TeacherShell>
  )
}
