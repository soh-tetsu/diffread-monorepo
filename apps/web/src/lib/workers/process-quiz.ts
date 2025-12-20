/**
 * processQuiz: Ensure quiz exists for article
 *
 * Responsibility:
 * - Atomically create or return existing quiz for article
 * - No state transitions (quiz is stateless)
 *
 * Pattern:
 * - Call ensure_quiz_exists RPC (upsert, handles conflicts atomically)
 * - Return success result
 */

import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { isSuccessWithData, type ProcessResult, successResult } from '@/lib/workers/process-result'
import { callRpc } from '@/lib/workers/rpc-helpers'
import type { ArticleRow, QuizRow } from '@/types/db'

type EnsureQuizExistsResult = {
  quiz_id: number
  article_id: number
  created_at: string
}

export async function processQuiz(article: ArticleRow): Promise<ProcessResult<QuizRow>> {
  logger.info({ articleId: article.id }, 'Processing quiz creation')

  // Call RPC to atomically create or return existing quiz
  const rpcResult = await callRpc<EnsureQuizExistsResult>(
    supabase.rpc('ensure_quiz_exists', { p_article_id: article.id }),
    'ensure_quiz_exists',
    { resourceType: 'quiz', resourceId: article.id }
  )

  // Early return on RPC failure
  if ('status' in rpcResult) return rpcResult as ProcessResult<QuizRow>

  const row = rpcResult.data
  const quiz: QuizRow = {
    id: row.quiz_id,
    article_id: row.article_id,
    variant: null,
    created_at: row.created_at,
    updated_at: new Date().toISOString(),
  }

  logger.info({ articleId: article.id, quizId: quiz.id }, 'Quiz processing succeeded')

  return successResult('quiz', quiz.id, quiz)
}
