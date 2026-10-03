/** Mirrors SQL normalize_answer in supabase/migrations/0001_init.sql. */
export function normalizeAnswer(value: string | null | undefined): string {
  const lowered = (value ?? '').toLowerCase().replace(/[’‘`´]/g, "'")
  const stripped = lowered.replace(/[.!?]+\s*$/g, '')
  return stripped.replace(/\s+/g, ' ').trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/** One typo in a word of at least 5 characters. Equal answers are not "almost". */
export function isAlmost(answer: string, expected: string): boolean {
  const left = normalizeAnswer(answer)
  const right = normalizeAnswer(expected)
  if (left === right) return false
  if (right.length < 5) return false
  return levenshtein(left, right) === 1
}
