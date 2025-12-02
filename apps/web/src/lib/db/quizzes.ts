import { supabase } from '@/lib/supabase'
import type { QuizRow } from '@/types/db'

export async function getQuizById(id: number): Promise<QuizRow | null> {
  const { data, error } = await supabase.from('quizzes').select('*').eq('id', id).maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load quiz: ${error.message}`)
  }

  return (data as QuizRow) ?? null
}

export async function getQuizByArticleId(articleId: number): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('article_id', articleId)
    .is('user_id', null) // Shared quiz
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load quiz for article: ${error.message}`)
  }

  return (data as QuizRow) ?? null
}

export async function createQuiz(articleId: number): Promise<QuizRow> {
  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      article_id: articleId,
      user_id: null, // Shared quiz
      variant: null, // Default variant
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create quiz: ${error?.message}`)
  }

  return data as QuizRow
}

export async function getOrCreateQuiz(articleId: number): Promise<QuizRow> {
  const existing = await getQuizByArticleId(articleId)
  if (existing) {
    return existing
  }

  return createQuiz(articleId)
}
