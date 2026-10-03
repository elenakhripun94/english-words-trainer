import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getLesson } from '../../api/db'
import { TeacherShell } from '../../components/Shell'
import { Spinner } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { ExercisesConfig } from '../exercises/ExercisesConfig'
import { ItemsList } from '../items/ItemsList'
import { LessonMetaForm } from './LessonMetaForm'

export function LessonEditorPage() {
  const { id = '' } = useParams()
  const lesson = useQuery({ queryKey: ['lesson', id], queryFn: () => getLesson(id) })

  return (
    <TeacherShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/lessons" className="text-sm text-muted no-underline">
          ← {ru.nav.lessons}
        </Link>
        <div className="flex gap-3 text-sm font-semibold">
          <Link to={`/lessons/${id}/publish`} className="text-accent no-underline">
            {ru.nav.links}
          </Link>
          <Link to={`/lessons/${id}/results`} className="text-accent no-underline">
            {ru.nav.results}
          </Link>
        </div>
      </div>
      {lesson.isLoading && <Spinner />}
      {lesson.data === null && <p>{ru.lessons.notFound}</p>}
      {lesson.data && (
        <>
          <h1 className="mb-4 font-serif text-4xl">{lesson.data.title}</h1>
          <LessonMetaForm key={`${lesson.data.id}:${lesson.data.updated_at}`} lesson={lesson.data} />
          <ItemsList lessonId={id} locked={lesson.data.status !== 'draft'} />
          <ExercisesConfig lessonId={id} />
        </>
      )}
    </TeacherShell>
  )
}
