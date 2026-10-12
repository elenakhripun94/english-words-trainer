import { describe, expect, it } from 'vitest'
import { boxesFor, buildMissingRound, pickSpoken, scramble } from './kidsRounds'
import { rngFromSeed } from './shuffle'

const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))

describe('buildMissingRound', () => {
  it('shows the target and keeps a choice outside the shown set', () => {
    for (let seed = 0; seed < 50; seed++) {
      const target = items[seed % items.length]
      const { shown, choices } = buildMissingRound(items.slice(0, 4), target, 3, rngFromSeed(String(seed)))
      expect(shown.map((item) => item.id)).toContain(target.id)
      expect(shown).toHaveLength(3)
      expect(choices.map((item) => item.id)).toContain(target.id)
      const shownIds = new Set(shown.map((item) => item.id))
      expect(choices.filter((item) => !shownIds.has(item.id)).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('shrinks the set when the lesson is small', () => {
    const { shown, choices } = buildMissingRound(items.slice(0, 4), items[0], 4, rngFromSeed('x'))
    expect(shown).toHaveLength(3)
    expect(choices).toHaveLength(2)
  })
})

describe('scramble', () => {
  it('never returns a solved puzzle', () => {
    for (let seed = 0; seed < 100; seed++) {
      const order = scramble(2, rngFromSeed(String(seed)))
      expect(order).toEqual([1, 0])
    }
    for (let seed = 0; seed < 100; seed++) {
      const order = scramble(4, rngFromSeed(String(seed)))
      expect([...order].sort()).toEqual([0, 1, 2, 3])
      expect(order).not.toEqual([0, 1, 2, 3])
    }
  })
})

describe('pickSpoken', () => {
  it('says the right word about half of the time', () => {
    let same = 0
    for (let seed = 0; seed < 400; seed++) {
      if (pickSpoken(items, items[0], rngFromSeed(String(seed))).id === 'a') same++
    }
    expect(same).toBeGreaterThan(150)
    expect(same).toBeLessThan(250)
  })

  it('says the right word when there is no other', () => {
    expect(pickSpoken([items[0]], items[0], () => 0.99).id).toBe('a')
  })
})

describe('boxesFor', () => {
  it('always has the right group and at most four boxes', () => {
    const all = ['food', 'animals', 'toys', 'clothes', 'transport', 'home']
    for (let seed = 0; seed < 30; seed++) {
      const boxes = boxesFor(all, 'toys', rngFromSeed(String(seed)))
      expect(boxes).toContain('toys')
      expect(boxes.length).toBe(4)
      expect(new Set(boxes).size).toBe(4)
    }
  })
})
