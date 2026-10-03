export const EXERCISE_TYPES = [
  'memorize',
  'pick_word',
  'pick_image',
  'match_pairs',
  'pick_translation',
  'spell',
  'dictation',
  'pronounce',
] as const

export type ExerciseType = (typeof EXERCISE_TYPES)[number]

export type ExerciseSettings = {
  options?: number
  pairsPerRound?: number
  extraLetters?: number
  showTranslation?: boolean
  showImageAfter?: boolean
  maxTries?: number
}

type Requirement = {
  minItems: number
  needsTranslation: boolean
}

const REQUIREMENTS: Record<ExerciseType, Requirement> = {
  memorize: { minItems: 1, needsTranslation: false },
  pick_word: { minItems: 2, needsTranslation: false },
  pick_image: { minItems: 2, needsTranslation: false },
  match_pairs: { minItems: 3, needsTranslation: false },
  pick_translation: { minItems: 2, needsTranslation: true },
  spell: { minItems: 1, needsTranslation: false },
  dictation: { minItems: 1, needsTranslation: false },
  pronounce: { minItems: 1, needsTranslation: false },
}

export const DEFAULT_EXERCISE_ORDER: ExerciseType[] = [
  'memorize',
  'pick_word',
  'pick_image',
  'match_pairs',
  'pick_translation',
  'spell',
  'dictation',
]

export function defaultSettings(type: ExerciseType): ExerciseSettings {
  switch (type) {
    case 'pick_word':
    case 'pick_image':
    case 'pick_translation':
      return { options: 4 }
    case 'match_pairs':
      return { pairsPerRound: 6 }
    case 'spell':
      return { extraLetters: 0, showTranslation: true }
    case 'dictation':
      return { showImageAfter: true }
    case 'pronounce':
      return { maxTries: 3 }
    default:
      return {}
  }
}

export function exerciseRequirement(type: ExerciseType): Requirement {
  return REQUIREMENTS[type]
}

export function isExerciseAvailable(
  type: ExerciseType,
  items: Array<{ translation?: string | null }>,
): boolean {
  const rule = REQUIREMENTS[type]
  if (items.length < rule.minItems) return false
  if (!rule.needsTranslation) return true
  return items.every((item) => (item.translation ?? '').trim().length > 0)
}

export function unavailableReason(
  type: ExerciseType,
  items: Array<{ translation?: string | null }>,
): string | null {
  if (isExerciseAvailable(type, items)) return null
  const rule = REQUIREMENTS[type]
  if (items.length < rule.minItems) {
    return rule.minItems === 2 ? 'Нужно минимум 2 слова' : `Нужно минимум ${rule.minItems} слова`
  }
  const missing = items.filter((item) => !(item.translation ?? '').trim()).length
  return `Заполните перевод у ${missing} ${missing === 1 ? 'слова' : 'слов'}`
}
