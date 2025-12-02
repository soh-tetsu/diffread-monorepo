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

async function main() {
  // TODO: Implement new worker system with curiosity and scaffold quiz workers
  logger.warn(
    'drain-pending script needs implementation. Workers should be invoked via API routes or background job system.'
  )
}

main().catch((err) => {
  logger.error({ err }, 'admin:drain-pending failed')
  process.exit(1)
})
