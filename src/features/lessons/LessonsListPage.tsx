import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { createLesson, deleteLesson, duplicateLesson, listLessons, updateLesson, type LessonStatus } from '../../api/db'
import { TeacherShell } from '../../components/Shell'
import { useToast } from '../../components/Toast'
import { Badge, Button, Dialog, EmptyState, Spinner, TextField } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'

const tone: Record<LessonStatus, 'neutral' | 'good' | 'warn'> = {
  draft: 'neutral',
  published: 'good',
  archived: 'warn',
}

export function LessonsListPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const lessons = useQuery({ queryKey: ['lessons'], queryFn: listLessons })
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () => createLesson(title.trim()),
    onSuccess: (lesson) => {
      void queryClient.invalidateQueries({ queryKey: ['lessons'] })
      navigate(`/lessons/${lesson.id}`)
    },
    onError: (error) => toast(errorText(error)),
  })

  const copy = useMutation({
    mutationFn: duplicateLesson,
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['lessons'] })
      navigate(`/lessons/${id}`)
    },
    onError: (error) => toast(errorText(error)),
  })

  async function changeStatus(id: string, status: LessonStatus) {
    try {
      await updateLesson(id, { status })
      await queryClient.invalidateQueries({ queryKey: ['lessons'] })
    } catch (error) {
      toast(errorText(error))
    }
  }

  async function remove(id: string) {
    if (!window.confirm(ru.lessons.removeConfirm)) return
    try {
      await deleteLesson(id)
      await queryClient.invalidateQueries({ queryKey: ['lessons'] })
    } catch (error) {
      toast(errorText(error))
    }
  }

  return (
    <TeacherShell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="font-serif text-4xl">{ru.lessons.title}</h1>
        <Button onClick={() => setOpen(true)}>{ru.lessons.create}</Button>
      </div>
      {lessons.isLoading && <Spinner />}
      {lessons.isError && <p className="text-bad">{ru.errors.generic}</p>}
      {lessons.data && lessons.data.length === 0 && <EmptyState>{ru.lessons.empty}</EmptyState>}
      <div className="grid gap-3">
        {lessons.data?.map((lesson) => (
          <article key={lesson.id} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl">
                  <Link to={`/lessons/${lesson.id}`} className="text-ink no-underline">
                    {lesson.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {[lesson.topic, lesson.level, `${lesson.wordCount} ${ru.lessons.words}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Badge tone={tone[lesson.status]}>{ru.lessons.status[lesson.status]}</Badge>
            </div>
            <p className="mt-3 text-sm">
              {ru.lessons.finished} {lesson.finished} {ru.lessons.of} {lesson.assigned}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/lessons/${lesson.id}`} className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent no-underline">
                {ru.lessons.open}
              </Link>
              <Link to={`/lessons/${lesson.id}/publish`} className="rounded-xl px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-black/5">
                {ru.nav.links}
              </Link>
              <Link to={`/lessons/${lesson.id}/results`} className="rounded-xl px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-black/5">
                {ru.nav.results}
              </Link>
              <Button variant="ghost" onClick={() => copy.mutate(lesson.id)}>
                {ru.lessons.duplicate}
              </Button>
              {lesson.status !== 'archived' && (
                <Button variant="ghost" onClick={() => void changeStatus(lesson.id, 'archived')}>
                  {ru.lessons.archive}
                </Button>
              )}
              <Button variant="danger" onClick={() => void remove(lesson.id)}>
                {ru.delete}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog open={open} title={ru.lessons.create} onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (title.trim()) create.mutate()
          }}
        >
          <TextField label={ru.lessons.name} value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          <Button type="submit" disabled={create.isPending || !title.trim()}>
            {ru.lessons.create}
          </Button>
        </form>
      </Dialog>
    </TeacherShell>
  )
}
