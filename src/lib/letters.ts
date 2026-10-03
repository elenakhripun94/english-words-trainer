import { shuffleWithRng } from './shuffle'

const SEPARATOR = /[\s\u002D\u2010-\u2015'’‘`´]/

export function isSeparator(char: string): boolean {
  return SEPARATOR.test(char)
}

export type TermSlot = { kind: 'letter'; index: number } | { kind: 'sep'; char: string }

export function termSlots(term: string): TermSlot[] {
  const slots: TermSlot[] = []
  let index = 0
  for (const char of Array.from(term)) {
    if (isSeparator(char)) slots.push({ kind: 'sep', char })
    else slots.push({ kind: 'letter', index: index++ })
  }
  return slots
}

export type LetterTile = { id: string; letter: string }

export function buildLetterTiles(term: string, extraLetters: number, rng: () => number): LetterTile[] {
  const letters = Array.from(term).filter((char) => !isSeparator(char))
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const extras = Array.from({ length: Math.max(0, extraLetters) }, () => {
    return alphabet[Math.floor(rng() * alphabet.length)] ?? 'a'
  })
  const tiles = [...letters, ...extras].map((letter, index) => ({
    id: `${index}-${letter}`,
    letter,
  }))
  return shuffleWithRng(tiles, rng)
}

export function assembleAnswer(term: string, placedLetters: string[]): string {
  let index = 0
  let output = ''
  for (const char of Array.from(term)) {
    if (isSeparator(char)) output += char
    else output += placedLetters[index++] ?? ''
  }
  return output
}
