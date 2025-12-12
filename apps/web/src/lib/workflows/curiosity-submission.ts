import { getOrCreateArticle, updateArticleMetadata } from '@/lib/db/articles'
import { createCuriosityQuiz, getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { getOrCreateQuiz } from '@/lib/db/quizzes'
import { updateSession } from '@/lib/db/sessions'
import { fetchArticleTitle } from '@/lib/quiz/scraper'
import { normalizeUrl } from '@/lib/utils/normalize-url'
import { processSession } from '@/lib/workers/process-curiosity-quiz'
import type { SessionRow } from '@/types/db'
import { logger } from '../logger'

/**
 * Setup quiz chain for a session (article → quiz → curiosity_quiz)
 * Links quiz to session after creation
 * Fetches article title immediately for better UX
 */
async function setupQuizChain(session: SessionRow): Promise<number> {
  if (session.quiz_id) {
    logger.info({ sessionId: session.id, quizId: session.quiz_id }, 'Session already has quiz')
    return session.quiz_id
  }

  const normalizedUrl = normalizeUrl(session.article_url)

  // Create/fetch article
  const article = await getOrCreateArticle(normalizedUrl, session.article_url)

  // Fetch article title immediately if not already present
  // This is lightweight and makes bookmarks show titles instead of URLs
  if (!article.metadata?.title) {
    const title = await fetchArticleTitle(normalizedUrl)
    if (title) {
      await updateArticleMetadata(article.id, { title })
      logger.info({ articleId: article.id, title }, 'Fetched article title')
    }
  }

  // Create/fetch quiz container
  const quiz = await getOrCreateQuiz(article.id)

  // Create/fetch curiosity quiz
  let curiosityQuiz = await getCuriosityQuizByQuizId(quiz.id)
  if (!curiosityQuiz) {
    curiosityQuiz = await createCuriosityQuiz(quiz.id)
    logger.info({ quizId: quiz.id, curiosityQuizId: curiosityQuiz.id }, 'Created curiosity quiz')
  }

  // Link session to quiz
  await updateSession(session.id, { quiz_id: quiz.id })

  return quiz.id
}

/**
 * Background worker: Setup quiz chain and process curiosity quiz
 * Handles article scraping + question generation
 */
export async function processCuriositySubmission(session: SessionRow): Promise<void> {
  try {
    const quizId = await setupQuizChain(session)

    const curiosityQuiz = await getCuriosityQuizByQuizId(quizId)
    if (!curiosityQuiz) {
      logger.error({ sessionId: session.id, quizId }, 'Curiosity quiz missing after setup')
      return
    }

    await processSession(curiosityQuiz.id)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err, sessionId: session.id }, 'Background worker failed')
  }
}
