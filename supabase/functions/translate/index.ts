import { json, preflight } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  try {
    const { q } = await req.json()
    const term = String(q ?? '').trim()
    if (!term) return json({ translation: null })
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|ru`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return json({ translation: null }, 502)
    const payload = await response.json()
    const text = String(payload?.responseData?.translatedText ?? '')
    if (!text || /MYMEMORY WARNING/i.test(text)) return json({ translation: null })
    return json({ translation: text })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'translate_failed' }, 500)
  }
})
