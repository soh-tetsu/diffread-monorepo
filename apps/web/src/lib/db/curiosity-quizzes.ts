import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { execute, queryMaybeSingle, querySingle } from '@/lib/db/supabase-helpers'
import { supabase } from '@/lib/supabase'
import type { ClaimedCuriosityQuiz, CuriosityQuizRow, CuriosityQuizStatus } from '@/types/db'

export async function getCuriosityQuizById(id: number): Promise<CuriosityQuizRow | null> {
  const result = await supabase.from('curiosity_quizzes').select('*').eq('id', id).maybeSingle()
  return queryMaybeSingle<CuriosityQuizRow>(result, { context: `load curiosity quiz ${id}` })
}

export async function getCuriosityQuizByQuizId(quizId: number): Promise<CuriosityQuizRow | null> {
  const result = await supabase
    .from('curiosity_quizzes')
    .select('*')
    .eq('quiz_id', quizId)
    .maybeSingle()
  return queryMaybeSingle<CuriosityQuizRow>(result, {
    context: `load curiosity quiz for quiz ${quizId}`,
  })
}

export async function createCuriosityQuiz(quizId: number): Promise<CuriosityQuizRow> {
  const result = await supabase
    .from('curiosity_quizzes')
    .insert({
      quiz_id: quizId,
      status: 'pending' as CuriosityQuizStatus,
      retry_count: 0,
    })
    .select('*')
    .single()
  return querySingle<CuriosityQuizRow>(result, { context: 'create curiosity quiz' })
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
  const result = await supabase.from('curiosity_quizzes').update(updates).eq('id', id)
  execute(result, { context: `update curiosity quiz ${id}` })
}

export async function claimCuriosityQuiz(
  curiosityQuizId: number
): Promise<{ claimed: boolean; info: ClaimedCuriosityQuiz | null }> {
  const result = (await supabase
    .rpc('claim_specific_curiosity_quiz', { p_curiosity_quiz_id: curiosityQuizId })
    .maybeSingle()) as PostgrestSingleResponse<ClaimedCuriosityQuiz & { claimed: boolean }>

  const data = queryMaybeSingle<ClaimedCuriosityQuiz & { claimed: boolean }>(result, {
    context: `claim curiosity quiz ${curiosityQuizId}`,
  })

  if (!data) {
    return { claimed: false, info: null }
  }

  const { claimed, ...info } = data
  return { claimed, info }
}
