import { supabase } from '@/lib/supabase'
import type { ClaimedCuriosityQuiz, CuriosityQuizRow, CuriosityQuizStatus } from '@/types/db'

export async function getCuriosityQuizById(id: number): Promise<CuriosityQuizRow | null> {
  const { data, error } = await supabase
    .from('curiosity_quizzes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load curiosity quiz: ${error.message}`)
  }

  return (data as CuriosityQuizRow) ?? null
}

export async function getCuriosityQuizByQuizId(quizId: number): Promise<CuriosityQuizRow | null> {
  const { data, error } = await supabase
    .from('curiosity_quizzes')
    .select('*')
    .eq('quiz_id', quizId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load curiosity quiz: ${error.message}`)
  }

  return (data as CuriosityQuizRow) ?? null
}

export async function createCuriosityQuiz(quizId: number): Promise<CuriosityQuizRow> {
  const { data, error } = await supabase
    .from('curiosity_quizzes')
    .insert({
      quiz_id: quizId,
      status: 'pending' as CuriosityQuizStatus,
      retry_count: 0,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create curiosity quiz: ${error?.message}`)
  }

  return data as CuriosityQuizRow
}

export async function updateCuriosityQuiz(
  id: number,
  updates: Partial<{
    status: CuriosityQuizStatus
    questions: unknown
    pedagogy: unknown
    model_version: string
    error_message: string
    retry_count: number
  }>
): Promise<void> {
  const { error } = await supabase.from('curiosity_quizzes').update(updates).eq('id', id)

  if (error) {
    throw new Error(`Failed to update curiosity quiz: ${error.message}`)
  }
}

export async function claimNextCuriosityQuiz(): Promise<ClaimedCuriosityQuiz | null> {
  const { data, error } = await supabase.rpc('claim_next_curiosity_quiz').maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to claim curiosity quiz: ${error.message}`)
  }

  return (data as ClaimedCuriosityQuiz) ?? null
}
