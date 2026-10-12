import { z } from 'zod'
import { supabaseUrl } from './env'
import { getSupabase } from './supabase'

export const IMAGE_SOURCES = ['arasaac', 'emoji', 'pixabay_drawing', 'pixabay_photo', 'openverse'] as const
export type ImageSource = (typeof IMAGE_SOURCES)[number]
export type ImageKind = 'drawings' | 'photos'

export const SOURCES_BY_KIND: Record<ImageKind, ImageSource[]> = {
  drawings: ['arasaac', 'emoji', 'pixabay_drawing'],
  photos: ['pixabay_photo', 'openverse'],
}

export const imageCandidateSchema = z.object({
  source: z.string(),
  id: z.string(),
  thumbUrl: z.string().min(1),
  fullUrl: z.string().min(1),
  pageUrl: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
})

export type ImageCandidate = z.infer<typeof imageCandidateSchema>

const pixabayResponseSchema = z.object({
  candidates: z.array(imageCandidateSchema),
  warnings: z.array(z.string()).optional(),
})

const PAGE_SIZE = 12
const TIMEOUT_MS = 5000
const EMOJI_SETS: Record<string, { author: string; license: string }> = {
  'fluent-emoji-flat': { author: 'Microsoft Fluent Emoji', license: 'MIT' },
  noto: { author: 'Google Noto Emoji', license: 'Apache 2.0' },
  twemoji: { author: 'Twemoji', license: 'CC BY 4.0' },
  openmoji: { author: 'OpenMoji', license: 'CC BY-SA 4.0' },
}

export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = supabaseUrl()
  if (!base) return null
  return `${base}/storage/v1/object/public/lesson-images/${path}`
}

/** Searches one source. Page numbers start at 1. */
export async function searchSource(source: ImageSource, query: string, page = 1): Promise<ImageCandidate[]> {
  const term = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!term) return []
  switch (source) {
    case 'arasaac':
      return pageOf(await searchArasaac(term), page)
    case 'emoji':
      return pageOf(await searchEmoji(term), page)
    case 'openverse':
      return searchOpenverse(term, page)
    case 'pixabay_drawing':
      return searchPixabay(term, page, 'illustration')
    case 'pixabay_photo':
      return searchPixabay(term, page, 'photo')
  }
}

/** Candidates for a new word: drawings first, mixed across sources, photos only if no drawing was found. */
export async function suggestImages(term: string, limit = 8): Promise<ImageCandidate[]> {
  const drawings = await searchAll(SOURCES_BY_KIND.drawings, term)
  const found = drawings.length ? drawings : await searchAll(SOURCES_BY_KIND.photos, term)
  return found.slice(0, limit)
}

async function searchAll(sources: ImageSource[], term: string) {
  const lists = await Promise.all(sources.map((source) => searchSource(source, term).catch(() => [])))
  return interleave(lists)
}

export function interleave<T>(lists: T[][]): T[] {
  const mixed: T[] = []
  const length = Math.max(0, ...lists.map((list) => list.length))
  for (let index = 0; index < length; index++) {
    for (const list of lists) if (list[index]) mixed.push(list[index])
  }
  return mixed
}

function pageOf<T>(list: T[], page: number) {
  return list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`image_search_${response.status}`)
  return response.json()
}

const searchCache = new Map<string, Promise<ImageCandidate[]>>()

function cached(key: string, load: () => Promise<ImageCandidate[]>) {
  let hit = searchCache.get(key)
  if (!hit) {
    hit = load()
    hit.catch(() => searchCache.delete(key))
    searchCache.set(key, hit)
  }
  return hit
}

/** ARASAAC pictograms are drawn for people who cannot read. */
function searchArasaac(term: string) {
  return cached(`arasaac:${term}`, async () => {
    const data = (await getJson(`https://api.arasaac.org/v1/pictograms/en/search/${encodeURIComponent(term)}`)) as Array<{
      _id: number
      sex?: boolean
      violence?: boolean
    }> | null
    return (data ?? [])
      .filter((hit) => !hit.sex && !hit.violence)
      .map((hit) => ({
        source: 'arasaac',
        id: String(hit._id),
        thumbUrl: `https://static.arasaac.org/pictograms/${hit._id}/${hit._id}_300.png`,
        fullUrl: `https://static.arasaac.org/pictograms/${hit._id}/${hit._id}_500.png`,
        pageUrl: `https://arasaac.org/pictograms/en/${hit._id}/${encodeURIComponent(term)}`,
        author: 'Sergio Palao, ARASAAC (Gobierno de Aragón)',
        license: 'CC BY-NC-SA 4.0',
      }))
  })
}

/** Colored emoji drawings from Iconify. Exact names go first, so «dog» comes before «hot dog». */
function searchEmoji(term: string) {
  return cached(`emoji:${term}`, async () => {
    const url = new URL('https://api.iconify.design/search')
    url.searchParams.set('query', term)
    url.searchParams.set('prefixes', Object.keys(EMOJI_SETS).join(','))
    url.searchParams.set('limit', '96')
    const data = (await getJson(url.toString())) as { icons?: string[] } | null
    const slug = term.replace(/\s+/g, '-')
    const rank = (name: string) => (name === slug ? 0 : name.startsWith(`${slug}-`) ? 1 : name.includes(slug) ? 2 : 3)
    return (data?.icons ?? [])
      .map((icon) => {
        const [prefix, name = ''] = icon.split(':')
        return { prefix, name }
      })
      .filter((icon) => EMOJI_SETS[icon.prefix])
      .sort((a, b) => rank(a.name) - rank(b.name))
      .map(({ prefix, name }) => ({
        source: 'emoji',
        id: `${prefix}:${name}`,
        thumbUrl: `https://api.iconify.design/${prefix}/${name}.svg`,
        fullUrl: `https://api.iconify.design/${prefix}/${name}.svg`,
        pageUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
        author: EMOJI_SETS[prefix].author,
        license: EMOJI_SETS[prefix].license,
      }))
  })
}

/** Openverse full-size files can be huge, so we take its resized copy. */
function searchOpenverse(term: string, page: number) {
  return cached(`openverse:${term}:${page}`, async () => {
    const url = new URL('https://api.openverse.org/v1/images/')
    url.searchParams.set('q', term)
    url.searchParams.set('page_size', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    url.searchParams.set('mature', 'false')
    const data = (await getJson(url.toString())) as {
      results?: Array<{ id: string; foreign_landing_url?: string; url?: string; creator?: string; license?: string; license_version?: string }>
    } | null
    return (data?.results ?? []).map((hit) => {
      const thumb = `https://api.openverse.org/v1/images/${hit.id}/thumb/`
      return {
        source: 'openverse',
        id: hit.id,
        thumbUrl: thumb,
        fullUrl: thumb,
        pageUrl: hit.foreign_landing_url ?? hit.url ?? '',
        author: hit.creator,
        license: hit.license ? `CC ${hit.license.toUpperCase()} ${hit.license_version ?? ''}`.trim() : undefined,
      }
    })
  })
}

/** Pixabay needs a secret key, so it goes through the image-search function. */
function searchPixabay(term: string, page: number, kind: 'illustration' | 'photo') {
  return cached(`pixabay:${kind}:${term}:${page}`, async () => {
    const { data, error } = await getSupabase().functions.invoke('image-search', {
      body: { query: term, page, kind },
    })
    if (error) throw new Error(error.message)
    const parsed = pixabayResponseSchema.safeParse(data)
    if (!parsed.success) throw new Error('image_search_invalid')
    return parsed.data.candidates
  })
}

export async function saveRemoteImage(lessonId: string, itemId: string, candidate: ImageCandidate) {
  const { data, error } = await getSupabase().functions.invoke('image-save', {
    body: { lessonId, itemId, candidate },
  })
  if (error) throw new Error(await functionError(error))
  const parsed = z.object({ imagePath: z.string() }).safeParse(data)
  if (!parsed.success) throw new Error('image_save_invalid')
  return parsed.data.imagePath
}

/** supabase-js hides the function's JSON error behind a generic message. */
async function functionError(error: { message: string; context?: unknown }) {
  const context = error.context as Response | undefined
  try {
    const body = (await context?.json()) as { error?: string } | undefined
    if (body?.error) return body.error
  } catch {
    // Not JSON.
  }
  return error.message
}

export async function uploadLessonImage(lessonId: string, itemId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image')
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large')
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'jpg'
  const path = `${lessonId}/${itemId}-${crypto.randomUUID()}.${extension}`
  const supabase = getSupabase()
  const previous = await supabase.from('lesson_items').select('image_path').eq('id', itemId).maybeSingle()
  const { error: uploadError } = await supabase.storage.from('lesson-images').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)
  const { error } = await supabase
    .from('lesson_items')
    .update({
      image_path: path,
      image_source: 'upload',
      image_source_url: null,
      image_author: null,
      image_license: null,
    })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  await releaseImages([(previous.data as { image_path: string | null } | null)?.image_path])
  return path
}

/** Deletes stored files no lesson item points to any more. A copied lesson shares files with the original. */
export async function releaseImages(paths: Array<string | null | undefined>) {
  const candidates = [...new Set(paths.filter((path): path is string => Boolean(path) && !/^https?:/.test(path ?? '')))]
  if (candidates.length === 0) return
  const supabase = getSupabase()
  const { data, error } = await supabase.from('lesson_items').select('image_path').in('image_path', candidates)
  if (error) return
  const used = new Set(((data ?? []) as Array<{ image_path: string }>).map((row) => row.image_path))
  const unused = candidates.filter((path) => !used.has(path))
  if (unused.length) await supabase.storage.from('lesson-images').remove(unused)
}
