/**
 * processArticle: Ensure article exists and has content
 *
 * Responsibility:
 * - Atomically create article if missing (by normalized URL)
 * - Early return if article is ready and fresh
 * - Delegate content loading/scraping to ensureArticleContent
 *
 * State Logic:
 * - Article doesn't exist → create new (via ensure_article_exists RPC)
 * - Article.status === 'ready' and fresh → return early
 * - All other states → delegate to ensureArticleContent for claiming and scraping
 *
 * Pattern:
 * - Call ensure_article_exists RPC (upsert, handles conflicts atomically)
 * - Check if ready and fresh, return if so
 * - Call ensureArticleContent which handles all claiming/scraping/state management
 */

import { getArticleById } from '@/lib/db/articles'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { WORKER_CONSTANTS } from '@/lib/workers/constants'
import { handleProcessError } from '@/lib/workers/error-handler'
import { isSuccessWithData, type ProcessResult, successResult } from '@/lib/workers/process-result'
import { callRpc } from '@/lib/workers/rpc-helpers'
import { ensureArticleContent } from '@/lib/workflows/article-content'
import type { ArticleRow, ArticleStatus, SessionRow } from '@/types/db'

type EnsureArticleExistsResult = {
  article_id: number
  normalized_url: string
  original_url: string
  status: ArticleStatus
  created_at: string
}

/**
 * Ensure article exists by normalized URL
 * Uses upsert pattern to handle concurrent creation attempts
 * Railway-oriented: Returns ProcessResult instead of throwing
 */
async function ensureArticleExists(
  normalizedUrl: string,
  originalUrl: string,
  sessionId: number
): Promise<ProcessResult<ArticleRow>> {
  // Step 1: Call RPC to create or fetch article
  const rpcResult = await callRpc<EnsureArticleExistsResult>(
    supabase.rpc('ensure_article_exists', {
      p_normalized_url: normalizedUrl,
      p_original_url: originalUrl,
    }),
    'ensure_article_exists',
    { resourceType: 'article', resourceId: sessionId }
  )

  // Early return on RPC failure
  if ('status' in rpcResult) return rpcResult as ProcessResult<ArticleRow>

  const row = rpcResult.data
  const articleId = row.article_id

  // Step 2: Fetch full article data from database to get storage details
  try {
    const fullArticle = await getArticleById(articleId)
    return successResult('article', fullArticle.id, fullArticle)
  } catch (error) {
    // Fallback: return partial data if full fetch fails
    logger.warn({ articleId, err: error }, 'Could not fetch full article data, using RPC response')

    const partialArticle: ArticleRow = {
      id: articleId,
      normalized_url: row.normalized_url,
      original_url: row.original_url,
      status: row.status,
      storage_path: null,
      content_hash: null,
      last_scraped_at: null,
      metadata: {},
      storage_metadata: {},
      content_medium: 'html',
      error_message: null,
      created_at: row.created_at,
      updated_at: new Date().toISOString(),
    }

    return successResult('article', articleId, partialArticle)
  }
}

export async function processArticle(session: SessionRow): Promise<ProcessResult<ArticleRow>> {
  const normalizedUrl = session.article_url // Assume already normalized
  const originalUrl = session.article_url

  logger.info(
    { sessionId: session.id, url: normalizedUrl },
    'Processing article creation and setup'
  )

  // Step 1: Ensure article exists (atomically create or return existing)
  const articleResult = await ensureArticleExists(normalizedUrl, originalUrl, session.id)
  if (!isSuccessWithData(articleResult)) return articleResult
  const article = articleResult.data

  logger.info({ sessionId: session.id, articleId: article.id }, 'Article ensured')

  // Step 2: Early return if article is ready and fresh
  if (article.status === 'ready' && isArticleFresh(article)) {
    logger.info(
      { sessionId: session.id, articleId: article.id },
      'Article already ready and fresh, skipping content loading'
    )
    return successResult('article', article.id, article)
  }

  // Step 3: Ensure article content (handles claiming, scraping, all state management)
  try {
    const prepared = await ensureArticleContent(article)
    logger.info({ articleId: article.id }, 'Article content ensured')
    return successResult('article', prepared.article.id, prepared.article)
  } catch (error) {
    return handleProcessError<ArticleRow>(error, {
      resourceType: 'article',
      resourceId: article.id,
      stepName: 'content loading',
    })
  }
}

function isArticleFresh(article: ArticleRow): boolean {
  if (!article.last_scraped_at || !article.storage_path) {
    return false
  }

  const lastScraped = new Date(article.last_scraped_at).getTime()
  return Date.now() - lastScraped <= WORKER_CONSTANTS.ARTICLE.MAX_AGE_MS
}
