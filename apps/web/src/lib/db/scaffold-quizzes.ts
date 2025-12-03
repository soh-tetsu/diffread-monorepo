import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { execute, queryMaybeSingle, querySingle } from '@/lib/db/supabase-helpers'
import { supabase } from '@/lib/supabase'
import type { ClaimedScaffoldQuiz, ScaffoldQuizRow, ScaffoldQuizStatus } from '@/types/db'

export async function getScaffoldQuizById(id: number): Promise<ScaffoldQuizRow | null> {
  const result = await supabase.from('scaffold_quizzes').select('*').eq('id', id).maybeSingle()
  return queryMaybeSingle<ScaffoldQuizRow>(result, { context: `load scaffold quiz ${id}` })
}

export async function getScaffoldQuizByQuizId(quizId: number): Promise<ScaffoldQuizRow | null> {
  const result = await supabase
    .from('scaffold_quizzes')
    .select('*')
    .eq('quiz_id', quizId)
    .maybeSingle()
  return queryMaybeSingle<ScaffoldQuizRow>(result, {
    context: `load scaffold quiz for quiz ${quizId}`,
  })
}

export async function createScaffoldQuiz(quizId: number): Promise<ScaffoldQuizRow> {
  const result = await supabase
    .from('scaffold_quizzes')
    .insert({
      quiz_id: quizId,
      status: 'pending' as ScaffoldQuizStatus,
      retry_count: 0,
    })
    .select('*')
    .single()
  return querySingle<ScaffoldQuizRow>(result, { context: 'create scaffold quiz' })
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
  const result = await supabase.from('scaffold_quizzes').update(updates).eq('id', id)
  execute(result, { context: `update scaffold quiz ${id}` })
}

export async function claimNextScaffoldQuiz(): Promise<ClaimedScaffoldQuiz | null> {
  const result = (await supabase
    .rpc('claim_next_scaffold_quiz')
    .maybeSingle()) as PostgrestSingleResponse<ClaimedScaffoldQuiz>
  return queryMaybeSingle<ClaimedScaffoldQuiz>(result, { context: 'claim scaffold quiz' })
}
