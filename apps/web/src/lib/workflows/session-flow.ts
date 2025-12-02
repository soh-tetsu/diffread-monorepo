import pLimit from 'p-limit'
import { concurrencyConfig } from '@/lib/config'
import { logger } from '@/lib/logger'
import { initSession } from '@/lib/workflows/session-init'

const sessionWorkerLimit = pLimit(concurrencyConfig.sessionWorkers)

export async function enqueueAndProcessSession(email: string, originalUrl: string) {
  const session = await sessionWorkerLimit(() => initSession(email, originalUrl))

  logger.info(
    {
      sessionToken: session.session_token,
      quizId: session.quiz_id,
    },
    'Session enqueued'
  )

  return session
}
