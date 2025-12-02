import type { HookWorkflowResult } from '@diffread/question-engine'
import { upsertHookQuestions } from '@/lib/db/hooks'
import { setSessionStatusByQuiz } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { generateHookWorkflow } from '@/lib/quiz/question-engine'
import {
  ensureArticleAnalysis,
  ensureArticleContent,
  loadArticleForQuiz,
} from '@/lib/workflows/article-content'
import type { ArticleRow, QuizRow } from '@/types/db'

type HookBuildResult = HookWorkflowResult & {
  article: ArticleRow
}

export async function buildHookQuestionsForQuiz(
  quiz: QuizRow,
  providedArticle?: ArticleRow
): Promise<HookBuildResult> {
  const baseArticle = providedArticle ?? (await loadArticleForQuiz(quiz))

  await upsertHookQuestions({
    quizId: quiz.id,
    status: 'pending',
  })

  try {
    const { article, content } = await ensureArticleContent(baseArticle)
    if (article.content_medium === 'pdf') {
      throw new Error('PDF articles are not supported for hook question generation.')
    }
    const analysis = await ensureArticleAnalysis(article, content)

    const { workflow, model } = await generateHookWorkflow(
      analysis.article,
      content,
      analysis.metadata
    )

    await upsertHookQuestions({
      quizId: quiz.id,
      status: 'ready',
      hooks: workflow.hookQuestions,
      modelVersion: model,
    })
    await setSessionStatusByQuiz(quiz.id, 'ready')

    logger.info({ quizId: quiz.id, articleId: analysis.article.id }, 'Hook questions generated')

    return {
      article: analysis.article,
      metadata: analysis.metadata,
      hookQuestions: workflow.hookQuestions,
    }
  } catch (error) {
    await upsertHookQuestions({
      quizId: quiz.id,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })
    await setSessionStatusByQuiz(quiz.id, 'errored').catch((statusError) => {
      logger.error(
        { err: statusError, quizId: quiz.id },
        'Failed to update session status after hook failure'
      )
    })
    logger.error({ err: error, quizId: quiz.id }, 'Hook generation failed')
    throw error
  }
}
