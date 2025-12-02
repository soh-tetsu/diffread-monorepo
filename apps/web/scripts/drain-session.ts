#!/usr/bin/env tsx

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { logger } from '@/lib/logger'

const envPath = resolve(process.cwd(), '.env.local')
logger.info(process.cwd())

const [, , sessionToken] = process.argv

if (!sessionToken) {
  logger.error('Usage: npm run admin:drain-session <session_token>')
  process.exit(1)
}

if (existsSync(envPath)) {
  config({ path: envPath })
}

async function main() {
  const [{ getSessionByToken }, { enqueueAndProcessSession }] = await Promise.all([
    import('@/lib/db/sessions'),
    import('@/lib/workflows/session-flow'),
  ])
  const session = await getSessionByToken(sessionToken)
  if (!session) {
    throw new Error('Session not found.')
  }

  const result = await enqueueAndProcessSession(session.user_email, session.article_url)

  logger.info(
    {
      session: result.session_token,
      status: result.status,
      quizId: result.quiz_id,
    },
    'Session synchronized - workers will process quiz in background'
  )
}

main().catch((err) => {
  logger.error({ err }, 'admin:drain-session failed')
  process.exit(1)
})
