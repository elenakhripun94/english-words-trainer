import { useState } from 'react'
import type { DictionaryHit } from '../../lib/dictionary'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteItem,
  insertItem,
  listItems,
  reorderItems,
  updateItem,
  type LessonItem,
} from '../../api/db'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { lookupTerm } from '../../lib/dictionary'
import { errorText } from '../../lib/errors'
import { resolveImageUrl, saveRemoteImage, uploadLessonImage, type ImageCandidate } from '../../lib/images'
import { playTerm } from '../../lib/speech'
import { suggestTranslation } from '../../lib/translate'
import { BulkAddDialog } from './BulkAddDialog'
import { ImagePickerDialog } from './ImagePickerDialog'
import { WordCheck } from './WordCheck'

export function ItemsList({ lessonId, locked }: { lessonId: string; locked: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const items = useQuery({ queryKey: ['items', lessonId], queryFn: () => listItems(lessonId) })
  const [term, setTerm] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [picker, setPicker] = useState<{ itemId: string; query: string } | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [hits, setHits] = useState<Record<string, DictionaryHit>>({})
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['items', lessonId] })

  async function enrich(item: LessonItem) {
    setChecking(item.id)
    try {
      const [hit, translation] = await Promise.all([
        lookupTerm(item.term).catch(() => null),
        suggestTranslation(item.term),
      ])
      if (hit) setHits((current) => ({ ...current, [item.id]: hit }))
      await updateItem(item.id, {
        phonetic: hit?.phonetic ?? null,
        audio_url: hit?.audioUrl ?? null,
        translation: item.translation || translation,
      })
      await refresh()
    } catch (error) {
      toast(errorText(error))
    } finally {
      setChecking(null)
    }
  }

  const add = useMutation({
    mutationFn: async () => {
      const position = (items.data?.at(-1)?.position ?? -1) + 1
      return insertItem(lessonId, term.trim(), position)
    },
    onSuccess: async () => {
      setTerm('')
      await refresh()
    },
    onError: (error) => toast(errorText(error)),
  })

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !items.data) return
    const oldIndex = items.data.findIndex((item) => item.id === active.id)
    const newIndex = items.data.findIndex((item) => item.id === over.id)
    const next = arrayMove(items.data, oldIndex, newIndex)
    queryClient.setQueryData(['items', lessonId], next)
    try {
      await reorderItems(next.map((item) => item.id))
    } catch (error) {
      toast(errorText(error))
      await refresh()
    }
  }

  async function pickImage(candidate: ImageCandidate) {
    if (!picker) return
    try {
      await saveRemoteImage(lessonId, picker.itemId, candidate)
      setPicker(null)
      await refresh()
    } catch (error) {
      toast(errorText(error))
    }
  }

  async function upload(file: File) {
    if (!picker) return
    try {
      await uploadLessonImage(lessonId, picker.itemId, file)
      setPicker(null)
      await refresh()
    } catch (error) {
      toast(errorText(error))
    }
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-3xl">{ru.items.title}</h2>
        {!locked && (
          <Button variant="soft" onClick={() => setBulkOpen(true)}>
            {ru.items.bulk}
          </Button>
        )}
      </div>
      {locked && <p className="mb-3 rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn">{ru.lessons.locked}</p>}
      {!locked && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (term.trim()) add.mutate()
          }}
        >
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={ru.items.placeholder}
            aria-label={ru.items.placeholder}
            className="flex-1 rounded-xl border border-line bg-white px-3 py-2.5"
          />
          <Button type="submit" disabled={add.isPending || !term.trim()}>
            {ru.items.add}
          </Button>
        </form>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
        <SortableContext items={(items.data ?? []).map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-3">
            {items.data?.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                locked={locked}
                checking={checking === item.id}
                hit={hits[item.id] ?? null}
                onDelete={async () => {
                  try {
                    await deleteItem(item.id)
                    await refresh()
                  } catch (error) {
                    toast(errorText(error))
                  }
                }}
                onSave={async (patch) => {
                  try {
                    await updateItem(item.id, patch)
                    await refresh()
                  } catch (error) {
                    toast(errorText(error))
                  }
                }}
                onImage={() => setPicker({ itemId: item.id, query: item.term })}
                onCheck={() => void enrich(item)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <ImagePickerDialog
        open={Boolean(picker)}
        initialQuery={picker?.query ?? ''}
        onClose={() => setPicker(null)}
        onPick={(candidate) => void pickImage(candidate)}
        onUpload={(file) => void upload(file)}
      />
      <BulkAddDialog
        open={bulkOpen}
        lessonId={lessonId}
        existingTerms={(items.data ?? []).map((item) => item.term)}
        startPosition={(items.data?.at(-1)?.position ?? -1) + 1}
        onClose={() => setBulkOpen(false)}
        onSaved={() => void refresh()}
      />
    </section>
  )
}

function ItemCard({
  item,
  locked,
  checking,
  hit,
  onDelete,
  onSave,
  onImage,
  onCheck,
}: {
  item: LessonItem
  locked: boolean
  checking: boolean
  hit: DictionaryHit | null
  onDelete: () => void
  onSave: (patch: Partial<LessonItem>) => Promise<void>
  onImage: () => void
  onCheck: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: locked })
  const image = resolveImageUrl(item.image_path)
  const [translationAuto, setTranslationAuto] = useState(!item.translation)

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="grid gap-3 rounded-3xl border border-line bg-card p-3 sm:grid-cols-[7rem_1fr]"
    >
      <button type="button" onClick={onImage} className="relative overflow-hidden rounded-2xl border border-line" aria-label={ru.items.changeImage}>
        {image ? (
          <img src={image} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <span className="flex aspect-square items-center justify-center bg-warn-bg px-2 text-center text-xs text-warn">{ru.items.noImage}</span>
        )}
      </button>
      <div className="space-y-2">
        <div className="flex gap-2">
          {!locked && (
            <button type="button" className="px-1 text-muted" aria-label={ru.items.drag} {...attributes} {...listeners}>
              ⋮⋮
            </button>
          )}
          <input
            key={item.term}
            defaultValue={item.term}
            aria-label={ru.items.placeholder}
            className="flex-1 rounded-xl border border-line px-3 py-2 font-serif text-xl"
            onBlur={(event) => {
              const next = event.target.value.trim()
              if (next && next !== item.term) void onSave({ term: next })
            }}
          />
          <Button variant="ghost" aria-label={ru.items.play} onClick={() => void playTerm(item.term, item.audio_url)}>
            ▶
          </Button>
          {!locked && (
            <Button variant="danger" aria-label={ru.items.remove} onClick={onDelete}>
              ×
            </Button>
          )}
        </div>
        <label className="block text-sm text-muted">
          {ru.items.translation}
          {translationAuto && item.translation ? ` · ${ru.items.auto}` : ''}
          <input
            key={item.translation ?? ''}
            defaultValue={item.translation ?? ''}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base text-ink"
            onChange={() => setTranslationAuto(false)}
            onBlur={(event) => {
              const next = event.target.value.trim()
              if (next !== (item.translation ?? '')) void onSave({ translation: next || null })
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {item.phonetic && <span className="text-sm text-muted">{item.phonetic}</span>}
          <Button variant="ghost" className="px-2 py-1 text-sm" onClick={onCheck} disabled={checking}>
            {ru.items.check}
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-sm" onClick={onImage}>
            {ru.items.changeImage}
          </Button>
        </div>
        {(checking || hit) && (
          <WordCheck
            hit={hit}
            pending={checking}
            term={item.term}
            audioUrl={item.audio_url}
            onSuggest={(word) => void onSave({ term: word })}
          />
        )}
      </div>
    </article>
  )
}
