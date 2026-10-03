import { describe, expect, it } from 'vitest'
import { seededShuffle } from './shuffle'

describe('seededShuffle', () => {
  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    expect(seededShuffle(items, 'token-memorize')).toEqual(seededShuffle(items, 'token-memorize'))
    expect(seededShuffle(items, 'token-memorize')).not.toEqual(seededShuffle(items, 'other'))
    expect(seededShuffle(items, 'token-memorize').sort()).toEqual(items)
  })
})
