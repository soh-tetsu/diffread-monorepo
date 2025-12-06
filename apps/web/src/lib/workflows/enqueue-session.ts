import pLimit from 'p-limit'
import { concurrencyConfig } from '@/lib/config'
import { getArticleById } from '@/lib/db/articles'
import { getCuriosityQuizByQuizId } from '@/lib/db/curiosity-quizzes'
import { countQueueItems } from '@/lib/db/queue'
import { getQuizById } from '@/lib/db/quizzes'
import { updateSessionByToken } from '@/lib/db/sessions'
import { ensureGuestUser, ensureUserByEmail, synthesizeGuestEmail } from '@/lib/db/users'
import { logger } from '@/lib/logger'
import { processNextPendingCuriosityQuiz } from '@/lib/workers/process-curiosity-quiz'
import { ensureArticleContent } from '@/lib/workflows/article-content'
import { initSession } from '@/lib/workflows/session-init'
import type { SessionRow, UserRow } from '@/types/db'

const sessionWorkerLimit = pLimit(concurrencyConfig.sessionWorkers)
const pendingWorkerLimit = pLimit(concurrencyConfig.pendingWorkers)

export type EnqueueSessionOptions = {
  /**
   * If true, worker runs synchronously (waits for completion)
   * If false, worker runs asynchronously (fire-and-forget)
   * Default: false (async)
   */
  sync?: boolean
}

export type EnqueueSessionResult = {
  session: SessionRow
  /**
   * True if worker was invoked (session was pending/errored)
   * False if session was already ready or in terminal state
   */
  workerInvoked: boolean
  /**
   * True if session was bookmarked because queue is full
   * False if session was processed or already exists
   */
  queueFull: boolean
}

/**
 * Enqueue and optionally process a session for curiosity quiz generation.
 *
 * This function is the single entry point for both:
 * - API routes (async worker, immediate return)
 * - Admin CLI (sync worker, wait for completion)
 *
 * Flow:
 * 1. Initialize session (get/create session → article → quiz → curiosity_quiz)
 * 2. If session needs processing (pending/errored), invoke worker
 * 3. Return session immediately (async) or after processing (sync)
 */
type SessionIdentity = {
  userId?: string
  email?: string
}

async function resolveSessionUser(identity: SessionIdentity): Promise<UserRow> {
  if (identity.userId) {
    const { user } = await ensureGuestUser({ userId: identity.userId })
    return user.email
      ? user
      : {
          ...user,
          email: synthesizeGuestEmail(user.id),
        }
  }

  if (identity.email) {
    return ensureUserByEmail(identity.email)
  }

  throw new Error('enqueueAndProcessSession requires a userId or email')
}

export async function enqueueAndProcessSession(
  identity: SessionIdentity,
  originalUrl: string,
  options: EnqueueSessionOptions = {}
): Promise<EnqueueSessionResult> {
  const { sync = false } = options
  const user = await resolveSessionUser(identity)

  // Step 1: Initialize session
  let session = await sessionWorkerLimit(() =>
    initSession({
      userId: user.id,
      email: user.email ?? synthesizeGuestEmail(user.id),
      originalUrl,
    })
  )

  logger.info(
    {
      sessionToken: session.session_token,
      quizId: session.quiz_id,
      status: session.status,
      sync,
    },
    'Session initialized'
  )

  // Step 1.5: Always trigger article scraping to get title (even if queue is full)
  // This is lightweight compared to quiz generation and improves UX
  if (session.quiz_id) {
    try {
      const quiz = await getQuizById(session.quiz_id)
      if (quiz) {
        const article = await getArticleById(quiz.article_id)

        // Trigger article scraping if needed (fire and forget for async mode)
        if (article.status === 'pending' || article.status === 'stale') {
          logger.info(
            { articleId: article.id, sessionToken: session.session_token },
            'Triggering article scraping for title'
          )
          sessionWorkerLimit(() =>
            ensureArticleContent(article).catch((err) => {
              logger.error({ err, articleId: article.id }, 'Article scraping failed')
            })
          )
        }
      }
    } catch (err) {
      logger.error(
        { err, sessionToken: session.session_token },
        'Failed to trigger article scraping'
      )
    }
  }

  // Step 2: Check if session is bookmarked and needs queue slot check
  if (session.status === 'bookmarked') {
    // Check if user has free queue slots
    const queueCount = await countQueueItems(user.id)
    const MAX_QUEUE_SIZE = 2

    if (queueCount >= MAX_QUEUE_SIZE) {
      // Queue is full - keep as bookmarked
      logger.info(
        { sessionToken: session.session_token, queueCount, userId: user.id },
        'Queue full - session remains bookmarked'
      )
      return {
        session,
        workerInvoked: false,
        queueFull: true,
      }
    }

    // Queue has space - check if quiz is already ready
    if (session.quiz_id) {
      const curiosityQuiz = await getCuriosityQuizByQuizId(session.quiz_id)
      if (curiosityQuiz?.status === 'ready') {
        // Quiz already exists and is ready - move directly to ready
        logger.info(
          { sessionToken: session.session_token, queueCount, userId: user.id },
          'Queue has space - quiz already ready, moving session to ready'
        )
        session = await updateSessionByToken(session.session_token, { status: 'ready' })
      } else {
        // Quiz not ready - move to pending for processing
        logger.info(
          { sessionToken: session.session_token, queueCount, userId: user.id },
          'Queue has space - moving session to pending'
        )
        session = await updateSessionByToken(session.session_token, { status: 'pending' })
      }
    } else {
      // No quiz linked yet - move to pending
      logger.info(
        { sessionToken: session.session_token, queueCount, userId: user.id },
        'Queue has space - moving session to pending'
      )
      session = await updateSessionByToken(session.session_token, { status: 'pending' })
    }
  }

  // Step 3: Invoke worker if needed
  const shouldProcess = session.status === 'pending' || session.status === 'errored'

  if (shouldProcess) {
    if (sync) {
      // Synchronous: Wait for worker to complete
      logger.info({ sessionToken: session.session_token }, 'Processing curiosity quiz (sync)...')
      await pendingWorkerLimit(() => processNextPendingCuriosityQuiz())
      logger.info({ sessionToken: session.session_token }, 'Curiosity quiz processing completed')
    } else {
      // Asynchronous: Fire and forget
      logger.info({ sessionToken: session.session_token }, 'Worker invoked (async)')
      pendingWorkerLimit(() =>
        processNextPendingCuriosityQuiz().catch((err) => {
          logger.error({ err, sessionToken: session.session_token }, 'Worker failed')
        })
      )
    }
  } else {
    logger.info(
      { sessionToken: session.session_token, status: session.status },
      'Worker not invoked (session not pending/errored)'
    )
  }

  return {
    session,
    workerInvoked: shouldProcess,
    queueFull: false,
  }
}
