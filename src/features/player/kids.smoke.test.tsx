import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerItem } from './api'
import { NoTextContext } from './kids'
import { MatchPairsExercise } from './MatchPairsExercise'
import { MemorizeExercise } from './MemorizeExercise'
import { PictureChoiceExercise } from './PictureChoiceExercise'
import { PuzzleExercise } from './PuzzleExercise'
import { RepeatExercise } from './RepeatExercise'
import { SortGroupsExercise } from './SortGroupsExercise'
import { TrueFalseExercise } from './TrueFalseExercise'
import { WhatsMissingExercise } from './WhatsMissingExercise'

// Node's own localStorage stub hides jsdom's one in this setup.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})

vi.mock('./sync', () => ({
  deliverAnswer: vi.fn(async () => null),
  deliverComplete: vi.fn(async () => undefined),
}))

const items: PlayerItem[] = ['apple', 'dog', 'cat', 'ball', 'car'].map((term, index) => ({
  id: `id-${index}`,
  term,
  phonetic: null,
  audioUrl: null,
  imageUrl: `https://example.test/${term}.png`,
  translation: `перевод ${term}`,
  category: index === 0 ? 'food' : index < 3 ? 'animals' : null,
  imageAuthor: null,
  imageLicense: null,
  imageSourceUrl: null,
}))

afterEach(cleanup)

const common = { token: 'smoke-token-smoke-token', items, practice: true, onExit: () => undefined, onFinish: () => undefined }

describe('picture exercises render and accept an answer', () => {
  it.each(['listen_find', 'shadow', 'feed', 'balloons'] as const)('%s', async (mode) => {
    render(<PictureChoiceExercise {...common} mode={mode} settings={{}} />)
    const options = screen.getAllByRole('button', { name: /apple|dog|cat|ball|car/ })
    expect(options.length).toBeGreaterThanOrEqual(2)
    await act(async () => {
      fireEvent.click(options[0])
      fireEvent.pointerDown(options[0])
      fireEvent.pointerUp(options[0])
    })
  })

  it('true_false', async () => {
    render(<TrueFalseExercise {...common} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Да, правильно' })))
    expect(screen.getByRole('img', { name: /Верно|Неверно/ })).toBeTruthy()
  })

  it('whats_missing', async () => {
    render(<WhatsMissingExercise {...common} settings={{ options: 3 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Запомнил' }))
    expect(await screen.findAllByText('❓', {}, { timeout: 2000 })).toHaveLength(1)
  })

  it('sort_groups uses only grouped words', async () => {
    render(<SortGroupsExercise {...common} />)
    const boxes = screen.getAllByRole('button', { name: /Еда|Животные/ })
    expect(boxes).toHaveLength(2)
    await act(async () => fireEvent.click(boxes[0]))
  })

  it('puzzle', () => {
    const { container } = render(<PuzzleExercise {...common} settings={{ pieces: 4 }} />)
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(4)
  })

  it('repeat without a microphone still lets the child go on', () => {
    render(<RepeatExercise {...common} />)
    expect(screen.getByRole('button', { name: 'Дальше' })).toBeTruthy()
  })

  it.each(['same', 'sound'] as const)('memory_images %s', (variant) => {
    render(<MatchPairsExercise {...common} exercise="memory_images" variant={variant} settings={{ pairsPerRound: 4 }} />)
    const cards = screen.getAllByRole('button', { pressed: false })
    expect(cards.length).toBeGreaterThanOrEqual(8)
    fireEvent.click(cards[0])
  })

  it.each([false, true])('memorize shows the translation (no-text mode: %s)', (noText) => {
    render(
      <NoTextContext.Provider value={noText}>
        <MemorizeExercise {...common} />
      </NoTextContext.Provider>,
    )
    expect(screen.getByText(/^перевод /)).toBeTruthy()
    expect(Boolean(screen.queryByText(/^(apple|dog|cat|ball|car)$/))).toBe(!noText)
  })
})
