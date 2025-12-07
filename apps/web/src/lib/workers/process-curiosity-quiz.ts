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
  claimNextCuriosityQuiz,
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

export async function processNextPendingCuriosityQuiz(): Promise<void> {
  // Step 1: Claim next pending curiosity quiz (atomic lock)
  const claimed = await claimNextCuriosityQuiz()
  if (!claimed) {
    logger.debug('No pending curiosity quizzes')
    return
  }

  const { curiosity_quiz_id, quiz_id, article_id } = claimed

  logger.info({ curiosityQuizId: curiosity_quiz_id, quizId: quiz_id }, 'Processing curiosity quiz')

  try {
    // Step 2: Load article content
    const article = await getArticleById(article_id)
    logger.info(
      { curiosityQuizId: curiosity_quiz_id, articleId: article_id, articleStatus: article.status },
      'Loading article content'
    )

    // If article is being scraped, wait and retry
    let content: string
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
            { curiosityQuizId: curiosity_quiz_id, articleId: article_id, retries },
            'Article being scraped, waiting before retry'
          )
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          // Re-fetch article to get updated status
          const updatedArticle = await getArticleById(article_id)
          Object.assign(article, updatedArticle)
        } else {
          throw err
        }
      }
    }

    logger.info(
      {
        curiosityQuizId: curiosity_quiz_id,
        articleId: article_id,
        contentLength: content?.length ?? 0,
      },
      'Article content loaded'
    )

    // Step 3: Check if pedagogy already extracted (idempotency)
    const curiosityQuiz = await getCuriosityQuizById(curiosity_quiz_id)
    if (!curiosityQuiz) {
      throw new Error(`Curiosity quiz ${curiosity_quiz_id} not found`)
    }

    let metadata: AnalysisResponse['metadata']

    if (curiosityQuiz.pedagogy) {
      // Reuse existing pedagogy
      logger.info({ curiosityQuizId: curiosity_quiz_id }, 'Reusing existing pedagogy')

      // Reconstruct metadata from article + pedagogy
      const articleData = await getArticleById(article_id)
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
      metadata = await extractPedagogy(curiosity_quiz_id, article_id, content)
    }

    // Step 4: Generate curiosity questions from pedagogy
    const questions = await generateCuriosityQuestions(curiosity_quiz_id, metadata)

    // Step 5: Store questions and mark ready
    await updateCuriosityQuiz(curiosity_quiz_id, {
      questions,
      status: 'ready',
      model_version: process.env.GEMINI_MODEL || 'unknown',
    })

    // Step 6: Update ALL sessions linked to this quiz
    await updateSessionsByQuizId(quiz_id, { status: 'ready' })

    logger.info({ curiosityQuizId: curiosity_quiz_id, quizId: quiz_id }, 'Curiosity quiz completed')
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error(
      { err, curiosityQuizId: curiosity_quiz_id, quizId: quiz_id },
      'Curiosity quiz processing failed'
    )
    await handleCuriosityQuizFailure(curiosity_quiz_id, quiz_id, err)
  }
}
