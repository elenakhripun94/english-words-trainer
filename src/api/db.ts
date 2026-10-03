import { getSupabase } from '../lib/supabase'
import {
  DEFAULT_EXERCISE_ORDER,
  defaultSettings,
  type ExerciseSettings,
  type ExerciseType,
} from '../lib/exercises'

export type LessonStatus = 'draft' | 'published' | 'archived'

export type Lesson = {
  id: string
  title: string
  topic: string | null
  description: string | null
  level: string | null
  status: LessonStatus
  updated_at: string
}

export type LessonItem = {
  id: string
  lesson_id: string
  position: number
  term: string
  translation: string | null
  phonetic: string | null
  audio_url: string | null
  image_path: string | null
  image_source: string | null
  image_source_url: string | null
  image_author: string | null
  image_license: string | null
}

export type LessonExercise = {
  lesson_id: string
  type: ExerciseType
  position: number
  settings: ExerciseSettings
}

export type Student = { id: string; name: string }

export type AssignmentRow = {
  id: string
  lesson_id: string
  student_id: string
  token: string
  revoked: boolean
  opened_at: string | null
  completed_at: string | null
  students: { name: string } | { name: string }[] | null
}

export type LessonCard = Lesson & { wordCount: number; finished: number; assigned: number }

export type ResultRow = {
  assignment_id: string
  lesson_id: string
  student_id: string
  student_name: string
  revoked: boolean
  opened_at: string | null
  assignment_completed_at: string | null
  exercise: ExerciseType
  exercise_position: number
  item_count: number
  available: boolean
  status: 'not_opened' | 'in_progress' | 'completed' | 'unsupported'
  first_try_correct: number
  attempt_count: number
  skip_count: number
  duration_ms: number
  moves_per_pair: number | null
  first_try_percent: number | null
  unsupported: boolean
}

export type AttemptRow = {
  id: number
  exercise: ExerciseType
  item_id: string
  chosen_item_id: string | null
  answer_text: string | null
  is_correct: boolean | null
  skipped: boolean
  created_at: string
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function listLessons(): Promise<LessonCard[]> {
  const { data, error } = await getSupabase()
    .from('lessons')
    .select('id, title, topic, description, level, status, updated_at, lesson_items(count), assignments(completed_at)')
    .order('updated_at', { ascending: false })
  fail(error)
  return ((data ?? []) as Array<Lesson & {
    lesson_items: Array<{ count: number }>
    assignments: Array<{ completed_at: string | null }>
  }>).map((lesson) => ({
    ...lesson,
    wordCount: lesson.lesson_items?.[0]?.count ?? 0,
    assigned: lesson.assignments?.length ?? 0,
    finished: lesson.assignments?.filter((item) => item.completed_at).length ?? 0,
  }))
}

export async function createLesson(title: string): Promise<Lesson> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('lessons').insert({ title }).select('id, title, topic, description, level, status, updated_at').single()
  fail(error)
  const lesson = data as Lesson
  const rows = DEFAULT_EXERCISE_ORDER.map((type, position) => ({
    lesson_id: lesson.id,
    type,
    position,
    settings: defaultSettings(type),
  }))
  const inserted = await supabase.from('lesson_exercises').insert(rows)
  fail(inserted.error)
  return lesson
}

export async function getLesson(id: string): Promise<Lesson | null> {
  const { data, error } = await getSupabase()
    .from('lessons')
    .select('id, title, topic, description, level, status, updated_at')
    .eq('id', id)
    .maybeSingle()
  fail(error)
  return (data as Lesson | null) ?? null
}

export async function updateLesson(id: string, patch: Partial<Pick<Lesson, 'title' | 'topic' | 'description' | 'level' | 'status'>>) {
  const { error } = await getSupabase().from('lessons').update(patch).eq('id', id)
  fail(error)
}

export async function deleteLesson(id: string) {
  const { error } = await getSupabase().from('lessons').delete().eq('id', id)
  fail(error)
}

export async function duplicateLesson(id: string): Promise<string> {
  const supabase = getSupabase()
  const lesson = await getLesson(id)
  if (!lesson) throw new Error('not_found')
  const items = await listItems(id)
  const exercises = await listExercises(id)
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      title: `${lesson.title} (копия)`,
      topic: lesson.topic,
      description: lesson.description,
      level: lesson.level,
      status: 'draft',
    })
    .select('id')
    .single()
  fail(error)
  const copyId = (data as { id: string }).id
  if (items.length) {
    const copied = await supabase.from('lesson_items').insert(
      items.map((item) => ({
        lesson_id: copyId,
        position: item.position,
        term: item.term,
        translation: item.translation,
        phonetic: item.phonetic,
        audio_url: item.audio_url,
        image_path: item.image_path,
        image_source: item.image_source,
        image_source_url: item.image_source_url,
        image_author: item.image_author,
        image_license: item.image_license,
      })),
    )
    fail(copied.error)
  }
  if (exercises.length) {
    const copied = await supabase.from('lesson_exercises').insert(
      exercises.map((exercise) => ({
        lesson_id: copyId,
        type: exercise.type,
        position: exercise.position,
        settings: exercise.settings,
      })),
    )
    fail(copied.error)
  }
  return copyId
}

export async function listItems(lessonId: string): Promise<LessonItem[]> {
  const { data, error } = await getSupabase()
    .from('lesson_items')
    .select('id, lesson_id, position, term, translation, phonetic, audio_url, image_path, image_source, image_source_url, image_author, image_license')
    .eq('lesson_id', lessonId)
    .order('position')
  fail(error)
  return (data ?? []) as LessonItem[]
}

export async function insertItem(lessonId: string, term: string, position: number): Promise<LessonItem> {
  const { data, error } = await getSupabase()
    .from('lesson_items')
    .insert({ lesson_id: lessonId, term, position })
    .select('id, lesson_id, position, term, translation, phonetic, audio_url, image_path, image_source, image_source_url, image_author, image_license')
    .single()
  fail(error)
  return data as LessonItem
}

export async function insertItems(
  lessonId: string,
  rows: Array<Pick<LessonItem, 'term' | 'translation' | 'phonetic' | 'audio_url'>>,
  startPosition: number,
): Promise<LessonItem[]> {
  const payload = rows.map((row, index) => ({
    id: crypto.randomUUID(),
    lesson_id: lessonId,
    position: startPosition + index,
    term: row.term,
    translation: row.translation,
    phonetic: row.phonetic,
    audio_url: row.audio_url,
  }))
  const { data, error } = await getSupabase()
    .from('lesson_items')
    .insert(payload)
    .select('id, lesson_id, position, term, translation, phonetic, audio_url, image_path, image_source, image_source_url, image_author, image_license')
  fail(error)
  const byId = new Map(((data ?? []) as LessonItem[]).map((item) => [item.id, item]))
  return payload.map((row) => byId.get(row.id)).filter((item): item is LessonItem => Boolean(item))
}

export async function updateItem(id: string, patch: Partial<LessonItem>) {
  const { error } = await getSupabase().from('lesson_items').update(patch).eq('id', id)
  fail(error)
}

export async function deleteItem(id: string) {
  const { error } = await getSupabase().from('lesson_items').delete().eq('id', id)
  fail(error)
}

export async function reorderItems(ids: string[]) {
  const supabase = getSupabase()
  const results = await Promise.all(ids.map((id, position) => supabase.from('lesson_items').update({ position }).eq('id', id)))
  for (const result of results) fail(result.error)
}

export async function listExercises(lessonId: string): Promise<LessonExercise[]> {
  const { data, error } = await getSupabase()
    .from('lesson_exercises')
    .select('lesson_id, type, position, settings')
    .eq('lesson_id', lessonId)
    .order('position')
  fail(error)
  return (data ?? []) as LessonExercise[]
}

export async function enableExercise(lessonId: string, type: ExerciseType, position: number) {
  const { error } = await getSupabase().from('lesson_exercises').insert({
    lesson_id: lessonId,
    type,
    position,
    settings: defaultSettings(type),
  })
  fail(error)
}

export async function disableExercise(lessonId: string, type: ExerciseType) {
  const { error } = await getSupabase().from('lesson_exercises').delete().eq('lesson_id', lessonId).eq('type', type)
  fail(error)
}

export async function updateExercise(lessonId: string, type: ExerciseType, patch: { position?: number; settings?: ExerciseSettings }) {
  const { error } = await getSupabase().from('lesson_exercises').update(patch).eq('lesson_id', lessonId).eq('type', type)
  fail(error)
}

export async function listStudents(): Promise<Student[]> {
  const { data, error } = await getSupabase().from('students').select('id, name').order('name')
  fail(error)
  return (data ?? []) as Student[]
}

export async function listAssignments(lessonId: string): Promise<AssignmentRow[]> {
  const { data, error } = await getSupabase()
    .from('assignments')
    .select('id, lesson_id, student_id, token, revoked, opened_at, completed_at, students(name)')
    .eq('lesson_id', lessonId)
    .order('created_at')
  fail(error)
  return (data ?? []) as AssignmentRow[]
}

export function studentName(row: AssignmentRow): string {
  if (!row.students) return 'Ученик'
  return Array.isArray(row.students) ? row.students[0]?.name ?? 'Ученик' : row.students.name
}

export async function publishLesson(lessonId: string, namesText: string, existingIds: string[]) {
  const supabase = getSupabase()
  const { data: students, error } = await supabase.from('students').select('id, name')
  fail(error)
  const known = new Map(((students ?? []) as Student[]).map((student) => [student.name.trim().toLowerCase(), student]))
  const ids = new Set(existingIds)

  for (const line of namesText.split(/\r?\n/)) {
    const name = line.trim()
    if (!name) continue
    const found = known.get(name.toLowerCase())
    if (found) {
      ids.add(found.id)
      continue
    }
    const created = await supabase.from('students').insert({ name }).select('id, name').single()
    fail(created.error)
    const student = created.data as Student
    known.set(name.toLowerCase(), student)
    ids.add(student.id)
  }

  const current = await listAssignments(lessonId)
  const assigned = new Set(current.map((row) => row.student_id))
  for (const studentId of ids) {
    if (assigned.has(studentId)) continue
    const inserted = await supabase.from('assignments').insert({ lesson_id: lessonId, student_id: studentId })
    fail(inserted.error)
  }

  const { error: publishError } = await supabase.from('lessons').update({ status: 'published' }).eq('id', lessonId)
  fail(publishError)
}

export async function revokeAssignment(id: string, revoked: boolean) {
  const { error } = await getSupabase().from('assignments').update({ revoked }).eq('id', id)
  fail(error)
}

export async function listResults(lessonId: string): Promise<ResultRow[]> {
  const { data, error } = await getSupabase().from('assignment_results').select('*').eq('lesson_id', lessonId)
  fail(error)
  return (data ?? []) as ResultRow[]
}

export async function getResultDetail(assignmentId: string) {
  const supabase = getSupabase()
  const assignmentResult = await supabase
    .from('assignments')
    .select('id, lesson_id, opened_at, completed_at, revoked, students(name)')
    .eq('id', assignmentId)
    .maybeSingle()
  fail(assignmentResult.error)
  const assignment = assignmentResult.data as (AssignmentRow & { lesson_id: string }) | null
  if (!assignment) return null
  const [items, exercises, attempts, lessonResult] = await Promise.all([
    listItems(assignment.lesson_id),
    listExercises(assignment.lesson_id),
    supabase.from('attempts').select('id, exercise, item_id, chosen_item_id, answer_text, is_correct, skipped, created_at').eq('assignment_id', assignmentId).order('created_at'),
    supabase.from('lessons').select('title').eq('id', assignment.lesson_id).maybeSingle(),
  ])
  fail(attempts.error)
  fail(lessonResult.error)
  return {
    assignment,
    student: studentName(assignment),
    title: (lessonResult.data as { title: string } | null)?.title ?? '',
    items,
    exercises,
    attempts: (attempts.data ?? []) as AttemptRow[],
  }
}
