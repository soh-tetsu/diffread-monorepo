import { type ArticleMetadata, analyzeArticleMetadata } from '@diffread/question-engine'
import {
  claimArticleForScraping,
  getArticleById,
  isArticleFresh,
  updateArticleContent,
  updateArticleMetadata,
  updateArticleStatus,
} from '@/lib/db/articles'
import {
  ArticleInvalidStateError,
  ArticleRetryableError,
  ArticleStorageError,
  ArticleTerminalError,
} from '@/lib/errors/article-errors'
import { logger } from '@/lib/logger'
import { GEMINI_ANALYSIS_MODEL, requireGeminiApiKey } from '@/lib/quiz/gemini'
import type { ScrapedArticle } from '@/lib/quiz/scraper'
import { scrapeArticle } from '@/lib/quiz/scraper'
import { downloadArticleContent, uploadArticleBundle, uploadArticlePdf } from '@/lib/storage'
import { withRetry, withRetryResult } from '@/lib/utils/retry'
import type { ArticleRow, QuizRow } from '@/types/db'

function extractString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function extractNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function mergeMetadata(
  existing: Record<string, unknown> | null,
  scraped: {
    title?: string | null
    byline?: string | null
    length?: number | null
    siteName?: string | null
    lang?: string | null
    excerpt?: string | null
  }
): Record<string, unknown> {
  const base = existing ?? {}
  return {
    ...base,
    title: scraped.title ?? extractString(base.title) ?? null,
    byline: scraped.byline ?? extractString(base.byline) ?? null,
    excerpt: scraped.excerpt ?? extractString(base.excerpt) ?? null,
    length: scraped.length ?? extractNumber(base.length) ?? null,
    siteName: scraped.siteName ?? extractString(base.siteName) ?? null,
    lang: scraped.lang ?? extractString(base.lang) ?? null,
  }
}

type PreparedArticle = {
  article: ArticleRow
  content: string
}

type ArticleProcessingState =
  | 'fresh'
  | 'stale'
  | 'needs_scrape'
  | 'skip'
  | 'scraping'
  | 'unexpected'

/*
 * Determine the processing state of an article based on its status and freshness.
 * No side effects.
 */
function describeArticleState(article: ArticleRow): ArticleProcessingState {
  if (article.status === 'ready') {
    return isArticleFresh(article) ? 'fresh' : 'stale'
  }
  if (article.status === 'stale') {
    return 'stale'
  }
  if (article.status === 'pending' || article.status === 'failed') {
    return 'needs_scrape'
  }
  if (article.status === 'skip_by_admin' || article.status === 'skip_by_failure') {
    return 'skip'
  }
  if (article.status === 'scraping') {
    return 'scraping'
  }
  return 'unexpected'
}

async function loadStoredArticleContent(article: ArticleRow): Promise<string> {
  const storagePath = article.storage_path
  if (!storagePath) {
    throw new ArticleStorageError(`Article has no stored content path`, article.id)
  }

  try {
    return await withRetry(
      async () => {
        const content = await downloadArticleContent(storagePath, article.storage_metadata)
        if (content === null) {
          throw new Error(`Stored article content missing`)
        }
        return content
      },
      {
        maxAttempts: 2,
        delayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(
            { articleId: article.id, attempt, err: error },
            'Failed to load stored content, will retry'
          )
        },
        onFailure: (attempts, error) => {
          logger.error(
            { articleId: article.id, attempts, err: error },
            'Failed to load stored content after all retries'
          )
        },
      }
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    throw new ArticleStorageError(
      err.message || 'Failed to load stored article content',
      article.id
    )
  }
}

async function persistScrapeResult(
  article: ArticleRow,
  scraped: ScrapedArticle
): Promise<PreparedArticle> {
  if (scraped.kind === 'article') {
    const upload = await uploadArticleBundle(article.id, scraped.normalizedUrl, {
      html: scraped.htmlContent,
      text: scraped.textContent,
    })
    const mergedMetadata = mergeMetadata(article.metadata, scraped.metadata)

    await updateArticleContent(article.id, {
      storage_path: upload.path,
      storage_metadata: upload.metadata,
      content_hash: upload.contentHash,
      metadata: mergedMetadata,
      content_medium: 'html',
    })
    await updateArticleStatus(article.id, 'ready')

    const nextArticle: ArticleRow = {
      ...article,
      storage_path: upload.path,
      storage_metadata: upload.metadata,
      content_hash: upload.contentHash,
      metadata: mergedMetadata,
      content_medium: 'html',
      status: 'ready',
    }

    return { article: nextArticle, content: scraped.textContent }
  }

  const upload = await uploadArticlePdf(scraped.pdfBuffer, scraped.normalizedUrl)
  const mergedMetadata = mergeMetadata(article.metadata, scraped.metadata)
  const content = [
    'PDF content stored for later processing.',
    `Bucket: ${upload.metadata.bucket}`,
    `Path: ${upload.path}`,
    `Fingerprint: ${upload.metadata.url_fingerprint}`,
  ].join('\n')

  await updateArticleContent(article.id, {
    storage_path: upload.path,
    storage_metadata: upload.metadata,
    content_hash: upload.contentHash,
    metadata: mergedMetadata,
    content_medium: 'pdf',
  })
  await updateArticleStatus(article.id, 'ready')

  const nextArticle: ArticleRow = {
    ...article,
    storage_path: upload.path,
    storage_metadata: upload.metadata,
    content_hash: upload.contentHash,
    metadata: mergedMetadata,
    content_medium: 'pdf',
    status: 'ready',
  }

  return { article: nextArticle, content }
}

type ScrapeOptions = {
  allowFallback: boolean
}

async function scrapeAndPersistArticle(
  article: ArticleRow,
  options: ScrapeOptions
): Promise<PreparedArticle> {
  // Atomically claim article for scraping with database lock
  const claimed = await claimArticleForScraping(article.id)

  if (!claimed || !claimed.claimed) {
    // Article is already being scraped by another process or in terminal state
    throw new Error('Article is currently being scraped by another process')
  }

  // RPC has already set status to 'scraping', proceed with scraping
  // Try to scrape and persist
  const result = await withRetryResult(
    async () => {
      const scraped = await scrapeArticle(article)
      return await persistScrapeResult(article, scraped)
    },
    {
      maxAttempts: 1,
      delayMs: 1000,
      onRetry: (attempt, error) => {
        logger.warn({ articleId: article.id, attempt, err: error }, 'Scraping failed, will retry')
      },
    }
  )

  // If scraping succeeded, return the result
  if (result.ok) {
    return result.value
  }

  // Scraping failed - check if we can fall back to stored content
  if (options.allowFallback && article.storage_path) {
    logger.warn(
      { articleId: article.id, err: result.error },
      'Scrape failed; falling back to stored article content'
    )
    try {
      await updateArticleStatus(article.id, 'stale')
    } catch (statusError) {
      logger.warn({ articleId: article.id, err: statusError }, 'Failed to restore stale status')
    }
    const content = await loadStoredArticleContent(article)
    return { article: { ...article, status: 'stale' }, content }
  }

  // No fallback available - mark as terminal failure and throw
  logger.error({ articleId: article.id, err: result.error }, 'Scraping failed after all retries')
  try {
    await updateArticleStatus(
      article.id,
      'skip_by_failure',
      result.error.message || 'Article scraping failed after all retries'
    )
  } catch (statusError) {
    logger.error({ err: statusError, articleId: article.id }, 'Failed to mark skip_by_failure')
  }
  throw result.error
}

function extractAnalysisMetadata(metadata: Record<string, unknown> | null): ArticleMetadata | null {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }
  const analysis = metadata.analysis
  if (!analysis || typeof analysis !== 'object') {
    return null
  }
  const archetype = (analysis as Record<string, unknown>).archetype
  if (typeof archetype !== 'string' || !archetype.trim()) {
    return null
  }
  return analysis as ArticleMetadata
}

export async function loadArticleForQuiz(quiz: QuizRow): Promise<ArticleRow> {
  return getArticleById(quiz.article_id)
}

/**
 * Internal function that handles article content loading logic
 */
async function ensureArticleContentCore(article: ArticleRow): Promise<PreparedArticle> {
  let workingArticle = article

  const state = describeArticleState(workingArticle)

  switch (state) {
    case 'fresh': {
      const content = await loadStoredArticleContent(workingArticle)
      return { article: workingArticle, content }
    }
    case 'stale':
      // Mark article as stale in database if it's currently marked as ready
      if (workingArticle.status === 'ready') {
        await updateArticleStatus(workingArticle.id, 'stale')
        workingArticle = { ...workingArticle, status: 'stale' }
      }
      return scrapeAndPersistArticle(workingArticle, { allowFallback: true })
    case 'needs_scrape':
      return scrapeAndPersistArticle(workingArticle, { allowFallback: false })
    case 'skip':
      throw new ArticleTerminalError(
        `Article is in terminal state: ${workingArticle.status}`,
        workingArticle.id,
        workingArticle.status
      )
    case 'scraping':
      // Another process is already scraping - this is a race condition
      throw new Error('Article is currently being scraped by another process')
    default:
      throw new ArticleInvalidStateError(
        `Unexpected article status: ${workingArticle.status}`,
        workingArticle.id,
        workingArticle.status
      )
  }
}

/**
 * Ensure article content is available for quiz generation
 *
 * Public interface for loading article content with proper error handling.
 * Article status is managed internally.
 */
export async function ensureArticleContent(article: ArticleRow): Promise<PreparedArticle> {
  try {
    return await ensureArticleContentCore(article)
  } catch (error) {
    // Check if this is a storage load failure
    if (error instanceof ArticleStorageError) {
      // Storage error is transient (Supabase outage, network issue, etc.)
      // Wrap as retryable error for session-level retry
      logger.warn(
        { articleId: error.articleId, err: error },
        'Storage load failed, marking as retryable error'
      )
      throw new ArticleRetryableError(
        `Failed to load stored content: ${error.message}`,
        error.articleId,
        error
      )
    }

    // Article status already updated by internal functions (scraping, etc)
    // Re-throw for caller to handle
    throw error
  }
}

export async function ensureArticleAnalysis(
  article: ArticleRow,
  content: string,
  opts?: { force?: boolean }
): Promise<{ article: ArticleRow; metadata: ArticleMetadata }> {
  if (!opts?.force) {
    const cached = extractAnalysisMetadata(article.metadata)
    if (cached) {
      return { article, metadata: cached }
    }
  }

  if (!content.trim()) {
    throw new Error('Cannot analyze metadata for empty article content.')
  }

  const apiKey = requireGeminiApiKey()
  const metadata = await analyzeArticleMetadata(content, {
    apiKey,
    model: GEMINI_ANALYSIS_MODEL,
  })

  const mergedMetadata = {
    ...article.metadata,
    analysis: metadata,
  }

  await updateArticleMetadata(article.id, mergedMetadata)

  return {
    article: { ...article, metadata: mergedMetadata },
    metadata,
  }
}
