import { useEffect, useState } from 'react'
import { Button, Dialog, TextField } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { searchImages, type ImageCandidate } from '../../lib/images'

export function ImagePickerDialog({
  open,
  initialQuery,
  onClose,
  onPick,
  onUpload,
}: {
  open: boolean
  initialQuery: string
  onClose: () => void
  onPick: (candidate: ImageCandidate) => void
  onUpload?: (file: File) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [page, setPage] = useState(1)
  const [candidates, setCandidates] = useState<ImageCandidate[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'search' | 'upload'>('search')

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setActiveQuery(initialQuery)
    setPage(1)
    setCandidates([])
    setTab('search')
  }, [open, initialQuery])

  useEffect(() => {
    if (!open || tab !== 'search' || !activeQuery.trim()) return
    let cancelled = false
    setPending(true)
    setError(null)
    searchImages(activeQuery.trim(), page)
      .then((result) => {
        if (cancelled) return
        setCandidates((current) => (page === 1 ? result.candidates : [...current, ...result.candidates]))
        if (result.warnings.length) setError(result.warnings.join(' '))
      })
      .catch(() => {
        if (!cancelled) setError(ru.errors.generic)
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, activeQuery, page, tab])

  return (
    <Dialog open={open} title={ru.images.title} onClose={onClose} wide>
      <div className="mb-3 flex gap-2">
        <Button variant={tab === 'search' ? 'soft' : 'ghost'} onClick={() => setTab('search')}>
          {ru.images.search}
        </Button>
        {onUpload && (
          <Button variant={tab === 'upload' ? 'soft' : 'ghost'} onClick={() => setTab('upload')}>
            {ru.images.upload}
          </Button>
        )}
      </div>
      {tab === 'search' && (
        <>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setCandidates([])
              setPage(1)
              setActiveQuery(query.trim())
            }}
          >
            <div className="flex-1">
              <TextField label={ru.images.search} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Button className="self-end" type="submit">
              {ru.images.search}
            </Button>
          </form>
          {error && <p className="mb-2 text-sm text-warn">{error}</p>}
          {candidates.length === 0 && !pending && <p className="text-sm text-muted">{ru.images.empty}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {candidates.map((candidate) => (
              <button
                key={`${candidate.source}-${candidate.id}`}
                type="button"
                className="overflow-hidden rounded-2xl border border-line"
                onClick={() => onPick(candidate)}
                aria-label={ru.images.pick}
              >
                <img src={candidate.thumbUrl} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
          {candidates.length > 0 && (
            <Button className="mt-3" variant="ghost" disabled={pending} onClick={() => setPage((value) => value + 1)}>
              {ru.images.more}
            </Button>
          )}
          {pending && <p className="mt-2 text-sm text-muted">{ru.loading}</p>}
        </>
      )}
      {tab === 'upload' && onUpload && (
        <input
          type="file"
          accept="image/*"
          aria-label={ru.images.upload}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUpload(file)
          }}
        />
      )}
    </Dialog>
  )
}
