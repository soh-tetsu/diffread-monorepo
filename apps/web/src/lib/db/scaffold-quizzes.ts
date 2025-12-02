import { supabase } from '@/lib/supabase'
import type { ClaimedScaffoldQuiz, ScaffoldQuizRow, ScaffoldQuizStatus } from '@/types/db'

export async function getScaffoldQuizById(id: number): Promise<ScaffoldQuizRow | null> {
  const { data, error } = await supabase
    .from('scaffold_quizzes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load scaffold quiz: ${error.message}`)
  }

  return (data as ScaffoldQuizRow) ?? null
}

export async function getScaffoldQuizByQuizId(quizId: number): Promise<ScaffoldQuizRow | null> {
  const { data, error } = await supabase
    .from('scaffold_quizzes')
    .select('*')
    .eq('quiz_id', quizId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load scaffold quiz: ${error.message}`)
  }

  return (data as ScaffoldQuizRow) ?? null
}

export async function createScaffoldQuiz(quizId: number): Promise<ScaffoldQuizRow> {
  const { data, error } = await supabase
    .from('scaffold_quizzes')
    .insert({
      quiz_id: quizId,
      status: 'pending' as ScaffoldQuizStatus,
      retry_count: 0,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create scaffold quiz: ${error?.message}`)
  }

  return data as ScaffoldQuizRow
}

export async function updateScaffoldQuiz(
  id: number,
  updates: Partial<{
    status: ScaffoldQuizStatus
    questions: unknown
    reading_plan: unknown
    model_version: string
    error_message: string
    retry_count: number
  }>
): Promise<void> {
  const { error } = await supabase.from('scaffold_quizzes').update(updates).eq('id', id)

  if (error) {
    throw new Error(`Failed to update scaffold quiz: ${error.message}`)
  }
}

export async function claimNextScaffoldQuiz(): Promise<ClaimedScaffoldQuiz | null> {
  const { data, error } = await supabase.rpc('claim_next_scaffold_quiz').maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to claim scaffold quiz: ${error.message}`)
  }

  return (data as ClaimedScaffoldQuiz) ?? null
}
