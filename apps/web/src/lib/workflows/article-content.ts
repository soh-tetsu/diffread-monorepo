import { type ArticleMetadata, analyzeArticleMetadata } from '@diffread/question-engine'
import {
  getArticleById,
  isArticleFresh,
  saveArticleMetadata,
  updateArticleContent,
  updateArticleStatus,
} from '@/lib/db/articles'
import { logger } from '@/lib/logger'
import { GEMINI_ANALYSIS_MODEL, requireGeminiApiKey } from '@/lib/quiz/gemini'
import { scrapeArticle } from '@/lib/quiz/scraper'
import {
  downloadArticleContent,
  hasStoredContent,
  uploadArticleBundle,
  uploadArticlePdf,
} from '@/lib/storage'
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

async function prepareFromStoredContent(article: ArticleRow): Promise<string | null> {
  if (!isArticleFresh(article) || !hasStoredContent(article)) {
    return null
  }
  try {
    return await downloadArticleContent(article.storage_path!, article.storage_metadata)
  } catch (error) {
    logger.warn(
      { articleId: article.id, err: error },
      'Failed to load stored article content; falling back to scraping'
    )
    return null
  }
}

export async function loadArticleForQuiz(quiz: QuizRow): Promise<ArticleRow> {
  return getArticleById(quiz.article_id)
}

export async function ensureArticleContent(article: ArticleRow): Promise<PreparedArticle> {
  let currentArticle = article
  let content: string | null = await prepareFromStoredContent(currentArticle)
  let scrapingInProgress = false

  try {
    if (!content) {
      scrapingInProgress = true
      await updateArticleStatus(currentArticle.id, 'scraping')
      const scraped = await scrapeArticle(currentArticle)

      if (scraped.kind === 'article') {
        content = scraped.textContent
        const upload = await uploadArticleBundle(currentArticle.id, scraped.normalizedUrl, {
          html: scraped.htmlContent,
          text: scraped.textContent,
        })
        const mergedMetadata = mergeMetadata(
          currentArticle.metadata as Record<string, unknown> | null,
          scraped.metadata
        )
        await updateArticleContent(currentArticle.id, {
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'html',
        })
        currentArticle = {
          ...currentArticle,
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'html',
        }
      } else {
        const upload = await uploadArticlePdf(scraped.pdfBuffer, scraped.normalizedUrl)
        content = [
          'PDF content stored for later processing.',
          `Bucket: ${upload.metadata.bucket}`,
          `Path: ${upload.path}`,
          `Fingerprint: ${upload.metadata.url_fingerprint}`,
        ].join('\n')
        const mergedMetadata = mergeMetadata(
          currentArticle.metadata as Record<string, unknown> | null,
          scraped.metadata
        )
        await updateArticleContent(currentArticle.id, {
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'pdf',
        })
        currentArticle = {
          ...currentArticle,
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: 'pdf',
        }
      }
      await updateArticleStatus(currentArticle.id, 'ready')
      scrapingInProgress = false
    }

    if (!content || !content.trim()) {
      throw new Error('Article text is empty; cannot continue.')
    }

    return {
      article: currentArticle,
      content,
    }
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
    const cached = extractAnalysisMetadata(article.metadata as Record<string, unknown> | null)
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
    ...(article.metadata ?? {}),
    analysis: metadata,
  }

  await saveArticleMetadata(article.id, mergedMetadata)

  return {
    article: { ...article, metadata: mergedMetadata },
    metadata,
  }
}
