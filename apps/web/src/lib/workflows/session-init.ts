import { getOrCreateArticle } from '@/lib/db/articles'
import { createCuriosityQuiz, getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { getOrCreateQuiz } from '@/lib/db/quizzes'
import { getOrCreateSession, updateSession } from '@/lib/db/sessions'
import { normalizeUrl } from '@/lib/utils/normalize-url'
import type { SessionRow } from '@/types/db'
import { logger } from '../logger'

type InitSessionParams = {
  userId: string
  email?: string
  originalUrl: string
}

export async function initSession({
  userId,
  email,
  originalUrl,
}: InitSessionParams): Promise<SessionRow> {
  const normalizedUrl = normalizeUrl(originalUrl)

  // Step 1: Get/create session (quiz_id can be NULL)
  let session = await getOrCreateSession({ userId, articleUrl: originalUrl, email })

  // Step 2: Early return if ready
  if (session.status === 'ready') {
    return session
  }

  // Step 2: Always ensure complete chain exists: article → quiz → curiosity quiz
  // Cannot early return until we confirm curiosity quiz exists

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
  if (existingCuriosityQuiz) {
    // Curiosity quiz exists - link session (if not linked) and sync status
    const sessionStatus = mapCuriosityQuizStatusToSessionStatus(existingCuriosityQuiz.status)

    session = await updateSession(session.id, { quiz_id: quiz.id, status: sessionStatus })
  } else {
    // New quiz - create curiosity quiz and link session (worker will update status)
    await createCuriosityQuiz(quiz.id)
    session = await updateSession(session.id, { quiz_id: quiz.id })
  }

  return session
}

/**
 * Maps curiosity quiz status to session status
 * - failed -> errored
 * - processing -> pending
 * - others stay the same
 */
function mapCuriosityQuizStatusToSessionStatus(
  curiosityQuizStatus:
    | 'pending'
    | 'ready'
    | 'failed'
    | 'skip_by_admin'
    | 'skip_by_failure'
    | 'processing'
): 'ready' | 'errored' | 'pending' | 'skip_by_failure' | 'skip_by_admin' {
  if (curiosityQuizStatus === 'failed') {
    return 'errored'
  } else if (curiosityQuizStatus === 'processing') {
    return 'pending'
  } else {
    return curiosityQuizStatus
  }
}
