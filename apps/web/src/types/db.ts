// New schema types
export type ArticleStatus =
  | 'pending'
  | 'scraping'
  | 'ready'
  | 'stale'
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'

export type SessionStatus = 'pending' | 'ready' | 'errored' | 'skip_by_admin' | 'skip_by_failure'

export type CuriosityQuizStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'

export type ScaffoldQuizStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'

export type ContentMedium = 'markdown' | 'pdf' | 'html' | 'unknown'

// Article
export interface ArticleRow {
  id: number
  normalized_url: string
  original_url: string

  status: ArticleStatus
  storage_path: string | null
  content_hash: string | null
  last_scraped_at: string | null

  metadata: Record<string, unknown>
  storage_metadata: Record<string, unknown>
  content_medium: ContentMedium

  created_at: string
  updated_at: string
}

// Quiz (container)
export interface QuizRow {
  id: number
  article_id: number

  user_id: number | null
  variant: string | null

  created_at: string
  updated_at: string
}

// Curiosity Quiz
export interface CuriosityQuizRow {
  id: number
  quiz_id: number
  status: CuriosityQuizStatus

  questions: unknown | null // JSONB array of curiosity questions
  pedagogy: unknown | null // JSONB metadata

  model_version: string | null
  error_message: string | null
  retry_count: number

  created_at: string
  updated_at: string
}

// Scaffold Quiz
export interface ScaffoldQuizRow {
  id: number
  quiz_id: number
  status: ScaffoldQuizStatus

  questions: unknown | null // JSONB array of instruction questions
  reading_plan: unknown | null // JSONB metadata

  model_version: string | null
  error_message: string | null
  retry_count: number

  created_at: string
  updated_at: string
}

// Session
export interface SessionRow {
  id: number
  session_token: string
  user_email: string
  article_url: string

  quiz_id: number | null
  status: SessionStatus
  metadata: Record<string, unknown>

  created_at: string
  updated_at: string
}

// RPC function return types
export interface ClaimedCuriosityQuiz {
  curiosity_quiz_id: number
  quiz_id: number
  article_id: number
}

export interface ClaimedScaffoldQuiz {
  scaffold_quiz_id: number
  quiz_id: number
  article_id: number
}
