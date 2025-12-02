export { analyzeArticleMetadata } from './analyze-article'
export { generateReadingPlan } from './article-planner'
export { generateHookQuestions } from './hook-generator'
export { generateInstructionQuestions } from './instruction-question-generator'
export { expandReadingPlan } from './plan-expander'
export { type CreateLLMClientOptions, createLLMClient } from './prompts/create-executor'
// V2 Pipeline Infrastructure
export { type GenerationConfig, PromptExecutor } from './prompts/executor'
export {
  type DatabaseClient,
  Pipeline,
  PipelineError,
  type PipelineStep,
  type StepDependencies,
} from './prompts/pipeline'
export {
  analysisPromptV2,
  type HookGeneratorPromptContext,
  hookGeneratorPromptV2,
} from './prompts/v2'
export {
  generateQuizQuestions,
  runHookWorkflow,
  runInstructionWorkflow,
  runQuestionWorkflow,
} from './question-generator'
export { getTaskPoolData } from './task-pool'
export type {
  HookWorkflowResult,
  InstructionWorkflowResult,
  QuestionEngineOptions,
  QuestionWorkflowResult,
} from './types'
export * from './types'
export {
  type AnalysisResponse,
  AnalysisResponseSchema,
  // Types
  type Archetype,
  // Schemas
  ArchetypeSchema,
  type CoreThesis,
  CoreThesisSchema,
  type CuriosityQuestionWorkflowInput,
  type CuriosityQuestionWorkflowOutput,
  type Domain,
  DomainSchema,
  type HookContext,
  HookContextSchema,
  type HookGenerationResponse,
  HookGenerationResponseSchema,
  type HookGeneratorV2Response,
  HookGeneratorV2ResponseSchema,
  type HookQuestion,
  type HookQuestionOption,
  HookQuestionOptionSchema,
  HookQuestionSchema,
  type LogicalSchema,
  LogicalSchemaSchema,
  type Metadata,
  MetadataSchema,
  type Pedagogy,
  PedagogySchema,
  type QuizCard,
  QuizCardSchema,
  type QuizOption,
  QuizOptionSchema,
  type Remediation,
  RemediationSchema,
  type SourceLocation,
  SourceLocationSchema,
  type StructuralSkeleton,
  StructuralSkeletonSchema,
} from './workflows/curiosity-question-workflow'
