import { describe, expect, it } from 'vitest'
import { confirmFeedback, createQueue, isFinished, submitCurrent } from './queue'

describe('mistake queue', () => {
  it('finishes only after every word is answered correctly', () => {
    let state = createQueue(['a', 'b', 'c'])
    state = submitCurrent(state, false)
    state = confirmFeedback(state)
    expect(state.queue).toEqual(['b', 'c', 'a'])
    expect(isFinished(state)).toBe(false)

    state = submitCurrent(state, true)
    state = confirmFeedback(state)
    state = submitCurrent(state, true)
    state = confirmFeedback(state)
    expect(state.queue).toEqual(['a'])

    state = submitCurrent(state, false)
    state = confirmFeedback(state)
    expect(state.queue).toEqual(['a'])
    expect(state.firstTry.a).toBe(false)

    state = submitCurrent(state, true)
    expect(state.firstTry.a).toBe(false)
    state = confirmFeedback(state)
    expect(isFinished(state)).toBe(true)
  })

  it('removes a skipped word without counting it as correct', () => {
    let state = createQueue(['a', 'b'])
    state = submitCurrent(state, false, true)
    state = confirmFeedback(state)
    expect(state.queue).toEqual(['b'])
    expect(state.firstTry.a).toBe(false)
  })
})
