import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { disableExercise, enableExercise, listExercises, listItems, updateExercise } from '../../api/db'
import { useToast } from '../../components/Toast'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'
import {
  EXERCISE_TYPES,
  isExerciseAvailable,
  unavailableReason,
  type ExerciseType,
} from '../../lib/exercises'

export function ExercisesConfig({ lessonId }: { lessonId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const exercises = useQuery({ queryKey: ['exercises', lessonId], queryFn: () => listExercises(lessonId) })
  const items = useQuery({ queryKey: ['items', lessonId], queryFn: () => listItems(lessonId) })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const listed = EXERCISE_TYPES.filter((type) => type !== 'pronounce')
  const enabled = (exercises.data ?? []).filter((exercise) => exercise.type !== 'pronounce')
  const enabledTypes = new Set(enabled.map((exercise) => exercise.type))
  const rest = listed.filter((type) => !enabledTypes.has(type))
  const order = [...enabled.map((exercise) => exercise.type), ...rest]

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['exercises', lessonId] })
  }

  async function toggle(type: ExerciseType, on: boolean) {
    try {
      if (on) await enableExercise(lessonId, type, enabled.length)
      else await disableExercise(lessonId, type)
      await refresh()
    } catch (error) {
      toast(errorText(error))
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = enabled.map((exercise) => exercise.type)
    const oldIndex = ids.indexOf(active.id as ExerciseType)
    const newIndex = ids.indexOf(over.id as ExerciseType)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(ids, oldIndex, newIndex)
    try {
      await Promise.all(next.map((type, position) => updateExercise(lessonId, type, { position })))
      await refresh()
    } catch (error) {
      toast(errorText(error))
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-serif text-3xl">{ru.exercises.title}</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
        <SortableContext items={enabled.map((exercise) => exercise.type)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2">
            {order.map((type) => {
              const row = enabled.find((exercise) => exercise.type === type)
              const available = isExerciseAvailable(type, items.data ?? [])
              const reason = unavailableReason(type, items.data ?? [])
              return (
                <ExerciseRow
                  key={type}
                  type={type}
                  enabled={Boolean(row)}
                  available={available}
                  reason={reason}
                  onToggle={(on) => void toggle(type, on)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function ExerciseRow({
  type,
  enabled,
  available,
  reason,
  onToggle,
}: {
  type: ExerciseType
  enabled: boolean
  available: boolean
  reason: string | null
  onToggle: (on: boolean) => void
}) {
  const sortable = useSortable({ id: type, disabled: !enabled })
  return (
    <article
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="rounded-2xl border border-line bg-card p-3"
    >
      <label className="flex items-start gap-3">
        {enabled && (
          <button type="button" className="text-muted" aria-label={ru.items.drag} {...sortable.attributes} {...sortable.listeners}>
            ⋮⋮
          </button>
        )}
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          disabled={!enabled && !available}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span>
          <span className="font-semibold">{ru.exercises.names[type]}</span>
          <span className="mt-0.5 block text-sm text-muted">{ru.exercises.blurbs[type]}</span>
          {reason && (
            <span className="mt-1 block text-sm text-warn">
              {reason}. {ru.exercises.hidden}
            </span>
          )}
        </span>
      </label>
    </article>
  )
}
