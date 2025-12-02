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
import { getArticleById } from '@/lib/db/articles'
import { setSessionStatusByQuiz } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { ensureArticleContent } from '@/lib/workflows/article-content'
import type { ArticleRow, HookStatus, QuizRow, QuizStatus } from '@/types/db'

type ClaimHookJobResult = {
  quiz_id: number
  article_id: number
  quiz_status: QuizStatus
  hook_id: number
}

async function loadQuizById(quizId: number): Promise<QuizRow | null> {
  const { data, error } = await supabase.from('quizzes').select('*').eq('id', quizId).maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load quiz ${quizId}: ${error.message}`)
  }

  return (data as QuizRow) ?? null
}

async function claimNextHookQuiz(): Promise<QuizRow | null> {
  const { data, error } = await supabase.rpc('claim_next_hook_job').maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to claim hook job: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const result = data as ClaimHookJobResult
  return {
    id: result.quiz_id,
    article_id: result.article_id,
    status: result.quiz_status,
  } as QuizRow
}

async function persistPedagogy(
  quizId: number,
  articleId: number,
  response: AnalysisResponse,
  modelUsed: string
): Promise<void> {
  // First, get existing article metadata to merge with new metadata
  const { data: articleData } = await supabase
    .from('articles')
    .select('metadata')
    .eq('id', articleId)
    .single()

  const existingMetadata = articleData?.metadata || {}

  // Merge new metadata with existing (new metadata takes precedence)
  const mergedMetadata = {
    ...existingMetadata,
    archetype: response.metadata.archetype,
    logical_schema: response.metadata.logical_schema,
    structural_skeleton: response.metadata.structural_skeleton,
    domain: response.metadata.domain,
    core_thesis: response.metadata.core_thesis,
    language: response.metadata.language,
  }

  // Update articles table with full metadata
  const { error: articleError } = await supabase
    .from('articles')
    .update({ metadata: mergedMetadata })
    .eq('id', articleId)

  if (articleError) {
    throw new Error(`Failed to persist article metadata: ${articleError.message}`)
  }

  // Update hook_questions with pedagogy + language for easy access
  const { error: hookError } = await supabase
    .from('hook_questions')
    .update({
      pedagogy: {
        hooks: response.metadata.pedagogy.hooks,
        language: response.metadata.language,
      },
      status: 'ready_pedagogy' as HookStatus,
      model_version: modelUsed,
    })
    .eq('quiz_id', quizId)

  if (hookError) {
    throw new Error(`Failed to persist pedagogy: ${hookError.message}`)
  }

  logger.info({ quizId, articleId }, 'Pedagogy and metadata persisted successfully')
}

async function persistHookQuestions(
  quizId: number,
  quizCards: HookGeneratorV2Response['quiz_cards'],
  modelUsed: string
): Promise<void> {
  const { error } = await supabase
    .from('hook_questions')
    .update({
      hooks: quizCards,
      status: 'ready' as HookStatus,
      model_version: modelUsed,
    })
    .eq('quiz_id', quizId)

  if (error) {
    throw new Error(`Failed to persist hook questions: ${error.message}`)
  }

  logger.info({ quizId, questionCount: quizCards.length }, 'Hook questions persisted successfully')
}

async function markHookFailed(quizId: number, reason: string): Promise<void> {
  await supabase
    .from('hook_questions')
    .update({
      status: 'failed' as HookStatus,
      error_message: reason.slice(0, 500),
    })
    .eq('quiz_id', quizId)

  await supabase
    .from('quizzes')
    .update({ status: 'failed', model_used: reason.slice(0, 120) })
    .eq('id', quizId)

  await setSessionStatusByQuiz(quizId, 'errored')
  logger.error({ quizId, reason }, 'V2 Hook workflow failed')
}

async function handleV2HookGenerationJob(
  quizId: number,
  analysisResponse: AnalysisResponse
): Promise<void> {
  try {
    logger.info({ quizId }, 'Running V2 hook generation prompt')

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

    const context: HookGeneratorPromptContext = {
      metadata: analysisResponse.metadata,
    }

    const hookResponse: HookGeneratorV2Response = await executor.execute(
      hookGeneratorPromptV2,
      context,
      HookGeneratorV2ResponseSchema
    )

    logger.info(
      {
        quizId,
        quizCardCount: hookResponse.quiz_cards.length,
      },
      'V2 hook generation completed'
    )

    await persistHookQuestions(
      quizId,
      hookResponse.quiz_cards,
      process.env.GEMINI_MODEL || 'unknown-model'
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await markHookFailed(quizId, reason)
    throw error
  }
}

async function handleV2HookJob(quiz: QuizRow): Promise<AnalysisResponse> {
  try {
    const articleRecord = await getArticleById(quiz.article_id)
    const prepared = await ensureArticleContent(articleRecord)

    logger.info({ quizId: quiz.id }, 'Running V2 analysis prompt')

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
      { text: prepared.content },
      AnalysisResponseSchema
    )

    logger.info(
      {
        quizId: quiz.id,
        archetype: analysisResponse.metadata.archetype.label,
        hookCount: analysisResponse.metadata.pedagogy.hooks.length,
      },
      'V2 analysis completed'
    )

    await persistPedagogy(
      quiz.id,
      quiz.article_id,
      analysisResponse,
      process.env.GEMINI_MODEL || 'unknown-model'
    )

    return analysisResponse
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await markHookFailed(quiz.id, reason)
    throw error
  }
}

export async function processNextPendingHookV2(): Promise<void> {
  const hookQuiz = await claimNextHookQuiz()
  if (!hookQuiz) {
    logger.debug('No pending V2 hook workflows')
    return
  }

  logger.info({ quizId: hookQuiz.id }, 'Processing V2 hook workflow')

  // Check if pedagogy already exists (idempotency for Step 5)
  const { data: hookRecord } = await supabase
    .from('hook_questions')
    .select('pedagogy')
    .eq('quiz_id', hookQuiz.id)
    .single()

  let analysisResponse: AnalysisResponse

  if (hookRecord?.pedagogy) {
    // Step 5 already completed, skip re-analysis
    logger.info({ quizId: hookQuiz.id }, 'Pedagogy already exists, skipping analysis')

    // Load article metadata
    const { data: articleData } = await supabase
      .from('articles')
      .select('metadata')
      .eq('id', hookQuiz.article_id)
      .single()

    // Reconstruct full metadata from article.metadata + hook_questions.pedagogy
    analysisResponse = {
      rationale: '', // Not needed for hook generation
      metadata: {
        archetype: articleData?.metadata?.archetype,
        logical_schema: articleData?.metadata?.logical_schema,
        structural_skeleton: articleData?.metadata?.structural_skeleton,
        domain: articleData?.metadata?.domain,
        core_thesis: articleData?.metadata?.core_thesis,
        language: hookRecord.pedagogy.language || 'en',
      } as any,
    }
  } else {
    // Step 5: Extract pedagogy from article
    analysisResponse = await handleV2HookJob(hookQuiz)
  }

  // Step 6: Generate hook questions from pedagogy
  logger.info({ quizId: hookQuiz.id }, 'Pedagogy ready, generating hook questions')
  await handleV2HookGenerationJob(hookQuiz.id, analysisResponse)

  await setSessionStatusByQuiz(hookQuiz.id, 'ready')
  logger.info({ quizId: hookQuiz.id }, 'V2 hook workflow completed')
}

export type ProcessResult = {
  quiz: QuizRow
  article: ArticleRow
  status: 'ready'
} | null

export async function processQuizByIdV2(quizId: number): Promise<ProcessResult> {
  const quiz = await loadQuizById(quizId)
  if (!quiz) {
    return null
  }

  const articleRecord = await getArticleById(quiz.article_id)
  const analysisResponse = await handleV2HookJob(quiz)
  await handleV2HookGenerationJob(quizId, analysisResponse)
  await setSessionStatusByQuiz(quizId, 'ready')

  return {
    quiz: { ...quiz, status: 'ready' },
    article: articleRecord,
    status: 'ready',
  }
}
