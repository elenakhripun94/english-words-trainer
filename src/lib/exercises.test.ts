import { describe, expect, it } from 'vitest'
import { isExerciseAvailable, unavailableReason } from './exercises'

describe('exercise availability', () => {
  const words = [{ translation: 'яблоко', category: 'food' }, { translation: 'собака', category: 'animals' }, { translation: null }, { translation: 'мяч' }]

  it('hides reading exercises in a no-text lesson', () => {
    expect(isExerciseAvailable('spell', words, true)).toBe(false)
    expect(isExerciseAvailable('spell', words, false)).toBe(true)
    expect(isExerciseAvailable('listen_find', words, true)).toBe(true)
  })

  it('needs two groups for sorting', () => {
    expect(isExerciseAvailable('sort_groups', words)).toBe(true)
    expect(unavailableReason('sort_groups', [{ category: 'food' }, { category: 'food' }])).toMatch(/групп/)
  })

  it('needs four words for «Что пропало?»', () => {
    expect(isExerciseAvailable('whats_missing', words)).toBe(true)
    expect(isExerciseAvailable('whats_missing', words.slice(0, 3))).toBe(false)
  })

  it('still asks for translations', () => {
    expect(unavailableReason('pick_translation', words)).toMatch(/перевод/)
  })
})
