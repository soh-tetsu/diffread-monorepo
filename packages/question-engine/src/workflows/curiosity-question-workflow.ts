import { z } from 'zod'
import type { LLMStep } from '../prompts/pipeline'
import { analysisPromptV2 } from '../prompts/v2'

/**
 * Inferred types from schemas (defined first for use in schema annotations)
 */
export type Archetype = {
  label: 'CONCEPTUAL' | 'ARGUMENTATIVE' | 'EMPIRICAL' | 'PROCEDURAL' | 'NARRATIVE'
}

export type LogicalSchema = {
  label:
    | 'SEQUENTIAL_PROCESS'
    | 'DIAGNOSTIC_FLOW'
    | 'PROBLEM_SOLUTION'
    | 'COMPARATIVE_ANALYSIS'
    | 'THESIS_PROOF'
    | 'HYPOTHESIS_EVIDENCE'
    | 'INVERTED_PYRAMID'
    | 'CHRONOLOGICAL'
    | 'TOPICAL_GROUPING'
    | 'INTERVIEW_Q_A'
}

export type StructuralSkeleton = {
  outline: string[]
}

export type Domain = {
  primary: string
  secondary: string
  specific_topic: string
}

export type CoreThesis = {
  content: string
}

export type SourceLocation = {
  section_index: number
  anchor_text: string
}

export type HookContext = {
  focal_point: 'CAUSALITY' | 'OUTCOME' | 'METHOD' | 'ENTITY'
  dynamic_type: 'DISRUPTION' | 'VINDICATION' | 'SALIENCE' | 'VOID'
  reader_prediction: string
  text_reality: string
  relevant_context: string
  source_location: SourceLocation
  cognitive_impact_score: number
}

export type Pedagogy = {
  hooks: HookContext[]
}

export type Metadata = {
  archetype: Archetype
  logical_schema: LogicalSchema
  structural_skeleton: StructuralSkeleton
  domain: Domain
  core_thesis: CoreThesis
  pedagogy: Pedagogy
  language: string
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

export type AnalysisResponse = {
  rationale: string
  metadata: Metadata
}

export type HookGenerationResponse = {
  rationale: string
  hooks: HookQuestion[]
}

/**
 * V2 Hook Generator Output Types
 */
export type QuizOption = {
  id: string
  text: string
  is_correct: boolean
  feedback: string
}

export type Remediation = {
  // headline: string
  key_quote: string
  body: string
  go_read_anchor: string
}

export type QuizCard = {
  format: 'SCENARIO' | 'CONFIRMATIVE' | 'MCQ'
  strategy_used: string
  question: string
  options: QuizOption[]
  remediation: Remediation
}

export type HookGeneratorV2Response = {
  rationale: string
  quiz_cards: QuizCard[]
}

/**
 * Zod schemas for validation (single source of truth)
 */
export const ArchetypeSchema: z.ZodType<Archetype> = z.object({
  label: z.enum(['CONCEPTUAL', 'ARGUMENTATIVE', 'EMPIRICAL', 'PROCEDURAL', 'NARRATIVE']),
})

export const LogicalSchemaSchema: z.ZodType<LogicalSchema> = z.object({
  label: z.enum([
    'SEQUENTIAL_PROCESS',
    'DIAGNOSTIC_FLOW',
    'PROBLEM_SOLUTION',
    'COMPARATIVE_ANALYSIS',
    'THESIS_PROOF',
    'HYPOTHESIS_EVIDENCE',
    'INVERTED_PYRAMID',
    'CHRONOLOGICAL',
    'TOPICAL_GROUPING',
    'INTERVIEW_Q_A',
  ]),
})

export const StructuralSkeletonSchema: z.ZodType<StructuralSkeleton> = z.object({
  outline: z.array(z.string()),
})

export const DomainSchema: z.ZodType<Domain> = z.object({
  primary: z.string(),
  secondary: z.string(),
  specific_topic: z.string(),
})

export const CoreThesisSchema: z.ZodType<CoreThesis> = z.object({
  content: z.string(),
})

export const SourceLocationSchema: z.ZodType<SourceLocation> = z.object({
  section_index: z.number().int().nonnegative(),
  anchor_text: z.string(),
})

export const HookContextSchema: z.ZodType<HookContext> = z.object({
  focal_point: z.enum(['CAUSALITY', 'OUTCOME', 'METHOD', 'ENTITY']),
  dynamic_type: z.enum(['DISRUPTION', 'VINDICATION', 'SALIENCE', 'VOID']),
  reader_prediction: z.string(),
  text_reality: z.string(),
  relevant_context: z.string(),
  source_location: SourceLocationSchema,
  cognitive_impact_score: z.number(),
})

export const PedagogySchema: z.ZodType<Pedagogy> = z.object({
  hooks: z.array(HookContextSchema),
})

export const MetadataSchema: z.ZodType<Metadata> = z.object({
  archetype: ArchetypeSchema,
  logical_schema: LogicalSchemaSchema,
  structural_skeleton: StructuralSkeletonSchema,
  domain: DomainSchema,
  core_thesis: CoreThesisSchema,
  pedagogy: PedagogySchema,
  language: z.string(),
})

export const HookQuestionOptionSchema: z.ZodType<HookQuestionOption> = z.object({
  text: z.string(),
  rationale: z.string().optional(),
})

export const HookQuestionSchema: z.ZodType<HookQuestion> = z.object({
  id: z.number().int().nonnegative(),
  type: z.string(),
  question: z.string(),
  options: z.array(HookQuestionOptionSchema),
  remediation: z.string(),
  answer_index: z.number().int(),
})

export const AnalysisResponseSchema: z.ZodType<AnalysisResponse> = z.object({
  rationale: z.string(),
  metadata: MetadataSchema,
})

export const HookGenerationResponseSchema: z.ZodType<HookGenerationResponse> = z.object({
  rationale: z.string(),
  hooks: z.array(HookQuestionSchema),
})

export const QuizOptionSchema: z.ZodType<QuizOption> = z.object({
  id: z.string(),
  text: z.string(),
  is_correct: z.boolean(),
  feedback: z.string(),
})

export const RemediationSchema: z.ZodType<Remediation> = z.object({
  key_quote: z.string(),
  body: z.string(),
  go_read_anchor: z.string(),
})

export const QuizCardSchema: z.ZodType<QuizCard> = z.object({
  format: z.enum(['SCENARIO', 'CONFIRMATIVE', 'MCQ']),
  strategy_used: z.string(),
  question: z.string(),
  options: z.array(QuizOptionSchema),
  remediation: RemediationSchema,
})

export const HookGeneratorV2ResponseSchema: z.ZodType<HookGeneratorV2Response> = z.object({
  rationale: z.string(),
  quiz_cards: z.array(QuizCardSchema),
})

/**
 * Workflow input type
 */
export type CuriosityQuestionWorkflowInput = {
  articleText: string
}

/**
 * Context after analysis step
 */
type AnalysisStepOutput = CuriosityQuestionWorkflowInput & {
  analysisRationale: string
  metadata: Metadata
}

/**
 * Final workflow output
 */
export type CuriosityQuestionWorkflowOutput = AnalysisStepOutput & {
  hookGenerationRationale: string
  hookQuestions: HookQuestion[]
}

/**
 * Step 1: Analysis LLM Step
 * - Executes analysis prompt
 * - Parses metadata (including pedagogy hooks nested inside)
 */
const _analysisLLMStep: LLMStep<CuriosityQuestionWorkflowInput, AnalysisStepOutput> = {
  name: 'analysis-llm-v2',
  type: 'llm',

  async execute(input: CuriosityQuestionWorkflowInput, deps) {
    const response: AnalysisResponse = await deps.executor.execute<AnalysisResponse>(
      analysisPromptV2,
      { text: input.articleText },
      AnalysisResponseSchema
    )

    const { rationale, metadata } = response

    return {
      ...input,
      analysisRationale: rationale,
      metadata,
    }
  },
}

/**
 * Step 2: Hook Generation LLM Step
 * - Executes hook generator prompt using pedagogy hooks from metadata
 * - Parses hook questions
 */
// const hookGenerationLLMStep: LLMStep<AnalysisStepOutput, CuriosityQuestionWorkflowOutput> = {
// name: "hook-generation-llm-v2",
// type: "llm",

// async execute(input, deps) {
//   const response = await deps.executor.execute<HookGenerationResponse>(
//     hookGeneratorPromptV2,
//     {
//       hooks: input.hooks,
//     } as any,
//     HookGenerationResponseSchema
//   );

//   const { rationale, hooks } = response;

//   return {
//     ...input,
//     hookGenerationRationale: rationale,
//     hookQuestions: hooks,
//   };
// },
// };
