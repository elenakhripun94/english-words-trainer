import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateLesson, type Lesson } from '../../api/db'
import { useToast } from '../../components/Toast'
import { TextArea, TextField } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'

export const lessonMetaFormId = 'lesson-meta'

export function LessonMetaForm({ lesson }: { lesson: Lesson }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(lesson.title)
  const [description, setDescription] = useState(lesson.description ?? '')

  const save = useMutation({
    mutationFn: () =>
      updateLesson(lesson.id, {
        title: title.trim() || lesson.title,
        description: description.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lesson', lesson.id] })
      void queryClient.invalidateQueries({ queryKey: ['lessons'] })
      toast(ru.lessons.saved)
    },
    onError: (error) => toast(errorText(error)),
  })

  const noText = useMutation({
    mutationFn: (value: boolean) => updateLesson(lesson.id, { no_text: value }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lesson', lesson.id] }),
    onError: (error) => toast(errorText(error)),
  })

  return (
    <form
      id={lessonMetaFormId}
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <TextField label={ru.lessons.name} value={title} onChange={(event) => setTitle(event.target.value)} required />
      <TextArea label={ru.lessons.description} value={description} onChange={(event) => setDescription(event.target.value)} />
      <label className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={lesson.no_text}
          disabled={noText.isPending}
          onChange={(event) => noText.mutate(event.target.checked)}
        />
        <span>
          <span className="font-semibold">{ru.lessons.noText}</span>
          <span className="mt-0.5 block text-sm text-muted">{ru.lessons.noTextHint}</span>
        </span>
      </label>
    </form>
  )
}
