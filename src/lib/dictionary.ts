export type DictionaryHit = {
  found: boolean
  phonetic: string | null
  audioUrl: string | null
  definition: string | null
  suggestions: string[]
}

type DictionaryEntry = {
  phonetic?: string
  phonetics?: Array<{ text?: string; audio?: string }>
  meanings?: Array<{ definitions?: Array<{ definition?: string }> }>
}

export async function lookupTerm(term: string): Promise<DictionaryHit> {
  const query = term.trim()
  const [entry, suggestions] = await Promise.all([fetchEntry(query), fetchSuggestions(query)])
  return { ...entry, suggestions }
}

async function fetchEntry(term: string): Promise<Omit<DictionaryHit, 'suggestions'>> {
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
  )
  if (response.status === 404) {
    return { found: false, phonetic: null, audioUrl: null, definition: null }
  }
  if (!response.ok) throw new Error('dictionary_failed')
  const payload = (await response.json()) as DictionaryEntry[]
  const first = payload[0]
  const phonetic =
    first?.phonetics?.find((item) => item.text)?.text ?? first?.phonetic ?? null
  const audioUrl = first?.phonetics?.find((item) => item.audio)?.audio ?? null
  const definition = first?.meanings?.[0]?.definitions?.[0]?.definition ?? null
  return { found: true, phonetic, audioUrl, definition }
}

async function fetchSuggestions(term: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://api.datamuse.com/sug?s=${encodeURIComponent(term)}&max=5`,
    )
    if (!response.ok) return []
    const payload = (await response.json()) as Array<{ word?: string }>
    return payload
      .map((item) => item.word)
      .filter((word): word is string => Boolean(word))
      .filter((word) => word.toLowerCase() !== term.toLowerCase())
      .slice(0, 5)
  } catch {
    return []
  }
}
