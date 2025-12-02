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
  logger.error('Usage: bun run admin:hook <user_email> <article_url>')
  process.exit(1)
}

async function main() {
  logger.info(
    {
      cwd: process.cwd(),
      envFiles: {
        [envPath]: existsSync(envPath) ? 'loaded' : 'missing',
      },
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[set]' : '[missing]',
      GEMINI_MODEL: process.env.GEMINI_MODEL ?? '[default]',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '[set]' : '[missing]',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '[set]' : '[missing]',
    },
    'Environment check'
  )
  const { enqueueAndProcessSession } = await import('@/lib/workflows/enqueue-session')

  const result = await enqueueAndProcessSession(email, originalUrl, {
    sync: true, // Wait for completion
  })

  logger.info(
    {
      session: {
        token: result.session.session_token,
        status: result.session.status,
        quizId: result.session.quiz_id,
      },
      workerInvoked: result.workerInvoked,
    },
    'Session processed'
  )
}

main().catch((err) => {
  logger.error({ err }, 'admin:new-session failed')
  process.exit(1)
})
