import { isConfigured } from './env'
import { getSupabase } from './supabase'

export async function suggestTranslation(term: string): Promise<string | null> {
  try {
    const direct = await fromMyMemory(term)
    if (direct) return direct
  } catch {
    if (!isConfigured()) return null
    const { data, error } = await getSupabase().functions.invoke('translate', {
      body: { q: term },
    })
    if (error || !data || typeof data.translation !== 'string') return null
    return cleanTranslation(data.translation)
  }
  return null
}

async function fromMyMemory(term: string): Promise<string | null> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|ru`
  const response = await fetch(url)
  if (!response.ok) throw new Error('translate_failed')
  const payload = (await response.json()) as { responseData?: { translatedText?: string } }
  return cleanTranslation(payload.responseData?.translatedText ?? '')
}

function cleanTranslation(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || /MYMEMORY WARNING/i.test(trimmed)) return null
  return trimmed
}
