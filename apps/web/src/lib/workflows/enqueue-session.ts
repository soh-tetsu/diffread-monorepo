import pLimit from 'p-limit'
import { concurrencyConfig } from '@/lib/config'
import { logger } from '@/lib/logger'
import { processNextPendingCuriosityQuiz } from '@/lib/workers/process-curiosity-quiz'
import { initSession } from '@/lib/workflows/session-init'
import type { SessionRow } from '@/types/db'

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
export async function enqueueAndProcessSession(
  email: string,
  originalUrl: string,
  options: EnqueueSessionOptions = {}
): Promise<EnqueueSessionResult> {
  const { sync = false } = options

  // Step 1: Initialize session
  const session = await sessionWorkerLimit(() => initSession(email, originalUrl))

  logger.info(
    {
      sessionToken: session.session_token,
      quizId: session.quiz_id,
      status: session.status,
      sync,
    },
    'Session initialized'
  )

  // Step 2: Invoke worker if needed
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
  }
}
