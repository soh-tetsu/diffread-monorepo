import { type ArticleMetadata, analyzeArticleMetadata } from '@diffread/question-engine'
import {
  getArticleById,
  isArticleFresh,
  updateArticleContent,
  updateArticleMetadata,
  updateArticleStatus,
} from '@/lib/db/articles'
import { logger } from '@/lib/logger'
import { GEMINI_ANALYSIS_MODEL, requireGeminiApiKey } from '@/lib/quiz/gemini'
import type { ScrapedArticle } from '@/lib/quiz/scraper'
import { scrapeArticle } from '@/lib/quiz/scraper'
import { downloadArticleContent, uploadArticleBundle, uploadArticlePdf } from '@/lib/storage'
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
    throw new Error(`Article ${article.id} has no stored content`)
  }

  const content = await downloadArticleContent(storagePath, article.storage_metadata)
  if (content === null) {
    throw new Error(`Stored article content missing for article ${article.id}`)
  }
  return content
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
  await updateArticleStatus(article.id, 'scraping')

  try {
    const scraped = await scrapeArticle(article)
    return await persistScrapeResult(article, scraped)
  } catch (error) {
    if (options.allowFallback && article.storage_path) {
      logger.warn(
        { articleId: article.id, err: error },
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

    try {
      await updateArticleStatus(article.id, 'skip_by_failure')
    } catch (statusError) {
      logger.error({ err: statusError, articleId: article.id }, 'Failed to mark skip_by_failure')
    }
    throw error
  }
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

export async function ensureArticleContent(article: ArticleRow): Promise<PreparedArticle> {
  let workingArticle = article

  if (workingArticle.status === 'ready' && !isArticleFresh(workingArticle)) {
    await updateArticleStatus(workingArticle.id, 'stale')
    workingArticle = { ...workingArticle, status: 'stale' }
  }

  const state = describeArticleState(workingArticle)

  switch (state) {
    case 'fresh': {
      const content = await loadStoredArticleContent(workingArticle)
      return { article: workingArticle, content }
    }
    case 'stale':
      return scrapeAndPersistArticle(workingArticle, { allowFallback: true })
    case 'needs_scrape':
      return scrapeAndPersistArticle(workingArticle, { allowFallback: false })
    case 'skip':
      throw new Error(`Article is skipped (${workingArticle.status}), cannot scrape`)
    case 'scraping':
      // Another process is already scraping - return article as-is without throwing
      // The caller has .catch() handler and doesn't need the content immediately
      return { article: workingArticle, content: '' }
    default:
      throw new Error(`Unexpected article status: ${workingArticle.status}`)
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
