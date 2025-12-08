import {
  type AnalysisResponse,
  AnalysisResponseSchema,
  analysisPromptV2,
  createLLMClient,
  type HookGeneratorPromptContext,
  type HookGeneratorV2Response,
  HookGeneratorV2ResponseSchema,
  hookGeneratorPromptV2,
} from '@diffread/question-engine'
import { getArticleById, updateArticleMetadata } from '@/lib/db/articles'
import {
  claimCuriosityQuiz,
  getCuriosityQuizById,
  updateCuriosityQuiz,
} from '@/lib/db/curiosity-quizzes'
import { updateSessionStatus } from '@/lib/db/sessions'
import {
  ArticleInvalidStateError,
  ArticleRetryableError,
  ArticleTerminalError,
} from '@/lib/errors/article-errors'
import { QuizRetryableError, QuizTerminalError } from '@/lib/errors/quiz-errors'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/utils/retry'
import { ensureArticleContent } from '@/lib/workflows/article-content'

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
      contentPreview: content?.substring(0, 200) ?? '(empty)',
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
      hookCount: analysisResponse.metadata.pedagogy.hooks.length,
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
      maxAttempts: 2,
      delayMs: 1000,
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
): Promise<HookGeneratorV2Response['quiz_cards']> {
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

  const context: HookGeneratorPromptContext = { metadata }

  const hookResponse: HookGeneratorV2Response = await executor.execute(
    hookGeneratorPromptV2,
    context,
    HookGeneratorV2ResponseSchema
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
): Promise<HookGeneratorV2Response['quiz_cards']> {
  try {
    return await withRetry(() => generateCuriosityQuestionsCore(curiosityQuizId, metadata), {
      maxAttempts: 2,
      delayMs: 1000,
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

/**
 * Handle session-level failures by updating session status
 *
 * Responsibility:
 * - Update all linked sessions to reflect the failure
 *
 * Sub-task responsibilities (NOT this function's job):
 * - Article errors: Article status already updated by ensureArticleContent
 * - Quiz errors: Quiz status already updated by quiz generation logic
 */
async function handleSessionFailure(
  curiosityQuizId: number,
  quizId: number,
  error: Error
): Promise<void> {
  // Check if error indicates terminal article failure or invalid state
  if (error instanceof ArticleTerminalError || error instanceof ArticleInvalidStateError) {
    // Article is terminal or in invalid state - session cannot proceed
    // Article status is already updated by ensureArticleContent
    const errorType = error instanceof ArticleInvalidStateError ? 'invalid state' : 'terminal'

    await updateSessionStatus(quizId, 'skip_by_failure')

    logger.error(
      { curiosityQuizId, quizId, articleId: error.articleId, articleStatus: error.articleStatus },
      `Article ${errorType}, marking session as skip_by_failure`
    )
    return
  }

  // Check if error is retryable article error (transient failures like storage errors)
  if (error instanceof ArticleRetryableError) {
    // Retryable error - mark session as errored for retry
    // Article status is already handled by article sub-task
    await updateSessionStatus(quizId, 'errored')

    logger.warn(
      { curiosityQuizId, quizId, articleId: error.articleId },
      'Article retryable error, marking session as errored for retry'
    )
    return
  }

  // Check if quiz error is terminal
  if (error instanceof QuizTerminalError) {
    // Terminal quiz error - cannot proceed
    // Quiz status already updated by quiz generation logic
    await updateSessionStatus(quizId, 'skip_by_failure')

    logger.error(
      { curiosityQuizId, quizId },
      'Quiz terminal error, marking session as skip_by_failure'
    )
    return
  }

  // Check if quiz error is retryable (transient failures)
  if (error instanceof QuizRetryableError) {
    // Get current retry count and determine next action
    const quiz = await getCuriosityQuizById(curiosityQuizId)
    if (!quiz) {
      logger.error({ curiosityQuizId }, 'Curiosity quiz not found during failure handling')
      return
    }

    const retryCount = quiz.retry_count + 1
    const maxRetries = 3

    if (retryCount >= maxRetries) {
      // Exhausted session-level retries - mark as terminal
      await updateCuriosityQuiz(curiosityQuizId, {
        status: 'skip_by_failure',
        error_message: error.message.slice(0, 500),
        retry_count: retryCount,
      })

      await updateSessionStatus(quizId, 'skip_by_failure')

      logger.error(
        { curiosityQuizId, quizId, retryCount },
        'Quiz failed after max session retries, marked as skip_by_failure'
      )
    } else {
      // Mark for session-level retry
      await updateCuriosityQuiz(curiosityQuizId, {
        status: 'failed',
        error_message: error.message.slice(0, 500),
        retry_count: retryCount,
      })

      await updateSessionStatus(quizId, 'errored')

      logger.warn(
        { curiosityQuizId, quizId, retryCount, maxRetries },
        'Quiz retryable error, marked for session-level retry'
      )
    }
    return
  }

  // Unknown error type - treat as retryable with retry logic
  const curiosityQuiz = await getCuriosityQuizById(curiosityQuizId)
  if (!curiosityQuiz) {
    logger.error({ curiosityQuizId }, 'Curiosity quiz not found during failure handling')
    return
  }

  const retryCount = curiosityQuiz.retry_count + 1
  const maxRetries = 3

  if (retryCount >= maxRetries) {
    // Skip after max retries
    await updateCuriosityQuiz(curiosityQuizId, {
      status: 'skip_by_failure',
      error_message: error.message.slice(0, 500),
      retry_count: retryCount,
    })

    await updateSessionStatus(quizId, 'skip_by_failure')

    logger.error(
      { curiosityQuizId, quizId, retryCount },
      'Unknown error after max retries, marked as skip_by_failure'
    )
  } else {
    // Mark as failed, will retry
    await updateCuriosityQuiz(curiosityQuizId, {
      status: 'failed',
      error_message: error.message.slice(0, 500),
      retry_count: retryCount,
    })

    await updateSessionStatus(quizId, 'errored')

    logger.warn(
      { curiosityQuizId, quizId, retryCount, maxRetries },
      'Unknown error, marked for retry'
    )
  }
}

/**
 * Process a session by orchestrating article and quiz generation sub-tasks
 *
 * Responsibility:
 * - Orchestrate sub-tasks: article content loading, quiz generation
 * - Update session status on success
 * - Errors are caught by caller and handled by handleSessionFailure
 */
async function processSessionCore(
  curiosityQuizId: number,
  quizId: number,
  articleId: number
): Promise<void> {
  logger.info({ curiosityQuizId, quizId }, 'Processing session')

  // Step 1: Load article content
  const article = await getArticleById(articleId)
  logger.info(
    { curiosityQuizId, articleId, articleStatus: article.status },
    'Loading article contentupdateSessionsByQuizId'
  )

  const result = await ensureArticleContent(article)
  const content = result.content

  logger.info(
    {
      curiosityQuizId,
      articleId,
      contentLength: content?.length ?? 0,
    },
    'Article content loaded'
  )

  // Step 2: Check if pedagogy already extracted (idempotency)
  const curiosityQuiz = await getCuriosityQuizById(curiosityQuizId)
  if (!curiosityQuiz) {
    throw new QuizTerminalError(
      `Curiosity quiz ${curiosityQuizId} not found - data integrity issue`,
      curiosityQuizId
    )
  }

  let metadata: AnalysisResponse['metadata']

  if (curiosityQuiz.pedagogy) {
    // Reuse existing pedagogy
    logger.info({ curiosityQuizId }, 'Reusing existing pedagogy')

    // Reconstruct metadata from article + pedagogy
    const articleData = await getArticleById(articleId)
    metadata = {
      archetype: articleData.metadata.archetype,
      logical_schema: articleData.metadata.logical_schema,
      structural_skeleton: articleData.metadata.structural_skeleton,
      domain: articleData.metadata.domain,
      core_thesis: articleData.metadata.core_thesis,
      pedagogy: curiosityQuiz.pedagogy,
      language: articleData.metadata.language || 'en',
    } as AnalysisResponse['metadata']
  } else {
    // Extract pedagogy
    metadata = await extractPedagogy(curiosityQuizId, articleId, content)
  }

  // Step 3: Generate curiosity questions from pedagogy
  const questions = await generateCuriosityQuestions(curiosityQuizId, metadata)

  // Step 4: Store questions and mark ready
  await updateCuriosityQuiz(curiosityQuizId, {
    questions,
    status: 'ready',
    model_version: process.env.GEMINI_MODEL || 'unknown',
  })

  // Step 5: Update ALL sessions linked to this quiz
  await updateSessionStatus(quizId, 'ready')

  logger.info({ curiosityQuizId, quizId }, 'Curiosity quiz completed')
}

export async function processSession(curiosityQuizId: number): Promise<void> {
  // Step 1: Claim specific curiosity quiz (atomic lock)
  const result = await claimCuriosityQuiz(curiosityQuizId)
  if (!result.claimed || !result.info) {
    // Check actual status for better logging
    const quiz = await getCuriosityQuizById(curiosityQuizId)
    if (!quiz) {
      logger.warn(
        { curiosityQuizId },
        'Curiosity quiz does not exist - this is a data integrity issue'
      )
    } else if (quiz.status === 'ready') {
      // Quiz is already ready - propagate success to sessions
      logger.info(
        { curiosityQuizId, quizId: quiz.quiz_id },
        'Curiosity quiz already ready, propagating success to sessions'
      )
      await updateSessionStatus(quiz.quiz_id, 'ready')
    } else {
      logger.info(
        { curiosityQuizId, actualStatus: quiz.status },
        'Could not claim session (not in pending/failed status)'
      )
    }
    return
  }

  const { quiz_id, article_id } = result.info

  try {
    await processSessionCore(curiosityQuizId, quiz_id, article_id)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err, curiosityQuizId, quizId: quiz_id }, 'Session processing failed')
    await handleSessionFailure(curiosityQuizId, quiz_id, err)
  }
}
