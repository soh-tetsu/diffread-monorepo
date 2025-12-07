import { getOrCreateArticle } from '@/lib/db/articles'
import { createCuriosityQuiz, getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { getOrCreateQuiz } from '@/lib/db/quizzes'
import { getOrCreateSession, updateSession } from '@/lib/db/sessions'
import { normalizeUrl } from '@/lib/utils/normalize-url'
import type { ArticleRow, SessionRow } from '@/types/db'
import { logger } from '../logger'

type InitSessionParams = {
  userId: string
  email?: string
  originalUrl: string
}

type InitSessionResult = {
  session: SessionRow
  article: ArticleRow
}

/**
 * Initialize complete session chain (DB records only, no workers)
 *
 * Creates/fetches the full database chain:
 * - Session (bookmarked status by default)
 * - Article (normalized URL)
 * - Quiz (container)
 * - Curiosity Quiz (pending status)
 *
 * This does NOT trigger any workers or scraping - it only sets up database records.
 * Call triggerQuizWorker() separately to start processing.
 */
export async function initializeSessionChain({
  userId,
  email,
  originalUrl,
}: InitSessionParams): Promise<InitSessionResult> {
  const normalizedUrl = normalizeUrl(originalUrl)

  // Step 1: Get/create session (quiz_id can be NULL)
  let session = await getOrCreateSession({ userId, articleUrl: originalUrl, email })

  // Step 2: Always ensure complete chain exists: article → quiz → curiosity quiz
  // Even if session exists, we need to ensure quiz chain is complete and respect queue logic

  // 2a. Create/get article
  const article = await getOrCreateArticle(normalizedUrl, originalUrl)

  // 2b. Create/get quiz (container)
  const quiz = await getOrCreateQuiz(article.id)

  // 2c. Get or create curiosity quiz (shared across sessions)
  const existingCuriosityQuiz = await getCuriosityQuizByQuizId(quiz.id)

  logger.info(
    {
      sessionId: session.id,
      quizId: quiz.id,
      curiosityQuizId: existingCuriosityQuiz ? existingCuriosityQuiz.id : 'new',
    },
    'fetch existing curiosity quiz'
  )
  // Ensure curiosity quiz exists
  if (!existingCuriosityQuiz) {
    // New quiz - create it
    const newCuriosityQuiz = await createCuriosityQuiz(quiz.id)
    logger.info(
      { sessionId: session.id, quizId: quiz.id, curiosityQuizId: newCuriosityQuiz.id },
      'Created new curiosity quiz'
    )
  }

  // Link quiz to session if not already linked
  // Never propagate status - session status is user-driven (via queue logic and worker updates)
  if (!session.quiz_id || session.quiz_id !== quiz.id) {
    session = await updateSession(session.id, { quiz_id: quiz.id })
  }

  return { session, article }
}
