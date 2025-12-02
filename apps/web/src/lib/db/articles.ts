import { supabase } from '@/lib/supabase'
import type { ArticleRow, ArticleStatus, ContentMedium } from '@/types/db'

export async function getArticleById(id: number): Promise<ArticleRow> {
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()

  if (error || !data) {
    throw new Error(`Unable to load article ${id}: ${error?.message}`)
  }

  return data as ArticleRow
}

export async function getArticleByNormalizedUrl(normalizedUrl: string): Promise<ArticleRow | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('normalized_url', normalizedUrl)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load article: ${error.message}`)
  }

  return (data as ArticleRow) ?? null
}

export async function createArticle(
  normalizedUrl: string,
  originalUrl: string
): Promise<ArticleRow> {
  const { data, error } = await supabase
    .from('articles')
    .insert({
      normalized_url: normalizedUrl,
      original_url: originalUrl,
      status: 'pending' as ArticleStatus,
      metadata: {},
      storage_metadata: {},
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create article: ${error?.message}`)
  }

  return data as ArticleRow
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
  const { error } = await supabase.from('articles').update({ status }).eq('id', articleId)

  if (error) {
    throw new Error(`Failed to update article status: ${error.message}`)
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
  const { error } = await supabase
    .from('articles')
    .update({
      ...payload,
      last_scraped_at: new Date().toISOString(),
    })
    .eq('id', articleId)

  if (error) {
    throw new Error(`Failed to update article content: ${error.message}`)
  }
}

export async function updateArticleMetadata(
  articleId: number,
  metadata: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('articles').update({ metadata }).eq('id', articleId)

  if (error) {
    throw new Error(`Failed to update article metadata: ${error.message}`)
  }
}

export function isArticleFresh(article: ArticleRow): boolean {
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

  if (!article.last_scraped_at || !article.storage_path) {
    return false
  }

  const lastScraped = new Date(article.last_scraped_at).getTime()
  return Date.now() - lastScraped <= MAX_AGE_MS
}
