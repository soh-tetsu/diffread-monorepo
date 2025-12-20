/**
 * processCuriosityQuiz: Ensure curiosity quiz exists for quiz
 *
 * Responsibility:
 * - Atomically create or return existing curiosity quiz for quiz
 * - No state transitions (curiosity quiz is stateless at creation, state machine starts at generation)
 *
 * Pattern:
 * - Call ensure_curiosity_quiz_exists RPC (upsert, handles conflicts atomically)
 * - Return success result
 */

import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { isSuccessWithData, type ProcessResult, successResult } from '@/lib/workers/process-result'
import { callRpc } from '@/lib/workers/rpc-helpers'
import type { CuriosityQuizRow, CuriosityQuizStatus, QuizRow } from '@/types/db'

type EnsureCuriosityQuizExistsResult = {
  curiosity_quiz_id: number
  quiz_id: number
  status: CuriosityQuizStatus
  created_at: string
}

export async function processCuriosityQuiz(
  quiz: QuizRow
): Promise<ProcessResult<CuriosityQuizRow>> {
  logger.info({ quizId: quiz.id }, 'Processing curiosity quiz creation')

  // Call RPC to atomically create or return existing curiosity quiz
  const rpcResult = await callRpc<EnsureCuriosityQuizExistsResult>(
    supabase.rpc('ensure_curiosity_quiz_exists', { p_quiz_id: quiz.id }),
    'ensure_curiosity_quiz_exists',
    { resourceType: 'curiosityQuiz', resourceId: quiz.id }
  )

  // Early return on RPC failure
  if ('status' in rpcResult) return rpcResult as ProcessResult<CuriosityQuizRow>

  const row = rpcResult.data
  const curiosityQuiz: CuriosityQuizRow = {
    id: row.curiosity_quiz_id,
    quiz_id: row.quiz_id,
    status: row.status,
    questions: null,
    pedagogy: null,
    model_version: null,
    error_message: null,
    retry_count: 0,
    created_at: row.created_at,
    updated_at: new Date().toISOString(),
  }

  logger.info(
    { quizId: quiz.id, curiosityQuizId: curiosityQuiz.id },
    'Curiosity quiz processing succeeded'
  )

  return successResult('curiosityQuiz', curiosityQuiz.id, curiosityQuiz)
}
