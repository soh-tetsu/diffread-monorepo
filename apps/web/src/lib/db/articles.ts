import { supabase } from '@/lib/supabase'
import type { ArticleRow, ArticleStatus, ContentMedium, QuestionRow, QuizRow } from '@/types/db'

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export type ArticleWithQuiz = {
  article: ArticleRow
  quiz: (QuizRow & { questions: QuestionRow[] }) | null
}

export async function getArticleById(id: number): Promise<ArticleRow> {
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()

  if (error || !data) {
    throw new Error(`Unable to load article ${id}: ${error?.message}`)
  }

  return data as ArticleRow
}

export function isArticleFresh(article: ArticleRow): boolean {
  if (!article.last_scraped_at || !article.storage_path) {
    return false
  }
  const lastScraped = new Date(article.last_scraped_at).getTime()
  return Date.now() - lastScraped <= MAX_AGE_MS
}

export async function findFreshArticle(normalizedUrl: string): Promise<ArticleWithQuiz | null> {
  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('normalized_url', normalizedUrl)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load article: ${error.message}`)
  }

  if (!article || !article.last_scraped_at || !article.storage_path) {
    return null
  }

  const lastScraped = new Date(article.last_scraped_at).getTime()
  const isFresh = Date.now() - lastScraped <= MAX_AGE_MS

  if (!isFresh) {
    return null
  }

  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .select('*, questions(*)')
    .eq('article_id', article.id)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (quizError && quizError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch quizzes: ${quizError.message}`)
  }

  const formattedQuiz = quiz?.questions
    ? ({ ...quiz, questions: quiz.questions } as QuizRow & {
        questions: QuestionRow[]
      })
    : null

  return {
    article: article as ArticleRow,
    quiz: formattedQuiz,
  }
}

export async function updateArticleStatus(articleId: number, status: ArticleStatus) {
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
) {
  const updatePayload = {
    storage_path: payload.storage_path,
    storage_metadata: payload.storage_metadata,
    content_hash: payload.content_hash,
    metadata: payload.metadata,
    content_medium: payload.content_medium,
    last_scraped_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('articles').update(updatePayload).eq('id', articleId)

  if (error) {
    throw new Error(`Failed to update article content: ${error.message}`)
  }
}

export async function saveArticleMetadata(articleId: number, metadata: Record<string, unknown>) {
  const { error } = await supabase.from('articles').update({ metadata }).eq('id', articleId)

  if (error) {
    throw new Error(`Failed to update article metadata: ${error.message}`)
  }
}
