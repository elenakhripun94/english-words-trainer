import type { DictionaryHit } from '../../lib/dictionary'
import { ru } from '../../i18n/ru'
import { playTerm } from '../../lib/speech'
import { Button } from '../../components/ui'

export function WordCheck({
  hit,
  pending,
  audioUrl,
  term,
  onSuggest,
}: {
  hit: DictionaryHit | null
  pending: boolean
  audioUrl?: string | null
  term: string
  onSuggest?: (word: string) => void
}) {
  if (pending) return <p className="text-sm text-muted">{ru.loading}</p>
  if (!hit) return null
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {hit.phonetic && <span className="text-muted">{hit.phonetic}</span>}
        <Button variant="ghost" className="px-2 py-1 text-sm" aria-label={ru.items.play} onClick={() => void playTerm(term, audioUrl ?? hit.audioUrl)}>
          {ru.items.play}
        </Button>
      </div>
      {hit.found && hit.definition && <p className="text-muted">{hit.definition}</p>}
      {!hit.found && <p className="rounded-xl bg-warn-bg px-3 py-2 text-warn">{ru.items.missing}</p>}
      {!hit.found && hit.suggestions.length > 0 && onSuggest && (
        <p className="text-muted">
          {ru.items.suggestions}:{' '}
          {hit.suggestions.map((word) => (
            <button key={word} type="button" className="mr-2 underline" onClick={() => onSuggest(word)}>
              {word}
            </button>
          ))}
        </p>
      )}
    </div>
  )
}
