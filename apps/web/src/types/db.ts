export type QuizStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'
  | 'not_required'
export type SessionStatus =
  | 'pending'
  | 'ready'
  | 'completed'
  | 'errored'
  | 'skip_by_admin'
  | 'skip_by_failure'
export type ArticleStatus =
  | 'pending'
  | 'scraping'
  | 'ready'
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'
export type HookStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'
export type ContentMedium = 'markdown' | 'pdf' | 'html' | 'unknown'
export type QuestionType = 'mcq' | 'true_false'

export type MCQOption = {
  id: string
  label: string
}

type LegacyMCQContent = {
  type: 'mcq'
  prompt: string
  options: MCQOption[]
  answer: string
  explanation?: string
}

type LegacyTrueFalse = {
  type: 'true_false'
  prompt: string
  answer: boolean
  explanation?: string
}

type StructuredContent = {
  id?: number
  type: 'common_sense_test' | 'root_cause' | 'conceptual_flip'
  question: string
  options: Array<{ text?: string; label?: string; rationale?: string }>
  remediation?: string
  source_location?: {
    anchor_text: string
    estimated_paragraph?: number
  }
  answer_index: number
}

type InstructionQuestionContent = {
  instruction_id: string
  type: string
  question: string
  options: Array<{ option: string; remediation: string }>
  answer_index: number
  rationale: string
  relevant_context?: string
  source_location?: {
    anchor_text: string
    estimated_paragraph?: number
  }
}

export type QuestionContent =
  | LegacyMCQContent
  | LegacyTrueFalse
  | StructuredContent
  | InstructionQuestionContent

export interface ArticleRow {
  id: number
  normalized_url: string
  original_url: string
  content_hash: string | null
  storage_path: string | null
  last_scraped_at: string | null
  status: ArticleStatus
  metadata: Record<string, unknown> | null
  storage_metadata: Record<string, unknown> | null
  content_medium: ContentMedium
  title?: string | null
}

export interface QuizRow {
  id: number
  quiz_id: string
  article_id: number
  status: QuizStatus
  model_used: string | null
  created_at: string
}

export interface QuestionRow {
  id: number
  quiz_id: number
  question_type: QuestionType
  content: QuestionContent
  sort_order: number
}

export interface SessionRow {
  id: number
  session_token: string
  user_email: string
  article_url: string
  quiz_id: number | null
  status: SessionStatus
  metadata: Record<string, unknown> | null
}

export interface HookQuestionRow {
  id: number
  quiz_id: number
  status: HookStatus
  hooks: unknown | null
  strategy_prompt: string | null
  model_version: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}
