export type QuizArticleInput = {
  normalizedUrl: string
  title?: string | null
  text: string
  html?: string | null
  metadata?: Record<string, unknown> | null
}

export type TaskTemplate = {
  id: string
  description: string
  questionType: 'explicit' | 'implicit' | 'confirmative'
}

export type GeneratedOption = {
  text: string
  rationale?: string
}

export type GeneratedQuestion = {
  id: number
  type: 'common_sense_test' | 'root_cause' | 'conceptual_flip'
  question: string
  options: GeneratedOption[]
  remediation: string
  source_location: {
    anchor_text: string
    estimated_paragraph: number
  }
  answer_index: number
}

export type HookQuestionOption = {
  text: string
  rationale?: string
}

export type HookQuestion = {
  id: number
  type: string
  question: string
  options: HookQuestionOption[]
  remediation: string
  answer_index: number
}

export type ArticleMetadata = {
  archetype: string
  domain?: {
    primary?: string
    secondary?: string
    specific_topic?: string
  }
  complexity?: {
    overall?: string
    lexical?: string
    syntactic?: string
  }
  core_thesis?: string
  key_concepts?: string[]
  language?: string
  estimated_reading_minutes?: number
}

export type ReadingPlanTask = {
  task_id: string
  task_instruction: string
  question_type: 'explicit' | 'implicit' | 'confirmative'
}

export type ReadingPlanPart = {
  part: number
  title: string
  tasks: ReadingPlanTask[]
}

export type ReadingPlanResponse = {
  rationale: string
  reading_plan: ReadingPlanPart[]
}

export type ExpandedInstruction = {
  instruction_id: string
  task_instruction: string
  question_type: 'explicit' | 'implicit' | 'confirmative'
  relevant_context: string
  source_location: {
    anchor_text: string
    estimated_paragraph: number
  }
  estimated_difficulty: 'easy' | 'medium' | 'hard'
}

export type ExpandedObjective = {
  objective_id: string
  objective_description: string
  instructions: ExpandedInstruction[]
}

export type CoverageReport = {
  total_paragraphs: number
  covered_paragraphs: number[]
  coverage_percent: number
}

export type PlanExpansionResult = {
  rationale: string
  expanded_plan: ExpandedObjective[]
  coverage_report: CoverageReport
}

export type InstructionQuestionOption = {
  option: string
  remediation: string
}

export type InstructionQuestion = {
  instruction_id: string
  source_location: {
    anchor_text: string
    estimated_paragraph: number
  }
  relevant_context: string
  type: string
  question: string
  options: InstructionQuestionOption[]
  answer_index: number
  rationale: string
}

export type QuestionEngineOptions = {
  apiKey?: string
  model?: string
}

export type HookWorkflowResult = {
  metadata: ArticleMetadata
  hookQuestions: HookQuestion[]
}

export type InstructionWorkflowResult = {
  metadata: ArticleMetadata
  taskPool: TaskTemplate[]
  readingPlan: ReadingPlanResponse
  planExpansion: PlanExpansionResult
  instructionQuestions: InstructionQuestion[]
}

export type QuestionWorkflowResult = HookWorkflowResult & InstructionWorkflowResult
