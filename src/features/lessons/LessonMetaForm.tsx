import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateLesson, type Lesson } from '../../api/db'
import { useToast } from '../../components/Toast'
import { Button, SelectField, TextArea, TextField } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'

const levels = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function LessonMetaForm({ lesson }: { lesson: Lesson }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(lesson.title)
  const [topic, setTopic] = useState(lesson.topic ?? '')
  const [level, setLevel] = useState(lesson.level ?? '')
  const [description, setDescription] = useState(lesson.description ?? '')

  const save = useMutation({
    mutationFn: () =>
      updateLesson(lesson.id, {
        title: title.trim() || lesson.title,
        topic: topic.trim() || null,
        level: level || null,
        description: description.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lesson', lesson.id] })
      void queryClient.invalidateQueries({ queryKey: ['lessons'] })
    },
    onError: (error) => toast(errorText(error)),
  })

  return (
    <form
      className="grid gap-4 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <TextField label={ru.lessons.name} value={title} onChange={(event) => setTitle(event.target.value)} required />
      <TextField label={ru.lessons.topic} value={topic} onChange={(event) => setTopic(event.target.value)} />
      <SelectField label={ru.lessons.level} value={level} onChange={(event) => setLevel(event.target.value)}>
        {levels.map((item) => (
          <option key={item || 'none'} value={item}>
            {item || '—'}
          </option>
        ))}
      </SelectField>
      <div className="sm:col-span-2">
        <TextArea label={ru.lessons.description} value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div>
        <Button type="submit" disabled={save.isPending}>
          {ru.save}
        </Button>
      </div>
    </form>
  )
}
