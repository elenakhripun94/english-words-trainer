import { describe, expect, it } from 'vitest'
import { buildQuestion } from './questions'
import { rngFromSeed } from './shuffle'

const items = [
  { id: 'a', term: 'apple' },
  { id: 'b', term: 'banana' },
  { id: 'c', term: 'cherry' },
  { id: 'd', term: 'date' },
]

describe('buildQuestion', () => {
  it('always includes the target and never repeats options', () => {
    const question = buildQuestion(items, 'b', 4, rngFromSeed('q'))
    expect(question).toHaveLength(4)
    expect(new Set(question.map((item) => item.id)).size).toBe(4)
    expect(question.some((item) => item.id === 'b')).toBe(true)
  })

  it('shrinks when the lesson has fewer words than the option count', () => {
    const few = items.slice(0, 2)
    const question = buildQuestion(few, 'a', 4, rngFromSeed('q2'))
    expect(question.map((item) => item.id).sort()).toEqual(['a', 'b'])
  })
})
