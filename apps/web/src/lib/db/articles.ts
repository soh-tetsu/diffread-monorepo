import { execute, queryMaybeSingle, querySingle } from '@/lib/db/supabase-helpers'
import { supabase } from '@/lib/supabase'
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
  const existing = await getArticleByNormalizedUrl(normalizedUrl)
  if (existing) {
    return existing
  }

  return createArticle(normalizedUrl, originalUrl)
}

export async function updateArticleStatus(articleId: number, status: ArticleStatus): Promise<void> {
  const result = await supabase.from('articles').update({ status }).eq('id', articleId)
  execute(result, { context: `update article ${articleId} status` })
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
