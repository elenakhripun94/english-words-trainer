import { describe, expect, it } from 'vitest'
import { pool } from './pool'

describe('pool', () => {
  it('keeps order and caps concurrency', async () => {
    let active = 0
    let max = 0
    const tasks = [1, 2, 3, 4, 5].map((value) => async () => {
      active += 1
      max = Math.max(max, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active -= 1
      return value
    })
    await expect(pool(tasks, 2)).resolves.toEqual([1, 2, 3, 4, 5])
    expect(max).toBeLessThanOrEqual(2)
    expect(max).toBeGreaterThan(1)
  })
})
