/** Groups for «Разложи по группам». The id is stored in lesson_items.category. */
export const CATEGORIES = [
  { id: 'food', emoji: '🍎', label: 'Еда' },
  { id: 'animals', emoji: '🐶', label: 'Животные' },
  { id: 'toys', emoji: '🧸', label: 'Игрушки' },
  { id: 'clothes', emoji: '👕', label: 'Одежда' },
  { id: 'transport', emoji: '🚗', label: 'Транспорт' },
  { id: 'home', emoji: '🏠', label: 'Дом' },
  { id: 'nature', emoji: '🌳', label: 'Природа' },
  { id: 'body', emoji: '🖐️', label: 'Тело' },
  { id: 'family', emoji: '👪', label: 'Семья' },
  { id: 'school', emoji: '🎒', label: 'Школа' },
  { id: 'colors', emoji: '🎨', label: 'Цвета' },
  { id: 'numbers', emoji: '🔢', label: 'Числа' },
  { id: 'weather', emoji: '☀️', label: 'Погода' },
  { id: 'actions', emoji: '🏃', label: 'Действия' },
] as const

export type Category = (typeof CATEGORIES)[number]

export function categoryById(id: string | null | undefined): Category | undefined {
  return CATEGORIES.find((category) => category.id === id)
}
