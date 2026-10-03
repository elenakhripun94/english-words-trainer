import { ru } from '../i18n/ru'

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (message.includes('published_lesson_locked')) return ru.errors.publishedLocked
  if (message.includes('items_missing_images')) return ru.errors.missingImages
  if (message.includes('lesson_has_no_items')) return ru.errors.noItems
  if (message.includes('lesson_has_no_exercises')) return ru.errors.noExercises
  if (message.includes('invalid_token')) return ru.player.invalidLink
  if (message.includes('image_too_large')) return ru.errors.imageTooLarge
  if (message.includes('not_an_image')) return ru.errors.notAnImage
  if (message.includes('attempt_limit')) return ru.errors.attemptLimit
  return ru.errors.generic
}
