import { describe, expect, it } from 'vitest'
import { isAlmost, levenshtein, normalizeAnswer } from './answers'

describe('normalizeAnswer', () => {
  it('matches the SQL normalize_answer rules', () => {
    expect(normalizeAnswer('  Apple ')).toBe('apple')
    expect(normalizeAnswer('APPLE.')).toBe('apple')
    expect(normalizeAnswer('Hello!')).toBe('hello')
    expect(normalizeAnswer('Wait?!')).toBe('wait')
    expect(normalizeAnswer('a  piece   of cake')).toBe('a piece of cake')
    expect(normalizeAnswer('well-known')).toBe('well-known')
    expect(normalizeAnswer("it’s")).toBe(normalizeAnswer("it's"))
    expect(normalizeAnswer('it’s')).toBe("it's")
    expect(normalizeAnswer('‘quote’')).toBe("'quote'")
    expect(normalizeAnswer(null)).toBe('')
  })
})

describe('levenshtein and isAlmost', () => {
  it('counts single edits', () => {
    expect(levenshtein('banana', 'banan')).toBe(1)
    expect(levenshtein('apple', 'apple')).toBe(0)
    expect(levenshtein('cat', 'dog')).toBe(3)
  })

  it('flags one typo only for words of 5+ characters', () => {
    expect(isAlmost('banan', 'banana')).toBe(true)
    expect(isAlmost('BANANA', 'banana')).toBe(false)
    expect(isAlmost('cat', 'bat')).toBe(false)
    expect(isAlmost('aple', 'apple')).toBe(true)
    expect(isAlmost('appl', 'apple')).toBe(true)
    expect(isAlmost('orange', 'apple')).toBe(false)
  })
})
