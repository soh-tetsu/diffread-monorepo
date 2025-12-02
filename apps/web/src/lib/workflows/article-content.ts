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
  let currentArticle = article
  let scrapingInProgress = false

  try {
    // Check status first (source of truth)
    if (currentArticle.status === 'ready') {
      // Check freshness
      if (!isArticleFresh(currentArticle)) {
        // Content is stale, update status
        await updateArticleStatus(currentArticle.id, 'stale')
        currentArticle = { ...currentArticle, status: 'stale' }
      } else {
        // Content is fresh, use cached version
        const storagePath = currentArticle.storage_path
        if (!storagePath) {
          throw new Error(`Article ${currentArticle.id} marked ready without stored content`)
        }

        const content = await downloadArticleContent(storagePath, currentArticle.storage_metadata)

        if (content === null) {
          throw new Error(`Stored article content missing for article ${currentArticle.id}`)
        }

        return { article: currentArticle, content }
      }
    }

    if (currentArticle.status === 'stale') {
      // Try to re-scrape
      scrapingInProgress = true
      await updateArticleStatus(currentArticle.id, 'scraping')

      try {
        const scraped = await scrapeArticle(currentArticle)

        // Re-scraping succeeded
        if (scraped.kind === 'article') {
          const content = scraped.textContent
          const upload = await uploadArticleBundle(currentArticle.id, scraped.normalizedUrl, {
            html: scraped.htmlContent,
            text: scraped.textContent,
          })
          const mergedMetadata = mergeMetadata(currentArticle.metadata, scraped.metadata)

          await updateArticleContent(currentArticle.id, {
            storage_path: upload.path,
            storage_metadata: upload.metadata,
            content_hash: upload.contentHash,
            metadata: mergedMetadata,
            content_medium: 'html',
          })
          await updateArticleStatus(currentArticle.id, 'ready')

          currentArticle = {
            ...currentArticle,
            storage_path: upload.path,
            storage_metadata: upload.metadata,
            content_hash: upload.contentHash,
            metadata: mergedMetadata,
            content_medium: 'html',
            status: 'ready',
          }

          scrapingInProgress = false
          return { article: currentArticle, content }
        } else {
          // PDF case
          const upload = await uploadArticlePdf(scraped.pdfBuffer, scraped.normalizedUrl)
          const content = [
            'PDF content stored for later processing.',
            `Bucket: ${upload.metadata.bucket}`,
            `Path: ${upload.path}`,
            `Fingerprint: ${upload.metadata.url_fingerprint}`,
          ].join('\n')
          const mergedMetadata = mergeMetadata(currentArticle.metadata, scraped.metadata)

          await updateArticleContent(currentArticle.id, {
            storage_path: upload.path,
            storage_metadata: upload.metadata,
            content_hash: upload.contentHash,
            metadata: mergedMetadata,
            content_medium: 'pdf',
          })
          await updateArticleStatus(currentArticle.id, 'ready')

          currentArticle = {
            ...currentArticle,
            storage_path: upload.path,
            storage_metadata: upload.metadata,
            content_hash: upload.contentHash,
            metadata: mergedMetadata,
            content_medium: 'pdf',
            status: 'ready',
          }

          scrapingInProgress = false
          return { article: currentArticle, content }
        }
      } catch (error) {
        // Re-scraping failed, fall back to old content (graceful degradation)
        scrapingInProgress = false
        logger.warn(
          { articleId: currentArticle.id, err: error },
          'Re-scraping stale article failed, using old content'
        )

        if (currentArticle.storage_path) {
          const content = await downloadArticleContent(
            currentArticle.storage_path,
            currentArticle.storage_metadata
          )

          if (content === null) {
            throw new Error(`Stored article content missing for article ${currentArticle.id}`)
          }
          // Keep status as 'stale'
          return { article: currentArticle, content }
        } else {
          // No old content to fall back to
          throw error
        }
      }
    }

    if (currentArticle.status === 'pending' || currentArticle.status === 'failed') {
      scrapingInProgress = true
      await updateArticleStatus(currentArticle.id, 'scraping')
      const scraped = await scrapeArticle(currentArticle)

      if (scraped.kind === 'article') {
        const content = scraped.textContent
        const upload = await uploadArticleBundle(currentArticle.id, scraped.normalizedUrl, {
          html: scraped.htmlContent,
          text: scraped.textContent,
        })
        const mergedMetadata = mergeMetadata(currentArticle.metadata, scraped.metadata)

        await updateArticleContent(currentArticle.id, {
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'html',
        })
        await updateArticleStatus(currentArticle.id, 'ready')

        currentArticle = {
          ...currentArticle,
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'html',
          status: 'ready',
        }

        scrapingInProgress = false
        return { article: currentArticle, content }
      } else {
        // PDF case
        const upload = await uploadArticlePdf(scraped.pdfBuffer, scraped.normalizedUrl)
        const content = [
          'PDF content stored for later processing.',
          `Bucket: ${upload.metadata.bucket}`,
          `Path: ${upload.path}`,
          `Fingerprint: ${upload.metadata.url_fingerprint}`,
        ].join('\n')
        const mergedMetadata = mergeMetadata(currentArticle.metadata, scraped.metadata)

        await updateArticleContent(currentArticle.id, {
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'pdf',
        })
        await updateArticleStatus(currentArticle.id, 'ready')

        currentArticle = {
          ...currentArticle,
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'pdf',
          status: 'ready',
        }

        scrapingInProgress = false
        return { article: currentArticle, content }
      }
    }

    // Handle skip statuses
    if (currentArticle.status === 'skip_by_admin' || currentArticle.status === 'skip_by_failure') {
      throw new Error(`Article is skipped (${currentArticle.status}), cannot scrape`)
    }

    // Handle scraping status (race condition or timeout)
    if (currentArticle.status === 'scraping') {
      throw new Error('Article is currently being scraped by another process')
    }

    // Should not reach here
    throw new Error(`Unexpected article status: ${currentArticle.status}`)
  } catch (error) {
    if (scrapingInProgress) {
      try {
        await updateArticleStatus(currentArticle.id, 'skip_by_failure')
      } catch (statusError) {
        logger.error(
          { err: statusError, articleId: currentArticle.id },
          'Failed to update article status during scraping failure'
        )
      }
    }
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
