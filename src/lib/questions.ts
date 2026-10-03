import { shuffleWithRng } from './shuffle'

export function buildQuestion<T extends { id: string }>(
  items: readonly T[],
  targetId: string,
  optionsCount: number,
  rng: () => number,
): T[] {
  const target = items.find((item) => item.id === targetId)
  if (!target) throw new Error('missing_target')
  const others = shuffleWithRng(
    items.filter((item) => item.id !== targetId),
    rng,
  )
  const take = Math.max(0, Math.min(Math.max(optionsCount, 1) - 1, others.length))
  return shuffleWithRng([target, ...others.slice(0, take)], rng)
}
