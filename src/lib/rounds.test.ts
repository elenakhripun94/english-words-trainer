import { describe, expect, it } from 'vitest'
import { splitIntoRounds } from './rounds'

const range = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

describe('splitIntoRounds', () => {
  it('never makes a round shorter than 3 when there are at least 3 words', () => {
    expect(splitIntoRounds(range(3), 6)).toEqual([range(3)])
    expect(splitIntoRounds(range(7), 6).map((round) => round.length)).toEqual([4, 3])
    expect(splitIntoRounds(range(13), 6).map((round) => round.length)).toEqual([6, 4, 3])
    expect(splitIntoRounds(range(8), 6).map((round) => round.length)).toEqual([5, 3])

    for (const count of [3, 7, 13]) {
      const rounds = splitIntoRounds(range(count), 6)
      expect(rounds.flat()).toEqual(range(count))
      expect(rounds.every((round) => round.length >= 3)).toBe(true)
    }
  })
})
