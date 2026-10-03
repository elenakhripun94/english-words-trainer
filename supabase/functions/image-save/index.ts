import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'

type Candidate = {
  source?: string
  fullUrl?: string
  pageUrl?: string
  author?: string
  license?: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  try {
    const { lessonId, itemId, candidate } = (await req.json()) as {
      lessonId?: string
      itemId?: string
      candidate?: Candidate
    }
    if (!lessonId || !itemId || !candidate?.fullUrl) return json({ error: 'bad_request' }, 400)
    const sourceUrl = new URL(candidate.fullUrl)
    if (sourceUrl.protocol !== 'https:') return json({ error: 'https_only' }, 400)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: lesson } = await userClient.from('lessons').select('id').eq('id', lessonId).maybeSingle()
    if (!lesson) return json({ error: 'forbidden' }, 403)
    const { data: item } = await userClient.from('lesson_items').select('id').eq('id', itemId).eq('lesson_id', lessonId).maybeSingle()
    if (!item) return json({ error: 'not_found' }, 404)

    const response = await fetch(candidate.fullUrl, { signal: AbortSignal.timeout(12000) })
    if (!response.ok) return json({ error: 'download_failed' }, 502)
    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return json({ error: 'not_an_image' }, 400)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > 5 * 1024 * 1024) return json({ error: 'image_too_large' }, 400)
    const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg'
    const path = `${lessonId}/${itemId}-${crypto.randomUUID().slice(0, 8)}.${extension}`

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const uploaded = await admin.storage.from('lesson-images').upload(path, bytes, { contentType: type, upsert: false })
    if (uploaded.error) return json({ error: uploaded.error.message }, 500)

    const updated = await userClient
      .from('lesson_items')
      .update({
        image_path: path,
        image_source: candidate.source ?? 'upload',
        image_source_url: candidate.pageUrl ?? null,
        image_author: candidate.author ?? null,
        image_license: candidate.license ?? null,
      })
      .eq('id', itemId)
    if (updated.error) return json({ error: updated.error.message }, 500)
    return json({ imagePath: path })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'save_failed' }, 500)
  }
})
