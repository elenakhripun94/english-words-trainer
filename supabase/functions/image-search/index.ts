import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'

type Candidate = {
  source: 'pixabay' | 'openverse'
  id: string
  thumbUrl: string
  fullUrl: string
  pageUrl: string
  author?: string
  license?: string
  width?: number
  height?: number
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  try {
    const { query, page = 1 } = await req.json()
    const normalized = String(query ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const pageNumber = Math.max(1, Number(page) || 1)
    if (!normalized) return json({ error: 'empty_query' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const cached = await admin
      .from('image_search_cache')
      .select('results, created_at')
      .eq('query', normalized)
      .eq('page', pageNumber)
      .maybeSingle()
    if (cached.data && Date.now() - new Date(cached.data.created_at).getTime() < 24 * 60 * 60 * 1000) {
      return json(cached.data.results)
    }

    const warnings: string[] = []
    const [pixabay, openverse] = await Promise.all([
      searchPixabay(normalized, pageNumber).catch((error: Error) => {
        warnings.push(error.message)
        return [] as Candidate[]
      }),
      searchOpenverse(normalized, pageNumber).catch((error: Error) => {
        warnings.push(error.message)
        return [] as Candidate[]
      }),
    ])
    const payload = { candidates: interleave(pixabay, openverse), warnings }
    await admin.from('image_search_cache').upsert({
      query: normalized,
      page: pageNumber,
      results: payload,
      created_at: new Date().toISOString(),
    })
    return json(payload)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'search_failed' }, 500)
  }
})

async function searchPixabay(query: string, page: number): Promise<Candidate[]> {
  const key = Deno.env.get('PIXABAY_KEY')
  if (!key) throw new Error('pixabay_key_missing')
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', key)
  url.searchParams.set('q', query)
  url.searchParams.set('image_type', 'all')
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', '20')
  url.searchParams.set('page', String(page))
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
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

async function searchOpenverse(query: string, page: number): Promise<Candidate[]> {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', '20')
  url.searchParams.set('mature', 'false')
  url.searchParams.set('page', String(page))
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`openverse_${response.status}`)
  const payload = await response.json()
  return (payload.results ?? []).map((hit: Record<string, string | number>) => ({
    source: 'openverse' as const,
    id: String(hit.id),
    thumbUrl: String(hit.thumbnail ?? hit.url ?? ''),
    fullUrl: String(hit.url ?? ''),
    pageUrl: String(hit.foreign_landing_url ?? hit.url ?? ''),
    author: hit.creator ? String(hit.creator) : undefined,
    license: hit.license ? String(hit.license) : undefined,
    width: Number(hit.width ?? 0) || undefined,
    height: Number(hit.height ?? 0) || undefined,
  })).filter((item: Candidate) => item.thumbUrl && item.fullUrl)
}

function interleave(left: Candidate[], right: Candidate[]) {
  const mixed: Candidate[] = []
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    if (left[index]) mixed.push(left[index])
    if (right[index]) mixed.push(right[index])
  }
  return mixed
}
