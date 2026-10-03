import { describe, expect, it } from 'vitest'
import { assembleAnswer, buildLetterTiles, termSlots } from './letters'
import { rngFromSeed } from './shuffle'

describe('letter tiles', () => {
  it('keeps separators out of the tiles and in their places', () => {
    const term = 'a piece of cake'
    const tiles = buildLetterTiles(term, 0, rngFromSeed('spell'))
    const fromTiles = tiles.map((tile) => tile.letter).sort().join('')
    const fromTerm = Array.from(term)
      .filter((char) => char !== ' ')
      .sort()
      .join('')
    expect(fromTiles).toBe(fromTerm)
    expect(tiles.some((tile) => tile.letter === ' ')).toBe(false)

    const slots = termSlots(term)
    expect(slots.filter((slot) => slot.kind === 'sep').map((slot) => slot.char)).toEqual([' ', ' ', ' '])

    const placed = Array.from(term).filter((char) => char !== ' ')
    expect(assembleAnswer(term, placed)).toBe(term)
  })

  it('adds extra letters and keeps apostrophes fixed', () => {
    const tiles = buildLetterTiles("it's", 2, rngFromSeed('extra'))
    expect(tiles).toHaveLength(5)
    expect(termSlots("it's").some((slot) => slot.kind === 'sep' && slot.char === "'")).toBe(true)
  })
})
