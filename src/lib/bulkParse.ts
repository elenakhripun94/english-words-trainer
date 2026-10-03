import { normalizeAnswer } from './answers'

export type BulkRow = {
  line: number
  term: string
  translation: string | null
}

export type BulkDiscard = {
  line: number
  raw: string
  reason: 'empty' | 'duplicate' | 'limit'
}

const LIMIT = 50

function splitLine(line: string): { term: string; translation: string | null } {
  const tab = line.indexOf('\t')
  if (tab !== -1) {
    return {
      term: line.slice(0, tab).trim(),
      translation: line.slice(tab + 1).trim() || null,
    }
  }
  const em = line.indexOf(' — ')
  if (em !== -1) {
    return {
      term: line.slice(0, em).trim(),
      translation: line.slice(em + 3).trim() || null,
    }
  }
  const hyphen = line.indexOf(' - ')
  if (hyphen !== -1) {
    return {
      term: line.slice(0, hyphen).trim(),
      translation: line.slice(hyphen + 3).trim() || null,
    }
  }
  const semi = line.indexOf(';')
  if (semi !== -1) {
    return {
      term: line.slice(0, semi).trim(),
      translation: line.slice(semi + 1).trim() || null,
    }
  }
  return { term: line.trim(), translation: null }
}

export function parseBulkInput(
  text: string,
  existingTerms: string[],
  limit = LIMIT,
): { rows: BulkRow[]; discarded: BulkDiscard[] } {
  const rows: BulkRow[] = []
  const discarded: BulkDiscard[] = []
  const seen = new Set(existingTerms.map((term) => normalizeAnswer(term)))

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, index) => {
    const line = index + 1
    if (raw.trim() === '') {
      if (raw.length > 0 || lines.length > 1) {
        discarded.push({ line, raw, reason: 'empty' })
      }
      return
    }
    const { term, translation } = splitLine(raw)
    if (!term) {
      discarded.push({ line, raw, reason: 'empty' })
      return
    }
    const key = normalizeAnswer(term)
    if (seen.has(key)) {
      discarded.push({ line, raw, reason: 'duplicate' })
      return
    }
    if (rows.length >= limit) {
      discarded.push({ line, raw, reason: 'limit' })
      return
    }
    seen.add(key)
    rows.push({ line, term, translation })
  })

  return { rows, discarded }
}
