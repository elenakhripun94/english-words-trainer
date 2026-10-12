export const EXERCISE_TYPES = [
  'memorize',
  'pick_word',
  'pick_image',
  'match_pairs',
  'pick_translation',
  'spell',
  'dictation',
  'pronounce',
  'listen_find',
  'memory_images',
  'true_false',
  'feed',
  'balloons',
  'whats_missing',
  'shadow',
  'sort_groups',
  'puzzle',
  'repeat',
] as const

export type ExerciseType = (typeof EXERCISE_TYPES)[number]

export type MemoryVariant = 'words' | 'same' | 'sound'

export type ExerciseSettings = {
  options?: number
  pairsPerRound?: number
  extraLetters?: number
  showTranslation?: boolean
  showImageAfter?: boolean
  maxTries?: number
  variant?: MemoryVariant
  pieces?: number
}

/** Exercises a child who cannot read yet can't do. Hidden in a no-text lesson. */
export const READING_EXERCISES: ReadonlySet<ExerciseType> = new Set([
  'pick_word',
  'pick_translation',
  'spell',
  'dictation',
  'pronounce',
])

/** Exercises built only on pictures and sound. */
export const PICTURE_EXERCISES: ReadonlySet<ExerciseType> = new Set([
  'listen_find',
  'memory_images',
  'true_false',
  'feed',
  'balloons',
  'whats_missing',
  'shadow',
  'sort_groups',
  'puzzle',
  'repeat',
])

/** Answers are checked as «chosen item = asked item». */
export const CHOICE_EXERCISES: ReadonlySet<ExerciseType> = new Set([
  'pick_word',
  'pick_image',
  'pick_translation',
  'match_pairs',
  'listen_find',
  'memory_images',
  'feed',
  'balloons',
  'whats_missing',
  'shadow',
])

/** Scored in moves per pair instead of first-try percent. */
export const PAIRS_EXERCISES: ReadonlySet<ExerciseType> = new Set(['match_pairs', 'memory_images'])

type Requirement = {
  minItems: number
  needsTranslation: boolean
  minCategories?: number
}

// Mirrors exercise_available in supabase/migrations/0004_kids_functions.sql. Keep the two in sync.
const REQUIREMENTS: Record<ExerciseType, Requirement> = {
  memorize: { minItems: 1, needsTranslation: false },
  pick_word: { minItems: 2, needsTranslation: false },
  pick_image: { minItems: 2, needsTranslation: false },
  match_pairs: { minItems: 3, needsTranslation: false },
  pick_translation: { minItems: 2, needsTranslation: true },
  spell: { minItems: 1, needsTranslation: false },
  dictation: { minItems: 1, needsTranslation: false },
  pronounce: { minItems: 1, needsTranslation: false },
  listen_find: { minItems: 2, needsTranslation: false },
  memory_images: { minItems: 3, needsTranslation: false },
  true_false: { minItems: 2, needsTranslation: false },
  feed: { minItems: 2, needsTranslation: false },
  balloons: { minItems: 2, needsTranslation: false },
  whats_missing: { minItems: 4, needsTranslation: false },
  shadow: { minItems: 2, needsTranslation: false },
  sort_groups: { minItems: 2, needsTranslation: false, minCategories: 2 },
  puzzle: { minItems: 1, needsTranslation: false },
  repeat: { minItems: 1, needsTranslation: false },
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

/** A ready set for a lesson without reading, from easy to harder. */
export const NO_TEXT_EXERCISE_ORDER: ExerciseType[] = [
  'memorize',
  'listen_find',
  'true_false',
  'memory_images',
  'balloons',
]

export function defaultSettings(type: ExerciseType): ExerciseSettings {
  switch (type) {
    case 'pick_word':
    case 'pick_image':
    case 'pick_translation':
      return { options: 4 }
    case 'listen_find':
    case 'feed':
    case 'shadow':
    case 'whats_missing':
      return { options: 3 }
    case 'balloons':
      return { options: 4 }
    case 'match_pairs':
      return { pairsPerRound: 6 }
    case 'memory_images':
      return { pairsPerRound: 4, variant: 'same' }
    case 'puzzle':
      return { pieces: 4 }
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

type ItemLike = { translation?: string | null; category?: string | null }

export function categoriesOf(items: readonly ItemLike[]): string[] {
  return [...new Set(items.map((item) => (item.category ?? '').trim()).filter(Boolean))]
}

export function isExerciseAvailable(type: ExerciseType, items: readonly ItemLike[], noText = false): boolean {
  return unavailableReason(type, items, noText) === null
}

export function unavailableReason(type: ExerciseType, items: readonly ItemLike[], noText = false): string | null {
  if (noText && READING_EXERCISES.has(type)) return 'Нужно уметь читать'
  const rule = REQUIREMENTS[type]
  if (items.length < rule.minItems) {
    return rule.minItems === 2 ? 'Нужно минимум 2 слова' : `Нужно минимум ${rule.minItems} слова`
  }
  if (rule.minCategories && categoriesOf(items).length < rule.minCategories) {
    return `Разложите слова хотя бы по ${rule.minCategories} группам`
  }
  if (!rule.needsTranslation) return null
  const missing = items.filter((item) => !(item.translation ?? '').trim()).length
  if (missing === 0) return null
  return `Заполните перевод у ${missing} ${missing === 1 ? 'слова' : 'слов'}`
}
