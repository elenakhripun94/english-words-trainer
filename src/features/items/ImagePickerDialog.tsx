import { useEffect, useState } from 'react'
import { Button, Dialog, TextField } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { cx } from '../../lib/cx'
import { errorText } from '../../lib/errors'
import { SOURCES_BY_KIND, searchSource, type ImageCandidate, type ImageKind, type ImageSource } from '../../lib/images'

type SourceState = { status: 'loading' | 'ready' | 'error'; candidates: ImageCandidate[]; exhausted: boolean }

export function ImagePickerDialog({
  open,
  initialQuery,
  currentUrl,
  onClose,
  onPick,
  onUpload,
}: {
  open: boolean
  initialQuery: string
  currentUrl?: string | null
  onClose: () => void
  /** Resolves when the picture is saved; the dialog shows progress until then. */
  onPick: (candidate: ImageCandidate) => Promise<void> | void
  onUpload?: (file: File) => Promise<void> | void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<ImageKind | 'upload'>('drawings')
  const [results, setResults] = useState<Partial<Record<ImageSource, SourceState>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setActiveQuery(initialQuery)
    setPage(1)
    setResults({})
    setTab('drawings')
    setSaving(null)
    setError(null)
  }, [open, initialQuery])

  useEffect(() => {
    if (!open || tab === 'upload' || !activeQuery.trim()) return
    let cancelled = false
    for (const source of SOURCES_BY_KIND[tab]) {
      setResults((current) => ({
        ...current,
        [source]: { status: 'loading', candidates: page === 1 ? [] : current[source]?.candidates ?? [], exhausted: false },
      }))
      searchSource(source, activeQuery, page)
        .then((found) => {
          if (cancelled) return
          setResults((current) => {
            const before = page === 1 ? [] : current[source]?.candidates ?? []
            const known = new Set(before.map((item) => item.id))
            return {
              ...current,
              [source]: {
                status: 'ready',
                candidates: [...before, ...found.filter((item) => !known.has(item.id))],
                exhausted: found.length === 0,
              },
            }
          })
        })
        .catch(() => {
          if (cancelled) return
          setResults((current) => ({
            ...current,
            [source]: { status: 'error', candidates: current[source]?.candidates ?? [], exhausted: true },
          }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, activeQuery, page, tab])

  function switchTab(next: ImageKind | 'upload') {
    setTab(next)
    setPage(1)
  }

  async function pick(candidate: ImageCandidate) {
    if (saving) return
    setSaving(`${candidate.source}:${candidate.id}`)
    setError(null)
    try {
      await onPick(candidate)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setSaving(null)
    }
  }

  async function upload(file: File) {
    if (!onUpload || saving) return
    setSaving('upload')
    setError(null)
    try {
      await onUpload(file)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setSaving(null)
    }
  }

  const sources = tab === 'upload' ? [] : SOURCES_BY_KIND[tab]
  const loading = sources.some((source) => results[source]?.status === 'loading')
  const nothing = !loading && sources.every((source) => (results[source]?.candidates.length ?? 0) === 0)
  const canLoadMore = sources.some((source) => results[source] && !results[source]?.exhausted)

  return (
    <Dialog open={open} title={ru.images.title} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {currentUrl && <img src={currentUrl} alt="" className="mr-2 h-14 w-14 rounded-xl border border-line bg-white object-contain" />}
        <Button variant={tab === 'drawings' ? 'soft' : 'ghost'} onClick={() => switchTab('drawings')}>
          {ru.images.drawings}
        </Button>
        <Button variant={tab === 'photos' ? 'soft' : 'ghost'} onClick={() => switchTab('photos')}>
          {ru.images.photos}
        </Button>
        {onUpload && (
          <Button variant={tab === 'upload' ? 'soft' : 'ghost'} onClick={() => switchTab('upload')}>
            {ru.images.upload}
          </Button>
        )}
      </div>
      {error && <p className="mb-3 rounded-2xl bg-bad-bg px-4 py-2 text-sm text-bad">{error}</p>}
      {tab !== 'upload' && (
        <>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setResults({})
              setPage(1)
              setActiveQuery(query.trim())
            }}
          >
            <div className="flex-1">
              <TextField label={ru.images.searchHint} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Button className="self-end" type="submit">
              {ru.images.search}
            </Button>
          </form>
          {nothing && <p className="text-sm text-muted">{ru.images.empty}</p>}
          <div className="space-y-4">
            {sources.map((source) => {
              const state = results[source]
              if (!state || (state.status !== 'loading' && state.candidates.length === 0)) return null
              return (
                <section key={source}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">
                    {ru.images.sources[source]}
                    {state.status === 'loading' && ` · ${ru.loading}`}
                  </h3>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {state.candidates.map((candidate) => {
                      const key = `${candidate.source}:${candidate.id}`
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={Boolean(saving)}
                          className={cx(
                            'relative overflow-hidden rounded-2xl border-2 bg-white disabled:cursor-wait',
                            saving === key ? 'border-accent' : 'border-line hover:border-accent',
                          )}
                          onClick={() => void pick(candidate)}
                          aria-label={ru.images.pick}
                        >
                          <img
                            src={candidate.thumbUrl}
                            alt=""
                            loading="lazy"
                            className={cx('aspect-square w-full', tab === 'drawings' ? 'object-contain p-1' : 'object-cover')}
                          />
                          {saving === key && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-semibold text-accent">
                              {ru.images.saving}
                            </span>
                          )}
                        </button>
                      )
                    })}
                    {state.status === 'loading' &&
                      Array.from({ length: state.candidates.length ? 0 : 6 }, (_, index) => (
                        <span key={index} className="aspect-square animate-pulse rounded-2xl bg-line/60" />
                      ))}
                  </div>
                </section>
              )
            })}
          </div>
          {canLoadMore && !nothing && (
            <Button className="mt-3" variant="ghost" disabled={loading} onClick={() => setPage((value) => value + 1)}>
              {ru.images.more}
            </Button>
          )}
          <p className="mt-3 text-xs text-muted">{ru.images.licenseHint}</p>
        </>
      )}
      {tab === 'upload' && onUpload && (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/*"
            aria-label={ru.images.upload}
            disabled={Boolean(saving)}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          {saving === 'upload' && <p className="text-sm text-muted">{ru.images.saving}</p>}
        </div>
      )}
    </Dialog>
  )
}
