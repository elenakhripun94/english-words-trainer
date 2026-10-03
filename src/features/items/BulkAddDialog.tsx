import { useState } from 'react'
import { insertItems } from '../../api/db'
import { Button, Dialog, TextArea } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { parseBulkInput, type BulkDiscard } from '../../lib/bulkParse'
import { lookupTerm, type DictionaryHit } from '../../lib/dictionary'
import { searchImages, saveRemoteImage, type ImageCandidate } from '../../lib/images'
import { pool } from '../../lib/pool'
import { playTerm } from '../../lib/speech'
import { suggestTranslation } from '../../lib/translate'
import { ImagePickerDialog } from './ImagePickerDialog'

type ReviewRow = {
  key: string
  term: string
  translation: string
  translationAuto: boolean
  phonetic: string | null
  audioUrl: string | null
  hit: DictionaryHit | null
  candidates: ImageCandidate[]
  selected: ImageCandidate | null
  status: 'loading' | 'ready' | 'saving' | 'error'
  error?: string
  itemId?: string
}

export function BulkAddDialog({
  open,
  lessonId,
  existingTerms,
  startPosition,
  onClose,
  onSaved,
}: {
  open: boolean
  lessonId: string
  existingTerms: string[]
  startPosition: number
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [discarded, setDiscarded] = useState<BulkDiscard[]>([])
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  function reset() {
    setText('')
    setRows([])
    setDiscarded([])
    setStep('input')
    setProgress(null)
  }

  function patch(key: string, partial: Partial<ReviewRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...partial } : row)))
  }

  async function loadRow(row: ReviewRow) {
    patch(row.key, { status: 'loading', error: undefined })
    const [hit, translation, images] = await Promise.all([
      lookupTerm(row.term).catch(() => null),
      row.translation ? Promise.resolve(row.translation) : suggestTranslation(row.term).catch(() => null),
      searchImages(row.term).catch(() => ({ candidates: [] as ImageCandidate[], warnings: [] })),
    ])
    patch(row.key, {
      status: 'ready',
      hit,
      phonetic: hit?.phonetic ?? null,
      audioUrl: hit?.audioUrl ?? null,
      translation: row.translation || translation || '',
      translationAuto: !row.translation && Boolean(translation),
      candidates: images.candidates.slice(0, 6),
      selected: images.candidates[0] ?? null,
    })
  }

  async function analyze() {
    const parsed = parseBulkInput(text, existingTerms)
    const next = parsed.rows.map((row) => ({
      key: crypto.randomUUID(),
      term: row.term,
      translation: row.translation ?? '',
      translationAuto: false,
      phonetic: null,
      audioUrl: null,
      hit: null,
      candidates: [],
      selected: null,
      status: 'loading' as const,
    }))
    setDiscarded(parsed.discarded)
    setRows(next)
    setStep('review')
    await pool(
      next.map((row) => () => loadRow(row)),
      3,
    )
  }

  async function save() {
    const ready = rows.filter((row) => row.selected && !row.itemId)
    const failed: ReviewRow[] = []
    if (ready.length === 0 && rows.every((row) => row.itemId)) {
      onSaved()
      reset()
      onClose()
      return
    }
    setProgress(`${ru.bulk.saving} 0/${ready.length}`)
    let inserted: Awaited<ReturnType<typeof insertItems>> = []
    try {
      inserted = await insertItems(
        lessonId,
        ready.map((row) => ({
          term: row.term,
          translation: row.translation || null,
          phonetic: row.phonetic,
          audio_url: row.audioUrl,
        })),
        startPosition,
      )
    } catch {
      setRows((current) => current.map((row) => ({ ...row, status: 'error', error: ru.errors.generic })))
      setProgress(null)
      return
    }
    ready.forEach((row, index) => {
      const item = inserted[index]
      if (item) patch(row.key, { itemId: item.id })
    })
    let done = 0
    await pool(
      ready.map((row, index) => async () => {
        const item = inserted[index]
        if (!item || !row.selected) return
        try {
          await saveRemoteImage(lessonId, item.id, row.selected)
          patch(row.key, { status: 'ready', itemId: item.id })
        } catch {
          patch(row.key, { status: 'error', itemId: item.id, error: ru.bulk.failed })
          failed.push(row)
        } finally {
          done += 1
          setProgress(`${ru.bulk.saving} ${done}/${ready.length}`)
        }
      }),
      3,
    )
    onSaved()
    setProgress(null)
    if (failed.length === 0) {
      reset()
      onClose()
      return
    }
    setRows((current) => current.filter((row) => failed.some((item) => item.key === row.key) || !row.selected))
  }

  const pickerRow = rows.find((row) => row.key === pickerKey)
  const addable = rows.filter((row) => row.selected).length

  return (
    <>
      <Dialog
        open={open}
        wide
        title={ru.bulk.title}
        onClose={() => {
          reset()
          onClose()
        }}
      >
        {step === 'input' ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void analyze()
            }}
          >
            <p className="text-sm text-muted">{ru.bulk.hint}</p>
            <TextArea label={ru.bulk.example} value={text} onChange={(event) => setText(event.target.value)} />
            <Button type="submit" disabled={!text.trim()}>
              {ru.bulk.next}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            {discarded.length > 0 && (
              <p className="text-sm text-muted">
                {ru.bulk.discarded}:{' '}
                {discarded.map((item) => `${item.raw || '∅'} (${ru.bulk.reasons[item.reason]})`).join(', ')}
              </p>
            )}
            {rows.map((row) => (
              <BulkReviewTable
                key={row.key}
                row={row}
                onChange={(partial) => patch(row.key, partial)}
                onReload={() => void loadRow({ ...row, ...{ status: 'loading' } })}
                onRemove={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                onMore={() => setPickerKey(row.key)}
                onRetry={() => void retryImage(row)}
              />
            ))}
            {progress && <p className="text-sm text-muted">{progress}</p>}
            <Button disabled={addable === 0 || Boolean(progress)} onClick={() => void save()}>
              {ru.bulk.add} {addable}
            </Button>
          </div>
        )}
      </Dialog>
      <ImagePickerDialog
        open={Boolean(pickerRow)}
        initialQuery={pickerRow?.term ?? ''}
        onClose={() => setPickerKey(null)}
        onPick={(candidate) => {
          if (!pickerRow) return
          patch(pickerRow.key, {
            selected: candidate,
            candidates: [candidate, ...pickerRow.candidates.filter((item) => item.id !== candidate.id)].slice(0, 6),
          })
          setPickerKey(null)
        }}
      />
    </>
  )

  async function retryImage(row: ReviewRow) {
    if (!row.itemId || !row.selected) return
    patch(row.key, { status: 'saving', error: undefined })
    try {
      await saveRemoteImage(lessonId, row.itemId, row.selected)
      patch(row.key, { status: 'ready' })
      onSaved()
    } catch {
      patch(row.key, { status: 'error', error: ru.bulk.failed })
    }
  }
}

function BulkReviewTable({
  row,
  onChange,
  onReload,
  onRemove,
  onMore,
  onRetry,
}: {
  row: ReviewRow
  onChange: (partial: Partial<ReviewRow>) => void
  onReload: () => void
  onRemove: () => void
  onMore: () => void
  onRetry: () => void
}) {
  return (
    <article className="rounded-2xl border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={row.term}
          aria-label={ru.items.placeholder}
          className="rounded-xl border border-line px-3 py-2 font-serif text-xl"
          onChange={(event) => onChange({ term: event.target.value })}
          onBlur={() => onReload()}
        />
        <input
          value={row.translation}
          aria-label={ru.items.translation}
          placeholder={ru.items.translation}
          className="rounded-xl border border-line px-3 py-2"
          onChange={(event) => onChange({ translation: event.target.value, translationAuto: false })}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {row.status === 'loading' && <span className="text-muted">{ru.loading}</span>}
        {row.phonetic && <span className="text-muted">{row.phonetic}</span>}
        {row.translationAuto && <span className="text-muted">{ru.items.auto}</span>}
        <Button variant="ghost" className="px-2 py-1 text-sm" aria-label={ru.items.play} onClick={() => void playTerm(row.term, row.audioUrl)}>
          {ru.items.play}
        </Button>
        <Button variant="ghost" className="px-2 py-1 text-sm" onClick={onRemove}>
          {ru.delete}
        </Button>
        {row.status === 'error' && (
          <Button variant="soft" className="px-2 py-1 text-sm" onClick={onRetry}>
            {ru.retry}
          </Button>
        )}
      </div>
      {row.hit && !row.hit.found && <p className="mt-2 text-sm text-warn">{ru.items.missing}</p>}
      {row.hit && !row.hit.found && row.hit.suggestions.length > 0 && (
        <p className="text-sm text-muted">
          {ru.items.suggestions}:{' '}
          {row.hit.suggestions.map((word) => (
            <button key={word} type="button" className="mr-2 underline" onClick={() => onChange({ term: word })}>
              {word}
            </button>
          ))}
        </p>
      )}
      {!row.selected && row.status === 'ready' && <p className="mt-2 text-sm text-warn">{ru.bulk.noPicture}</p>}
      {row.error && <p className="mt-2 text-sm text-bad">{row.error}</p>}
      <div className="mt-2 flex gap-2 overflow-x-auto">
        {row.candidates.map((candidate) => (
          <button
            key={`${candidate.source}-${candidate.id}`}
            type="button"
            className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${row.selected?.id === candidate.id ? 'border-accent' : 'border-transparent'}`}
            onClick={() => onChange({ selected: candidate })}
            aria-label={ru.images.pick}
          >
            <img src={candidate.thumbUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        <Button variant="ghost" onClick={onMore}>
          {ru.images.more}
        </Button>
      </div>
    </article>
  )
}
