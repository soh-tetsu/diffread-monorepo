#!/usr/bin/env tsx

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { logger } from '@/lib/logger'

const envPath = resolve(process.cwd(), '.env.local')

if (existsSync(envPath)) {
  config({ path: envPath })
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

  const { processNextPendingCuriosityQuiz } = await import('@/lib/workers/process-curiosity-quiz')

  logger.info('Running curiosity quiz worker...')
  await processNextPendingCuriosityQuiz()
  logger.info('Worker completed')
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed')
  process.exit(1)
})
