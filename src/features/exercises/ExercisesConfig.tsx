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
  defaultSettings,
  isExerciseAvailable,
  unavailableReason,
  type ExerciseSettings,
  type ExerciseType,
} from '../../lib/exercises'

export function ExercisesConfig({ lessonId }: { lessonId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const exercises = useQuery({ queryKey: ['exercises', lessonId], queryFn: () => listExercises(lessonId) })
  const items = useQuery({ queryKey: ['items', lessonId], queryFn: () => listItems(lessonId) })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const enabled = exercises.data ?? []
  const enabledTypes = new Set(enabled.map((exercise) => exercise.type))
  const rest = EXERCISE_TYPES.filter((type) => !enabledTypes.has(type))
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

  async function saveSettings(type: ExerciseType, settings: ExerciseSettings) {
    try {
      await updateExercise(lessonId, type, { settings })
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
                  settings={row?.settings ?? defaultSettings(type)}
                  available={available}
                  reason={reason}
                  onToggle={(on) => void toggle(type, on)}
                  onSettings={(settings) => void saveSettings(type, settings)}
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
  settings,
  available,
  reason,
  onToggle,
  onSettings,
}: {
  type: ExerciseType
  enabled: boolean
  settings: ExerciseSettings
  available: boolean
  reason: string | null
  onToggle: (on: boolean) => void
  onSettings: (settings: ExerciseSettings) => void
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
          <button type="button" className="cursor-grab text-muted" aria-label={ru.items.drag} {...sortable.attributes} {...sortable.listeners}>
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
          {type === 'pronounce' && <span className="mt-1 block text-sm text-warn">{ru.exercises.pronounceHint}</span>}
          {reason && (
            <span className="mt-1 block text-sm text-warn">
              {reason}. {ru.exercises.hidden}
            </span>
          )}
        </span>
      </label>
      {enabled && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted">{ru.exercises.extra}</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(type === 'pick_word' || type === 'pick_image' || type === 'pick_translation') && (
              <NumberSetting
                label={ru.exercises.options}
                value={settings.options ?? 4}
                min={2}
                max={6}
                onChange={(options) => onSettings({ ...settings, options })}
              />
            )}
            {type === 'match_pairs' && (
              <NumberSetting
                label={ru.exercises.pairs}
                value={settings.pairsPerRound ?? 6}
                min={3}
                max={8}
                onChange={(pairsPerRound) => onSettings({ ...settings, pairsPerRound })}
              />
            )}
            {type === 'spell' && (
              <NumberSetting
                label={ru.exercises.extraLetters}
                value={settings.extraLetters ?? 0}
                min={0}
                max={4}
                onChange={(extraLetters) => onSettings({ ...settings, extraLetters })}
              />
            )}
            {type === 'pronounce' && (
              <NumberSetting
                label={ru.exercises.tries}
                value={settings.maxTries ?? 3}
                min={1}
                max={5}
                onChange={(maxTries) => onSettings({ ...settings, maxTries })}
              />
            )}
          </div>
        </details>
      )}
    </article>
  )
}

function NumberSetting({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-ink"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
