/**
 * processCuriosityGeneration: Generate curiosity quiz questions
 *
 * Responsibility:
 * - Claim curiosity quiz for generation (state machine: pending/failed → processing)
 * - Handle state logic: skip if ready, skip if exhausted retries, retry if failed
 * - Generate questions via Gemini API with retry
 * - Update curiosity quiz status (processing → ready or failed)
 * - Increment retry count on failure
 *
 * State Logic:
 * - Status === 'ready' → skip (already generated)
 * - Status === 'processing' → skip (currently processing)
 * - Status === 'pending' → attempt generation with retry
 * - Status === 'failed' && retryCount < 3 → attempt generation with retry
 * - Status === 'failed' && retryCount >= 3 → mark skip_by_failure, skip
 * - Status === 'skip_by_failure' → skip (exhausted retries)
 *
 * Pattern:
 * - Call claim_curiosity_quiz_for_generation RPC (with FOR UPDATE + status check)
 * - RPC returns only if status is pending or failed with attempts remaining
 * - If claimed, attempt generation with withRetry (maxAttempts: 2)
 * - If fails, increment retryCount and update status to 'failed'
 */

import {
  type AnalysisResponse,
  AnalysisResponseSchema,
  analysisPromptV2,
  type CuriosityGeneratorPromptContext,
  type CuriosityGeneratorV2Response,
  CuriosityGeneratorV2ResponseSchema,
  createLLMClient,
  curiosityGeneratorPromptV2,
} from '@diffread/question-engine'
import { getArticleById, updateArticleMetadata } from '@/lib/db/articles'
import { getCuriosityQuizById, updateCuriosityQuiz } from '@/lib/db/curiosity-quizzes'
import { QuizRetryableError, QuizTerminalError } from '@/lib/errors/quiz-errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/utils/retry'
import { WORKER_CONSTANTS } from '@/lib/workers/constants'
import {
  failedResult,
  type ProcessResult,
  skippedResult,
  successResult,
} from '@/lib/workers/process-result'
import type { CuriosityQuizRow } from '@/types/db'

/**
 * Handle generation failure by incrementing retry count and updating status
 * Centralizes retry logic to avoid duplication
 */
async function handleGenerationFailure(
  curiosityQuizId: number,
  error: Error | string,
  currentRetryCount: number
): Promise<void> {
  const errorMsg = error instanceof Error ? error.message : error
  const nextRetryCount = currentRetryCount + 1
  const nextStatus =
    nextRetryCount >= WORKER_CONSTANTS.RETRY.MAX_QUIZ_RETRIES ? 'skip_by_failure' : 'failed'

  await updateCuriosityQuiz(curiosityQuizId, {
    status: nextStatus,
    error_message: errorMsg.slice(0, WORKER_CONSTANTS.ERROR.MAX_MESSAGE_LENGTH),
    retry_count: nextRetryCount,
  })

  logger.error(
    { curiosityQuizId, retryCount: nextRetryCount, nextStatus },
    `Generation failed: ${errorMsg}`
  )
}

async function extractPedagogyCore(
  curiosityQuizId: number,
  articleId: number,
  content: string
): Promise<AnalysisResponse['metadata']> {
  logger.info(
    {
      curiosityQuizId,
      articleId,
      contentLength: content?.length ?? 0,
    },
    'Running V2 analysis prompt'
  )

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }

  const executor = createLLMClient({
    apiKey,
    model: process.env.GEMINI_MODEL,
    responseMimeType: 'text/plain',
    thinkingConfig: {
      includeThoughts: false,
      thinkingBudget: 0,
    },
  })

  const analysisResponse: AnalysisResponse = await executor.execute(
    analysisPromptV2,
    { text: content },
    AnalysisResponseSchema
  )

  logger.info(
    {
      curiosityQuizId,
      archetype: analysisResponse.metadata.archetype.label,
    },
    'V2 analysis completed'
  )

  // Store pedagogy in curiosity_quiz
  await updateCuriosityQuiz(curiosityQuizId, {
    pedagogy: analysisResponse.metadata.pedagogy,
  })

  // Merge AI metadata with existing article metadata
  const article = await getArticleById(articleId)
  const mergedMetadata = {
    ...article.metadata,
    archetype: analysisResponse.metadata.archetype,
    logical_schema: analysisResponse.metadata.logical_schema,
    structural_skeleton: analysisResponse.metadata.structural_skeleton,
    domain: analysisResponse.metadata.domain,
    core_thesis: analysisResponse.metadata.core_thesis,
    summary: analysisResponse.metadata.summary,
    language: analysisResponse.metadata.language,
  }
  await updateArticleMetadata(articleId, mergedMetadata)

  return analysisResponse.metadata
}

async function extractPedagogy(
  curiosityQuizId: number,
  articleId: number,
  content: string
): Promise<AnalysisResponse['metadata']> {
  try {
    return await withRetry(() => extractPedagogyCore(curiosityQuizId, articleId, content), {
      maxAttempts: WORKER_CONSTANTS.RETRY.MAX_GENERATION_ATTEMPTS,
      delayMs: WORKER_CONSTANTS.RETRY.RETRY_DELAY_MS,
      onRetry: (attempt, error) => {
        logger.warn(
          { curiosityQuizId, attempt, err: error },
          'Pedagogy extraction failed, will retry'
        )
      },
      onFailure: (attempts, error) => {
        logger.error(
          { curiosityQuizId, attempts, err: error },
          'Pedagogy extraction failed after all retries'
        )
      },
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    throw new QuizRetryableError(`Pedagogy extraction failed: ${err.message}`, curiosityQuizId, err)
  }
}

async function generateCuriosityQuestionsCore(
  curiosityQuizId: number,
  metadata: AnalysisResponse['metadata']
): Promise<CuriosityGeneratorV2Response['quiz_cards']> {
  logger.info({ curiosityQuizId }, 'Running V2 hook generation prompt')

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable')
  }

  const executor = createLLMClient({
    apiKey,
    model: process.env.GEMINI_MODEL,
    temperature: 0.1,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
    thinkingConfig: {
      includeThoughts: false,
      thinkingBudget: 0,
    },
  })

  const context: CuriosityGeneratorPromptContext = { metadata }

  const hookResponse: CuriosityGeneratorV2Response = await executor.execute(
    curiosityGeneratorPromptV2,
    context,
    CuriosityGeneratorV2ResponseSchema
  )

  logger.info(
    {
      curiosityQuizId,
      quizCardCount: hookResponse.quiz_cards.length,
    },
    'V2 hook generation completed'
  )

  return hookResponse.quiz_cards
}

async function generateCuriosityQuestions(
  curiosityQuizId: number,
  metadata: AnalysisResponse['metadata']
): Promise<CuriosityGeneratorV2Response['quiz_cards']> {
  try {
    return await withRetry(() => generateCuriosityQuestionsCore(curiosityQuizId, metadata), {
      maxAttempts: WORKER_CONSTANTS.RETRY.MAX_GENERATION_ATTEMPTS,
      delayMs: WORKER_CONSTANTS.RETRY.RETRY_DELAY_MS,
      onRetry: (attempt, error) => {
        logger.warn(
          { curiosityQuizId, attempt, err: error },
          'Question generation failed, will retry'
        )
      },
      onFailure: (attempts, error) => {
        logger.error(
          { curiosityQuizId, attempts, err: error },
          'Question generation failed after all retries'
        )
      },
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    throw new QuizRetryableError(`Question generation failed: ${err.message}`, curiosityQuizId, err)
  }
}

export async function processCuriosityGeneration(
  curiosityQuiz: CuriosityQuizRow
): Promise<ProcessResult<Record<string, never>>> {
  try {
    logger.info({ curiosityQuizId: curiosityQuiz.id }, 'Processing curiosity generation')

    // Step 1: Claim curiosity quiz for generation
    const result = await supabase.rpc('claim_curiosity_quiz_for_generation', {
      p_curiosity_quiz_id: curiosityQuiz.id,
    })

    if (result.error) {
      const errorMsg = `Failed to claim curiosity quiz: ${result.error.message}`
      logger.error({ curiosityQuizId: curiosityQuiz.id, err: result.error }, errorMsg)
      return failedResult('generation', curiosityQuiz.id, errorMsg)
    }

    if (!result.data || result.data.length === 0 || !result.data[0].claimed) {
      // Not claimed - check why
      const current = await getCuriosityQuizById(curiosityQuiz.id)
      if (!current) {
        return failedResult('generation', curiosityQuiz.id, 'Curiosity quiz not found')
      }

      if (current.status === 'ready') {
        logger.info({ curiosityQuizId: curiosityQuiz.id }, 'Curiosity quiz already ready')
        return successResult('generation', curiosityQuiz.id, {})
      }

      if (current.status === 'processing') {
        logger.info({ curiosityQuizId: curiosityQuiz.id }, 'Curiosity quiz currently processing')
        return skippedResult('generation', curiosityQuiz.id)
      }

      if (current.status === 'skip_by_failure') {
        logger.info({ curiosityQuizId: curiosityQuiz.id }, 'Curiosity quiz exhausted retries')
        return skippedResult('generation', curiosityQuiz.id, 'Exhausted retries')
      }

      logger.info(
        { curiosityQuizId: curiosityQuiz.id, status: current.status },
        'Could not claim curiosity quiz'
      )
      return skippedResult('generation', curiosityQuiz.id)
    }

    const row = result.data[0]
    const quizId = row.quiz_id
    const articleId = row.article_id

    // Step 2: Get article for content
    const article = await getArticleById(articleId)
    if (!article || !article.storage_path) {
      const errorMsg = 'Article content not available'
      logger.error({ articleId }, errorMsg)
      return failedResult('generation', curiosityQuiz.id, errorMsg)
    }

    // Load article content
    const { downloadArticleContent } = await import('@/lib/storage')
    let content: string
    try {
      const downloadedContent = await downloadArticleContent(
        article.storage_path || '',
        article.storage_metadata || {}
      )
      if (!downloadedContent) {
        throw new Error('Downloaded content is empty')
      }
      content = downloadedContent
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const errorMsg = `Failed to load article content: ${err.message}`
      logger.error({ articleId, err }, errorMsg)

      await handleGenerationFailure(curiosityQuiz.id, errorMsg, curiosityQuiz.retry_count ?? 0)
      return failedResult('generation', curiosityQuiz.id, errorMsg)
    }

    // Step 3: Extract pedagogy (with retry)
    let metadata: AnalysisResponse['metadata']
    try {
      const existing = await getCuriosityQuizById(curiosityQuiz.id)
      if (existing?.pedagogy) {
        logger.info({ curiosityQuizId: curiosityQuiz.id }, 'Reusing existing pedagogy')
        const articleData = await getArticleById(articleId)
        metadata = {
          archetype: articleData.metadata?.archetype,
          logical_schema: articleData.metadata?.logical_schema,
          structural_skeleton: articleData.metadata?.structural_skeleton,
          domain: articleData.metadata?.domain,
          core_thesis: articleData.metadata?.core_thesis,
          pedagogy: existing.pedagogy,
          language: articleData.metadata?.language || 'en',
        } as AnalysisResponse['metadata']
      } else {
        metadata = await extractPedagogy(curiosityQuiz.id, articleId, content)
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const errorMsg = `Pedagogy extraction failed: ${err.message}`
      logger.error({ curiosityQuizId: curiosityQuiz.id, err }, errorMsg)

      await handleGenerationFailure(curiosityQuiz.id, errorMsg, curiosityQuiz.retry_count ?? 0)
      return failedResult('generation', curiosityQuiz.id, errorMsg)
    }

    // Step 4: Generate questions (with retry)
    try {
      const questions = await generateCuriosityQuestions(curiosityQuiz.id, metadata)

      // Step 5: Store and mark ready
      await updateCuriosityQuiz(curiosityQuiz.id, {
        questions,
        status: 'ready',
        model_version: process.env.GEMINI_MODEL || 'unknown',
      })

      logger.info({ curiosityQuizId: curiosityQuiz.id, quizId }, 'Generation succeeded')
      return successResult('generation', curiosityQuiz.id, {})
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const errorMsg = `Question generation failed: ${err.message}`
      logger.error({ curiosityQuizId: curiosityQuiz.id, err }, errorMsg)

      await handleGenerationFailure(curiosityQuiz.id, errorMsg, curiosityQuiz.retry_count ?? 0)
      return failedResult('generation', curiosityQuiz.id, errorMsg)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const errorMsg = `Unexpected generation error: ${err.message}`
    logger.error({ curiosityQuizId: curiosityQuiz.id, err }, errorMsg)
    return failedResult('generation', curiosityQuiz.id, errorMsg)
  }
}
