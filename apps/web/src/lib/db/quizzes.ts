import { queryMaybeSingle, querySingle } from '@/lib/db/supabase-helpers'
import { supabase } from '@/lib/supabase'
import type { QuizRow } from '@/types/db'

export async function getQuizById(id: number): Promise<QuizRow | null> {
  const result = await supabase.from('quizzes').select('*').eq('id', id).maybeSingle()
  return queryMaybeSingle<QuizRow>(result, { context: `load quiz ${id}` })
}

export async function getQuizByArticleId(articleId: number): Promise<QuizRow | null> {
  const result = await supabase
    .from('quizzes')
    .select('*')
    .eq('article_id', articleId)
    .is('user_id', null)
    .maybeSingle()
  return queryMaybeSingle<QuizRow>(result, { context: `load quiz for article ${articleId}` })
}

export async function createQuiz(articleId: number): Promise<QuizRow> {
  const result = await supabase
    .from('quizzes')
    .insert({
      article_id: articleId,
      user_id: null,
      variant: null,
    })
    .select('*')
    .single()
  return querySingle<QuizRow>(result, { context: 'create quiz' })
}

export async function getOrCreateQuiz(articleId: number): Promise<QuizRow> {
  const existing = await getQuizByArticleId(articleId)
  if (existing) {
    return existing
  }

  return createQuiz(articleId)
}
