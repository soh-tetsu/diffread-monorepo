#!/usr/bin/env tsx

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { logger } from '@/lib/logger'

const envPath = resolve(process.cwd(), '.env.local')
logger.info(process.cwd())

if (existsSync(envPath)) {
  config({ path: envPath })
}

const [, , email, originalUrl] = process.argv

if (!email || !originalUrl) {
  logger.error('Usage: bun run admin:hook-v2 <user_email> <article_url>')
  process.exit(1)
}

async function main() {
  const { enqueueAndProcessSessionV2 } = await import('@/lib/workflows/session-flow-v2')

  const result = await enqueueAndProcessSessionV2(email, originalUrl)

  logger.info(
    {
      session: {
        token: result.session.session_token,
        status: result.session.status,
      },
      quizId: result.quiz.id,
      enqueued: result.enqueued,
    },
    'V2 Session processed'
  )
}

main().catch((err) => {
  logger.error({ err }, 'admin:hook-v2 failed')
  process.exit(1)
})
