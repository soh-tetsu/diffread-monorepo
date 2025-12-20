/**
 * processSession: Orchestrate session processing through all stages
 *
 * Responsibility:
 * - Coordinate processArticle → processQuiz → processCuriosityQuiz → processCuriosityGeneration
 * - Update session status on success/failure
 * - Stop on first failure
 *
 * Entry point called by:
 * - POST /api/curiosity when queue has slots
 * - processNextBookmarkedSession when dequeuing from bookmarks
 * - Manual retry from errored state
 */

import { updateSession, updateSessionStatus } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { processArticle } from '@/lib/workers/process-article'
import { processCuriosityQuiz } from '@/lib/workers/process-curiosity-quiz'
import { processQuiz } from '@/lib/workers/process-quiz'
import { executeStep } from '@/lib/workers/step-handler'
import type { SessionRow } from '@/types/db'

export async function processSession(session: SessionRow): Promise<void> {
  try {
    logger.info(
      { sessionToken: session.session_token, sessionId: session.id },
      'Starting session processing'
    )

    // Step 1: Process article
    const articleResult = await executeStep(session, {
      name: 'article',
      execute: () => processArticle(session),
    })
    if (!articleResult.success) return
    const article = articleResult.data

    // Step 2: Process quiz
    const quizResult = await executeStep(session, {
      name: 'quiz',
      execute: () => processQuiz(article),
      onSuccess: async (quiz) => {
        await updateSession(session.id, { quiz_id: quiz.id })
      },
    })
    if (!quizResult.success) return
    const quiz = quizResult.data

    // Step 3: Process curiosity quiz
    const curiosityQuizResult = await executeStep(session, {
      name: 'curiosityQuiz',
      execute: () => processCuriosityQuiz(quiz),
    })
    if (!curiosityQuizResult.success) return
    const curiosityQuiz = curiosityQuizResult.data

    // Step 4: Process generation
    const { processCuriosityGeneration } = await import('@/lib/workers/process-generation')
    const generationResult = await executeStep(session, {
      name: 'generation',
      execute: () => processCuriosityGeneration(curiosityQuiz),
      finalStep: true,
    })
    if (!generationResult.success) return

    // Success
    logger.info({ sessionId: session.id }, 'Session processing completed successfully')
    await updateSessionStatus(quiz.id, 'ready')
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ sessionId: session.id, err }, 'Unexpected error during session processing')
    await updateSession(session.id, {
      status: 'errored',
      metadata: {
        ...session.metadata,
        lastError: { step: 'unknown', reason: err.message },
      },
    })
  }
}
