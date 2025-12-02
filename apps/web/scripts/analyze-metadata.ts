#!/usr/bin/env bun

import path from 'node:path'
import process from 'node:process'
import {
  analyzeArticleMetadata,
  expandReadingPlan,
  generateHookQuestions,
  generateInstructionQuestions,
  generateReadingPlan,
  getTaskPoolData,
} from '@diffread/question-engine'
import dotenv from 'dotenv'
import { logger } from '@/lib/logger'
import { ScrapeError, scrapeArticle } from '@/lib/quiz/scraper'
import type { ArticleRow } from '@/types/db'

function requireUrl(): string {
  const [, , input] = process.argv
  if (!input) {
    throw new Error('Usage: bun run task:analyze-metadata <url>')
  }
  try {
    return new URL(input).toString()
  } catch {
    throw new Error(`Invalid URL provided: ${input}`)
  }
}

function buildAdHocArticle(url: string): ArticleRow {
  return {
    id: Date.now(),
    normalized_url: url,
    original_url: url,
    content_hash: null,
    storage_path: null,
    last_scraped_at: null,
    status: 'pending',
    metadata: null,
    storage_metadata: null,
    content_medium: 'unknown',
  }
}

const BASE_ENV_PATH = path.resolve(process.cwd(), '.env')
const LOCAL_ENV_PATH = path.resolve(process.cwd(), '.env.local')
const baseEnvResult = dotenv.config({ path: BASE_ENV_PATH })
const localEnvResult = dotenv.config({ path: LOCAL_ENV_PATH, override: true })

async function main() {
  logger.info(
    {
      cwd: process.cwd(),
      envFiles: {
        [BASE_ENV_PATH]: baseEnvResult.error ? 'missing' : 'loaded',
        [LOCAL_ENV_PATH]: localEnvResult.error ? 'missing' : 'loaded',
      },
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[set]' : '[missing]',
      GEMINI_MODEL: process.env.GEMINI_MODEL ?? '[default]',
    },
    'Env debug'
  )
  const url = requireUrl()

  const article = buildAdHocArticle(url)
  try {
    const scraped = await scrapeArticle(article)
    if (scraped.kind !== 'article') {
      throw new Error(
        'Scraper returned a non-article payload. Metadata analysis currently expects article text.'
      )
    }

    const metadata = await analyzeArticleMetadata(scraped.textContent)
    logger.info({ metadata }, 'Article metadata analyzed')

    const hookQuestions = await generateHookQuestions({
      metadata,
      articleText: scraped.textContent,
    })
    logger.info({ hookQuestions }, 'Generated hook questions')

    const taskPool = getTaskPoolData(metadata.archetype)
    if (!taskPool) {
      throw new Error(`No task pool available for archetype "${metadata.archetype}".`)
    }
    logger.info({ taskPool }, 'Retrieved task pool data')

    // Generate reading plan
    const readingPlan = await generateReadingPlan({
      metadata,
      taskPool,
    })
    logger.info({ readingPlan }, 'Generated reading plan')

    // Expand plan into concrete instructions
    const expansion = await expandReadingPlan({
      text: scraped.textContent,
      metadata,
      readingPlan: readingPlan.reading_plan,
      taskPool,
    })
    logger.info({ coverage_report: expansion.coverage_report }, 'Expanded reading plan')

    generateInstructionQuestions(expansion.expanded_plan, metadata.language)
      .then((instructionQuestions) => {
        logger.info({ instructionQuestions }, 'Generated instruction questions')
      })
      .catch((error) => {
        logger.error({ err: error }, 'Failed to generate instruction questions')
      })
  } catch (error) {
    if (error instanceof ScrapeError) {
      logger.error({ code: error.code, err: error }, '[scrape] scraper failure')
    } else {
      logger.error({ err: error }, '[pipeline] Metadata workflow failed')
    }
    process.exit(1)
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'Task failed')
  process.exit(1)
})
