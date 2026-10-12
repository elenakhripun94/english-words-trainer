import { describe, expect, it } from 'vitest'
import { interleave } from './images'

describe('interleave', () => {
  it('takes one from each source in turn', () => {
    expect(interleave([['a1', 'a2', 'a3'], [], ['c1']])).toEqual(['a1', 'c1', 'a2', 'a3'])
  })
})
