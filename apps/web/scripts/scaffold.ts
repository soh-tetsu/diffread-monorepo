#!/usr/bin/env tsx

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { logger } from '@/lib/logger'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  config({ path: envPath })
}

const [, , email, articleUrl] = process.argv

if (!email || !articleUrl) {
  logger.error('Usage: bun run admin:instruction <user_email> <article_url>')
  process.exit(1)
}

async function main() {
  const { enqueueAndProcessSession } = await import('@/lib/workflows/session-flow')

  const result = await enqueueAndProcessSession(email, articleUrl)

  logger.info(
    {
      session: {
        token: result.session_token,
        status: result.status,
      },
      quizId: result.quiz_id,
    },
    'Session created - workers will process quiz in background'
  )
}

main().catch((err) => {
  logger.error({ err }, 'admin:instruction failed')
  process.exit(1)
})
