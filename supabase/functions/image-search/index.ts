// Pixabay search. The key stays on the server; other sources are called from the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'

type Candidate = {
  source: 'pixabay'
  id: string
  thumbUrl: string
  fullUrl: string
  pageUrl: string
  author?: string
  license?: string
  width?: number
  height?: number
}

const KINDS = new Set(['photo', 'illustration', 'vector', 'all'])

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  try {
    const { query, page = 1, kind = 'all' } = await req.json()
    const normalized = String(query ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const pageNumber = Math.max(1, Number(page) || 1)
    const imageType = KINDS.has(kind) ? String(kind) : 'all'
    if (!normalized) return json({ error: 'empty_query' }, 400)

    // Pixabay asks to cache results for 24 hours.
    const cacheKey = `pixabay:${imageType}:${normalized}`
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const cached = await admin
      .from('image_search_cache')
      .select('results, created_at')
      .eq('query', cacheKey)
      .eq('page', pageNumber)
      .maybeSingle()
    if (cached.data && Date.now() - new Date(cached.data.created_at).getTime() < 24 * 60 * 60 * 1000) {
      return json(cached.data.results)
    }

    const warnings: string[] = []
    const candidates = await searchPixabay(normalized, pageNumber, imageType).catch((error: Error) => {
      warnings.push(error.message)
      return [] as Candidate[]
    })
    const payload = { candidates, warnings }
    if (warnings.length === 0) {
      await admin.from('image_search_cache').upsert({
        query: cacheKey,
        page: pageNumber,
        results: payload,
        created_at: new Date().toISOString(),
      })
    }
    return json(payload)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'search_failed' }, 500)
  }
})

async function searchPixabay(query: string, page: number, imageType: string): Promise<Candidate[]> {
  const key = Deno.env.get('PIXABAY_KEY')
  if (!key) throw new Error('pixabay_key_missing')
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', key)
  url.searchParams.set('q', query)
  url.searchParams.set('image_type', imageType)
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', '12')
  url.searchParams.set('page', String(page))
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!response.ok) throw new Error(`pixabay_${response.status}`)
  const payload = await response.json()
  return (payload.hits ?? []).map((hit: Record<string, string | number>) => ({
    source: 'pixabay' as const,
    id: String(hit.id),
    thumbUrl: String(hit.previewURL ?? ''),
    fullUrl: String(hit.webformatURL ?? hit.largeImageURL ?? ''),
    pageUrl: String(hit.pageURL ?? ''),
    author: hit.user ? String(hit.user) : undefined,
    license: 'Pixabay License',
    width: Number(hit.webformatWidth ?? 0) || undefined,
    height: Number(hit.webformatHeight ?? 0) || undefined,
  }))
}
