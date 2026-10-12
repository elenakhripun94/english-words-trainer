import { useEffect, useState } from 'react'
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
  setDictionaryAudioIfEmpty,
  updateItem,
  type LessonItem,
} from '../../api/db'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { VOICES, preferredVoice, releaseAudio, resolveAudioUrl, setPreferredVoice, voiceOf, type VoiceId } from '../../lib/audio'
import { CATEGORIES } from '../../lib/categories'
import { lookupTerm } from '../../lib/dictionary'
import { errorText } from '../../lib/errors'
import { resolveImageUrl, saveRemoteImage, suggestImages, uploadLessonImage, type ImageCandidate } from '../../lib/images'
import { playTerm } from '../../lib/speech'
import { suggestTranslation } from '../../lib/translate'
import { onVoiced, useVoicing, voiceItems } from '../../lib/voicing'
import { BulkAddDialog } from './BulkAddDialog'
import { ImagePickerDialog } from './ImagePickerDialog'
import { WordCheck } from './WordCheck'

export function ItemsList({ lessonId, published }: { lessonId: string; published: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const items = useQuery({ queryKey: ['items', lessonId], queryFn: () => listItems(lessonId) })
  const [term, setTerm] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [picker, setPicker] = useState<{ itemId: string; query: string; currentUrl: string | null } | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [finding, setFinding] = useState<Set<string>>(new Set())
  const [hits, setHits] = useState<Record<string, DictionaryHit>>({})
  const [defaultVoice, setDefaultVoice] = useState<VoiceId>(preferredVoice)
  const voicing = useVoicing()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['items', lessonId] })

  useEffect(() => onVoiced(() => void queryClient.invalidateQueries({ queryKey: ['items', lessonId] })), [lessonId, queryClient])

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
        translation: item.translation || translation,
      })
      // A fallback until Kokoro is done; never replaces a generated voice.
      if (hit?.audioUrl) await setDictionaryAudioIfEmpty(item.id, hit.audioUrl)
      await refresh()
    } catch (error) {
      toast(errorText(error))
    } finally {
      setChecking(null)
    }
  }

  /** Puts the best drawing on a new word so the teacher only replaces the misses. */
  async function autoImage(item: LessonItem) {
    setFinding((current) => new Set(current).add(item.id))
    try {
      const [best] = await suggestImages(item.term, 1)
      if (best) {
        await saveRemoteImage(lessonId, item.id, best)
        await refresh()
      }
    } catch {
      // The card shows «Нет картинки», the teacher can pick one by hand.
    } finally {
      setFinding((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  const add = useMutation({
    mutationFn: async () => {
      const position = (items.data?.at(-1)?.position ?? -1) + 1
      return insertItem(lessonId, term.trim(), position)
    },
    onSuccess: async (item) => {
      setTerm('')
      await refresh()
      voiceItems(lessonId, [item], defaultVoice)
      void enrich(item)
      void autoImage(item)
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

  async function chooseVoice(item: LessonItem, choice: VoiceId | 'dictionary') {
    if (choice !== 'dictionary') {
      voiceItems(lessonId, [item], choice)
      return
    }
    const hit = await lookupTerm(item.term).catch(() => null)
    if (!hit?.audioUrl) {
      toast(ru.items.noDictionaryAudio)
      return
    }
    try {
      await updateItem(item.id, { audio_url: hit.audioUrl, audio_source: 'dictionary' })
      await releaseAudio([item.audio_url])
      await refresh()
    } catch (error) {
      toast(errorText(error))
    }
  }

  const unvoiced = (items.data ?? []).filter((item) => !voiceOf(item.audio_source) && !voicing.pending.has(item.id))

  async function pickImage(candidate: ImageCandidate) {
    if (!picker) return
    await saveRemoteImage(lessonId, picker.itemId, candidate)
    setPicker(null)
    await refresh()
  }

  async function upload(file: File) {
    if (!picker) return
    await uploadLessonImage(lessonId, picker.itemId, file)
    setPicker(null)
    await refresh()
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-3xl">{ru.items.title}</h2>
        <Button variant="soft" onClick={() => setBulkOpen(true)}>
          {ru.items.bulk}
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted">
        <label>
          {ru.items.voiceDefault}
          <select
            className="ml-2 rounded-lg border border-line bg-white px-2 py-1 text-ink"
            value={defaultVoice}
            onChange={(event) => {
              const voice = event.target.value as VoiceId
              setDefaultVoice(voice)
              setPreferredVoice(voice)
            }}
          >
            {VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
        </label>
        {unvoiced.length > 0 && (
          <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => voiceItems(lessonId, unvoiced, defaultVoice)}>
            {ru.items.voiceAll} ({unvoiced.length})
          </Button>
        )}
      </div>
      {voicing.model === 'loading' && voicing.pending.size > 0 && (
        <p className="mb-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">
          {ru.items.modelLoading}
          {voicing.total > 0 && `: ${Math.round((100 * voicing.loaded) / voicing.total)}%`}
        </p>
      )}
      {voicing.model === 'error' && <p className="mb-3 rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn">{ru.items.modelError}</p>}
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
        <SortableContext items={(items.data ?? []).map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-3">
            {items.data?.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                checking={checking === item.id}
                finding={finding.has(item.id)}
                voicing={voicing.pending.has(item.id)}
                voiceFailed={voicing.failed.has(item.id)}
                onVoice={(choice) => void chooseVoice(item, choice)}
                onRevoice={() => voiceItems(lessonId, [item], voiceOf(item.audio_source) ?? defaultVoice)}
                hit={hits[item.id] ?? null}
                onDelete={async () => {
                  if (published && !window.confirm(ru.items.removeConfirm)) return
                  try {
                    await deleteItem(item)
                    await refresh()
                  } catch (error) {
                    toast(errorText(error))
                  }
                }}
                onSave={async (patch) => {
                  try {
                    await updateItem(item.id, patch)
                    await refresh()
                    if (patch.term) voiceItems(lessonId, [{ id: item.id, term: patch.term }], voiceOf(item.audio_source) ?? defaultVoice)
                  } catch (error) {
                    toast(errorText(error))
                  }
                }}
                onImage={() => setPicker({ itemId: item.id, query: item.term, currentUrl: resolveImageUrl(item.image_path) })}
                onCheck={() => void enrich(item)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <ImagePickerDialog
        open={Boolean(picker)}
        initialQuery={picker?.query ?? ''}
        currentUrl={picker?.currentUrl}
        onClose={() => setPicker(null)}
        onPick={pickImage}
        onUpload={upload}
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
  checking,
  finding,
  voicing,
  voiceFailed,
  onVoice,
  onRevoice,
  hit,
  onDelete,
  onSave,
  onImage,
  onCheck,
}: {
  item: LessonItem
  checking: boolean
  finding: boolean
  voicing: boolean
  voiceFailed: boolean
  onVoice: (choice: VoiceId | 'dictionary') => void
  onRevoice: () => void
  hit: DictionaryHit | null
  onDelete: () => void
  onSave: (patch: Partial<LessonItem>) => Promise<void>
  onImage: () => void
  onCheck: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const image = resolveImageUrl(item.image_path)
  const [translationAuto, setTranslationAuto] = useState(!item.translation)
  const imageLabel = image ? ru.items.changeImage : ru.items.pickImage

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="grid gap-3 rounded-3xl border border-line bg-card p-3 sm:grid-cols-[7rem_1fr]"
    >
      <button
        type="button"
        onClick={onImage}
        className="group relative overflow-hidden rounded-2xl border border-line bg-white"
        aria-label={imageLabel}
        title={imageLabel}
      >
        {image ? (
          <img src={image} alt="" className="aspect-square w-full object-contain" />
        ) : (
          <span className="flex aspect-square items-center justify-center bg-warn-bg px-2 text-center text-xs text-warn">
            {finding ? ru.items.findingImage : ru.items.noImage}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-center text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {imageLabel}
        </span>
      </button>
      <div className="space-y-2">
        <div className="flex gap-2">
          <button type="button" className="px-1 text-muted" aria-label={ru.items.drag} {...attributes} {...listeners}>
            ⋮⋮
          </button>
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
          <Button variant="ghost" aria-label={ru.items.play} onClick={() => void playTerm(item.term, resolveAudioUrl(item.audio_url))}>
            ▶
          </Button>
          <Button variant="danger" aria-label={ru.items.remove} onClick={onDelete}>
            ×
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
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
          <label className="block text-sm text-muted">
            {ru.items.category}
            <select
              value={item.category ?? ''}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink"
              onChange={(event) => void onSave({ category: event.target.value || null })}
            >
              <option value="">{ru.items.noCategory}</option>
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.emoji} {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted">
            {ru.items.voice}
            <select
              className="ml-2 rounded-lg border border-line bg-white px-2 py-1 text-ink"
              value={voiceOf(item.audio_source) ?? (item.audio_source === 'dictionary' ? 'dictionary' : '')}
              disabled={voicing}
              onChange={(event) => event.target.value && onVoice(event.target.value as VoiceId | 'dictionary')}
            >
              {!item.audio_url && <option value="">{ru.items.voiceBrowser}</option>}
              {VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
              <option value="dictionary">{ru.items.voiceDictionary}</option>
            </select>
          </label>
          {!voicing && (
            <Button variant="ghost" className="px-2 py-1 text-sm" aria-label={ru.items.revoice} title={ru.items.revoice} onClick={onRevoice}>
              ↻
            </Button>
          )}
          {voicing && <span className="text-sm text-muted">{ru.items.voicing}</span>}
          {voiceFailed && !voicing && <span className="text-sm text-bad">{ru.items.voiceFailed}</span>}
          {item.phonetic && <span className="text-sm text-muted">{item.phonetic}</span>}
          <Button variant="ghost" className="px-2 py-1 text-sm" onClick={onCheck} disabled={checking}>
            {ru.items.check}
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-sm" onClick={onImage}>
            {imageLabel}
          </Button>
        </div>
        {(checking || hit) && (
          <WordCheck
            hit={hit}
            pending={checking}
            term={item.term}
            audioUrl={resolveAudioUrl(item.audio_url)}
            onSuggest={(word) => void onSave({ term: word })}
          />
        )}
      </div>
    </article>
  )
}
