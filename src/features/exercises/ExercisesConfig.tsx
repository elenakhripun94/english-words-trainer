import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { disableExercise, enableExercise, enableExercises, listExercises, listItems, updateExercise, type LessonExercise } from '../../api/db'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { errorText } from '../../lib/errors'
import {
  EXERCISE_TYPES,
  NO_TEXT_EXERCISE_ORDER,
  PICTURE_EXERCISES,
  isExerciseAvailable,
  unavailableReason,
  type ExerciseSettings,
  type ExerciseType,
  type MemoryVariant,
} from '../../lib/exercises'

export function ExercisesConfig({ lessonId, noText }: { lessonId: string; noText: boolean }) {
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

  async function enableKidsSet() {
    try {
      await enableExercises(lessonId, NO_TEXT_EXERCISE_ORDER)
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-3xl">{ru.exercises.title}</h2>
        {noText && NO_TEXT_EXERCISE_ORDER.some((type) => !enabledTypes.has(type)) && (
          <Button variant="soft" onClick={() => void enableKidsSet()}>
            {ru.exercises.kidsSet}
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
        <SortableContext items={enabled.map((exercise) => exercise.type)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2">
            {order.map((type) => {
              const row = enabled.find((exercise) => exercise.type === type)
              const available = isExerciseAvailable(type, items.data ?? [], noText)
              const reason = unavailableReason(type, items.data ?? [], noText)
              return (
                <ExerciseRow
                  key={type}
                  type={type}
                  row={row}
                  enabled={Boolean(row)}
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
  row,
  enabled,
  available,
  reason,
  onToggle,
  onSettings,
}: {
  type: ExerciseType
  row: LessonExercise | undefined
  enabled: boolean
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
      <div className="flex items-start gap-2">
        {/* Outside the label: a label passes its taps to the first control inside, which would be this handle. */}
        {enabled && (
          <button type="button" className="touch-none px-1 text-muted" aria-label={ru.items.drag} {...sortable.attributes} {...sortable.listeners}>
            ⋮⋮
          </button>
        )}
        <label className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0"
            checked={enabled}
            disabled={!enabled && !available}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <span>
            <span className="font-semibold">{ru.exercises.names[type]}</span>
            {PICTURE_EXERCISES.has(type) && (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{ru.exercises.noReading}</span>
            )}
            <span className="mt-0.5 block text-sm text-muted">{ru.exercises.blurbs[type]}</span>
            {reason && (
              <span className="mt-1 block text-sm text-warn">
                {reason}. {ru.exercises.hidden}
              </span>
            )}
          </span>
        </label>
      </div>
      {row && <ExerciseSettingsRow type={type} settings={row.settings} onChange={onSettings} />}
    </article>
  )
}

const OPTION_EXERCISES: ReadonlySet<ExerciseType> = new Set(['listen_find', 'feed', 'shadow', 'balloons', 'whats_missing'])

function ExerciseSettingsRow({
  type,
  settings,
  onChange,
}: {
  type: ExerciseType
  settings: ExerciseSettings
  onChange: (settings: ExerciseSettings) => void
}) {
  const select = 'ml-2 rounded-lg border border-line bg-white px-2 py-1'
  if (OPTION_EXERCISES.has(type)) {
    return (
      <label className="mt-2 block pl-8 text-sm text-muted">
        {ru.exercises.options}
        <select className={select} value={settings.options ?? 3} onChange={(event) => onChange({ ...settings, options: Number(event.target.value) })}>
          {[2, 3, 4].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (type === 'memory_images') {
    return (
      <div className="mt-2 flex flex-wrap gap-3 pl-8 text-sm text-muted">
        <label>
          {ru.exercises.variant}
          <select
            className={select}
            value={settings.variant ?? 'same'}
            onChange={(event) => onChange({ ...settings, variant: event.target.value as MemoryVariant })}
          >
            {(['same', 'sound'] as const).map((value) => (
              <option key={value} value={value}>
                {ru.exercises.variants[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ru.exercises.pairs}
          <select className={select} value={settings.pairsPerRound ?? 4} onChange={(event) => onChange({ ...settings, pairsPerRound: Number(event.target.value) })}>
            {[3, 4, 6].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
    )
  }
  if (type === 'puzzle') {
    return (
      <label className="mt-2 block pl-8 text-sm text-muted">
        {ru.exercises.pieces}
        <select className={select} value={settings.pieces ?? 4} onChange={(event) => onChange({ ...settings, pieces: Number(event.target.value) })}>
          {[2, 3, 4, 6].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return null
}
