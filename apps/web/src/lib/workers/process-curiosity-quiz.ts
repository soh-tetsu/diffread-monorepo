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
import { updateSessionsByQuizId } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { ensureArticleContent } from '@/lib/workflows/article-content'

async function extractPedagogy(
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

async function generateCuriosityQuestions(
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

async function handleCuriosityQuizFailure(
  curiosityQuizId: number,
  quizId: number,
  error: Error
): Promise<void> {
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

    // Update all sessions
    await updateSessionsByQuizId(quizId, { status: 'skip_by_failure' })

    logger.error(
      { curiosityQuizId, quizId, retryCount },
      'Curiosity quiz failed after max retries, marked as skip_by_failure'
    )
  } else {
    // Mark as failed, will retry
    await updateCuriosityQuiz(curiosityQuizId, {
      status: 'failed',
      error_message: error.message.slice(0, 500),
      retry_count: retryCount,
    })

    // Update sessions to errored (retryable)
    await updateSessionsByQuizId(quizId, { status: 'errored' })

    logger.warn(
      { curiosityQuizId, quizId, retryCount, maxRetries },
      'Curiosity quiz failed, marked for retry'
    )
  }
}

async function processCuriosityQuizCore(
  curiosityQuizId: number,
  quizId: number,
  articleId: number
): Promise<void> {
  logger.info({ curiosityQuizId, quizId }, 'Processing curiosity quiz')

  // Step 1: Load article content
  const article = await getArticleById(articleId)
  logger.info(
    { curiosityQuizId, articleId, articleStatus: article.status },
    'Loading article content'
  )

  // If article is being scraped, wait and retry
  let content: string | undefined
  let retries = 0
  const MAX_SCRAPING_RETRIES = 3
  const RETRY_DELAY_MS = 2000

  while (retries < MAX_SCRAPING_RETRIES) {
    try {
      const result = await ensureArticleContent(article)
      content = result.content
      break
    } catch (err) {
      const isScrapingError =
        err instanceof Error && err.message?.includes('currently being scraped')
      if (isScrapingError && retries < MAX_SCRAPING_RETRIES - 1) {
        retries++
        logger.info(
          { curiosityQuizId, articleId, retries },
          'Article being scraped, waiting before retry'
        )
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        // Re-fetch article to get updated status
        const updatedArticle = await getArticleById(articleId)
        Object.assign(article, updatedArticle)
      } else {
        throw err
      }
    }
  }

  if (!content) {
    throw new Error('Failed to load article content after retries')
  }

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
    throw new Error(`Curiosity quiz ${curiosityQuizId} not found`)
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
  await updateSessionsByQuizId(quizId, { status: 'ready' })

  logger.info({ curiosityQuizId, quizId }, 'Curiosity quiz completed')
}

export async function processCuriosityQuiz(curiosityQuizId: number): Promise<void> {
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
    } else {
      logger.info(
        { curiosityQuizId, actualStatus: quiz.status },
        'Could not claim curiosity quiz (not in pending/failed status)'
      )
    }
    return
  }

  const { quiz_id, article_id } = result.info

  try {
    await processCuriosityQuizCore(curiosityQuizId, quiz_id, article_id)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err, curiosityQuizId, quizId: quiz_id }, 'Curiosity quiz processing failed')
    await handleCuriosityQuizFailure(curiosityQuizId, quiz_id, err)
  }
}
