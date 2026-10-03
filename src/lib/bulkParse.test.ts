import { describe, expect, it } from 'vitest'
import { parseBulkInput } from './bulkParse'

describe('parseBulkInput', () => {
  it('parses mixed formats and drops duplicates, blanks, and the overflow', () => {
    const text = [
      'apple',
      'banana - банан',
      'orange — апельсин',
      'grape ; виноград',
      'pear\tгруша',
      'well-known',
      'well-known - известный',
      '',
      '  APPLE  ',
      'cherry',
    ].join('\n')

    const { rows, discarded } = parseBulkInput(text, ['apple'], 4)
    expect(rows.map((row) => [row.term, row.translation])).toEqual([
      ['banana', 'банан'],
      ['orange', 'апельсин'],
      ['grape', 'виноград'],
      ['pear', 'груша'],
    ])
    expect(rows.some((row) => row.term === 'well-known')).toBe(false)
    expect(discarded.find((item) => item.raw === 'apple')?.reason).toBe('duplicate')
    expect(discarded.find((item) => item.raw === '  APPLE  ')?.reason).toBe('duplicate')
    expect(discarded.find((item) => item.raw === '')?.reason).toBe('empty')
    expect(discarded.filter((item) => item.reason === 'limit').map((item) => item.raw)).toEqual([
      'well-known',
      'well-known - известный',
      'cherry',
    ])
  })

  it('does not split a hyphen inside a word and keeps the first 50', () => {
    const lines = Array.from({ length: 52 }, (_, index) => `word-${index}`)
    const { rows, discarded } = parseBulkInput(lines.join('\n'), [])
    expect(rows).toHaveLength(50)
    expect(rows[0]?.term).toBe('word-0')
    expect(rows[0]?.translation).toBeNull()
    expect(discarded.filter((item) => item.reason === 'limit')).toHaveLength(2)
  })
})
