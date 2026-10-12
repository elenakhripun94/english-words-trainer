import { CATEGORIES } from './categories'
import { shuffleWithRng } from './shuffle'

// Round builders for the picture exercises. Pure, so a seeded rng gives the same round after a reload.

/** Builds one round: pictures to remember (with the target) and the choices after one disappears. */
export function buildMissingRound<T extends { id: string }>(items: readonly T[], target: T, setSize: number, rng: () => number) {
  const others = shuffleWithRng(
    items.filter((item) => item.id !== target.id),
    rng,
  )
  // At least one picture must stay outside the set, otherwise the choice gives the answer away.
  const size = Math.max(2, Math.min(setSize, others.length))
  const shown = shuffleWithRng([target, ...others.slice(0, size - 1)], rng)
  const outside = others.slice(size - 1, size + 1)
  const choices = shuffleWithRng([target, ...outside], rng)
  return { shown, choices }
}

/** A shuffled order of pieces that is never already solved. */
export function scramble(count: number, rng: () => number): number[] {
  const solved = Array.from({ length: count }, (_, index) => index)
  if (count < 2) return solved
  for (let attempt = 0; attempt < 10; attempt++) {
    const order = shuffleWithRng(solved, rng)
    if (order.some((piece, index) => piece !== index)) return order
  }
  return [...solved.slice(1), solved[0]]
}

/** The word that sounds in «Правда или нет?»: the picture's own word about half of the time. */
export function pickSpoken<T extends { id: string }>(items: readonly T[], target: T, rng: () => number): T {
  const others = items.filter((item) => item.id !== target.id)
  if (others.length === 0 || rng() < 0.5) return target
  return others[Math.floor(rng() * others.length)]
}

const MAX_BOXES = 4

/** The boxes for one question: the right group plus others, in a stable order. */
export function boxesFor(all: string[], target: string, rng: () => number): string[] {
  const others = shuffleWithRng(
    all.filter((id) => id !== target),
    rng,
  ).slice(0, MAX_BOXES - 1)
  const order = (id: string) => {
    const index = CATEGORIES.findIndex((category) => category.id === id)
    return index < 0 ? CATEGORIES.length : index
  }
  return [target, ...others].sort((a, b) => order(a) - order(b))
}
