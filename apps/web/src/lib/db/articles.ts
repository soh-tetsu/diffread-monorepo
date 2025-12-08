import { execute, queryMaybeSingle, querySingle } from '@/lib/db/supabase-helpers'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { withRetry } from '@/lib/utils/retry'
import type { ArticleRow, ArticleStatus, ContentMedium } from '@/types/db'

export async function getArticleById(id: number): Promise<ArticleRow> {
  const result = await supabase.from('articles').select('*').eq('id', id).maybeSingle()
  return querySingle<ArticleRow>(result, { context: `load article ${id}` })
}

export async function getArticleByNormalizedUrl(normalizedUrl: string): Promise<ArticleRow | null> {
  const result = await supabase
    .from('articles')
    .select('*')
    .eq('normalized_url', normalizedUrl)
    .maybeSingle()
  return queryMaybeSingle<ArticleRow>(result, {
    context: `load article by normalized url ${normalizedUrl}`,
  })
}

export async function createArticle(
  normalizedUrl: string,
  originalUrl: string
): Promise<ArticleRow> {
  return querySingle<ArticleRow>(
    await supabase
      .from('articles')
      .insert({
        normalized_url: normalizedUrl,
        original_url: originalUrl,
        status: 'pending' as ArticleStatus,
        metadata: {},
        storage_metadata: {},
      })
      .select('*')
      .single(),
    { context: 'create article' }
  )
}

export async function getOrCreateArticle(
  normalizedUrl: string,
  originalUrl: string
): Promise<ArticleRow> {
  // Use upsert with onConflict to handle concurrent inserts
  // If another process inserts the same normalized_url, we'll get the existing one
  const result = await supabase
    .from('articles')
    .upsert(
      {
        normalized_url: normalizedUrl,
        original_url: originalUrl,
        status: 'pending' as ArticleStatus,
        metadata: {},
        storage_metadata: {},
      },
      {
        onConflict: 'normalized_url',
        ignoreDuplicates: false, // Return the existing row on conflict
      }
    )
    .select('*')
    .single()

  return querySingle<ArticleRow>(result, { context: 'get or create article' })
}

export async function updateArticleStatus(
  articleId: number,
  status: ArticleStatus,
  errorMessage?: string
): Promise<void> {
  await withRetry(
    async () => {
      const updates: { status: ArticleStatus; error_message?: string | null } = { status }

      if (errorMessage !== undefined) {
        updates.error_message = errorMessage ? errorMessage.slice(0, 500) : null
      }

      const result = await supabase.from('articles').update(updates).eq('id', articleId)
      execute(result, { context: `update article ${articleId} status` })
    },
    {
      maxAttempts: 3,
      delayMs: 1000,
      onRetry: (attempt, error) => {
        logger.warn({ articleId, attempt, err: error }, 'Failed to update article status, retrying')
      },
      onFailure: (attempts, error) => {
        logger.error(
          { articleId, attempts, err: error },
          'Failed to update article status after all retries'
        )
      },
    }
  )
}

/**
 * Atomically claim an article for scraping with database lock
 * Returns null if article is already being scraped or in terminal state
 */
export async function claimArticleForScraping(
  articleId: number
): Promise<{ claimed: boolean; article: ArticleRow } | null> {
  const result = await supabase.rpc('claim_article_for_scraping', { p_article_id: articleId })

  if (result.error) {
    throw new Error(`Failed to claim article ${articleId} for scraping: ${result.error.message}`)
  }

  if (!result.data || result.data.length === 0) {
    return null
  }

  const row = result.data[0]
  return {
    claimed: row.claimed,
    article: {
      id: row.article_id,
      normalized_url: row.normalized_url,
      original_url: row.original_url,
      // Note: We don't have full article data from RPC, caller should refetch if needed
    } as ArticleRow,
  }
}

export async function updateArticleContent(
  articleId: number,
  payload: {
    storage_path: string
    storage_metadata: Record<string, unknown>
    content_hash: string
    metadata: Record<string, unknown>
    content_medium: ContentMedium
  }
): Promise<void> {
  const result = await supabase
    .from('articles')
    .update({
      ...payload,
      last_scraped_at: new Date().toISOString(),
    })
    .eq('id', articleId)
  execute(result, { context: `update article ${articleId} content` })
}

export async function updateArticleMetadata(
  articleId: number,
  metadata: Record<string, unknown>
): Promise<void> {
  const result = await supabase.from('articles').update({ metadata }).eq('id', articleId)
  execute(result, { context: `update article ${articleId} metadata` })
}

export function isArticleFresh(article: ArticleRow): boolean {
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

  if (!article.last_scraped_at || !article.storage_path) {
    return false
  }

  const lastScraped = new Date(article.last_scraped_at).getTime()
  return Date.now() - lastScraped <= MAX_AGE_MS
}
