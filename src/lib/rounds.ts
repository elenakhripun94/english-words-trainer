/** Splits items into memory-game rounds. No round is shorter than 3 when there are at least 3 items. */
export function splitIntoRounds<T>(items: readonly T[], pairsPerRound: number): T[][] {
  if (items.length === 0) return []
  const size = Math.max(1, pairsPerRound)
  if (items.length <= size || items.length < 3) return [[...items]]

  const rounds: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rounds.push(items.slice(i, i + size))
  }

  const last = rounds[rounds.length - 1]
  if (last.length < 3 && rounds.length > 1) {
    const prev = rounds[rounds.length - 2]
    while (last.length < 3 && prev.length > 3) {
      const moved = prev.pop()
      if (moved === undefined) break
      last.unshift(moved)
    }
    if (last.length < 3) {
      const remainder = rounds.pop()
      if (remainder) rounds[rounds.length - 1] = prev.concat(remainder)
    }
  }

  return rounds
}
