import { z } from 'zod'
import { supabaseUrl } from './env'
import { getSupabase } from './supabase'

export const imageCandidateSchema = z.object({
  source: z.enum(['pixabay', 'openverse']),
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

const searchResponseSchema = z.object({
  candidates: z.array(imageCandidateSchema),
  warnings: z.array(z.string()).optional(),
})

export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = supabaseUrl()
  if (!base) return null
  return `${base}/storage/v1/object/public/lesson-images/${path}`
}

export async function searchImages(query: string, page = 1) {
  const { data, error } = await getSupabase().functions.invoke('image-search', {
    body: { query, page },
  })
  if (error) throw new Error(error.message)
  const parsed = searchResponseSchema.safeParse(data)
  if (!parsed.success) throw new Error('image_search_invalid')
  return { candidates: parsed.data.candidates, warnings: parsed.data.warnings ?? [] }
}

export async function saveRemoteImage(lessonId: string, itemId: string, candidate: ImageCandidate) {
  const { data, error } = await getSupabase().functions.invoke('image-save', {
    body: { lessonId, itemId, candidate },
  })
  if (error) throw new Error(error.message)
  const parsed = z.object({ imagePath: z.string() }).safeParse(data)
  if (!parsed.success) throw new Error('image_save_invalid')
  return parsed.data.imagePath
}

export async function uploadLessonImage(lessonId: string, itemId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image')
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large')
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const path = `${lessonId}/${itemId}-${crypto.randomUUID()}.${extension}`
  const supabase = getSupabase()
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
  return path
}
