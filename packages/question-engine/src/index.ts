export * from "./types";
export {
  runQuestionWorkflow,
  runHookWorkflow,
  runInstructionWorkflow,
  generateQuizQuestions,
} from "./question-generator";
export type {
  QuestionEngineOptions,
  QuestionWorkflowResult,
  HookWorkflowResult,
  InstructionWorkflowResult,
} from "./types";
export { analyzeArticleMetadata } from "./analyze-article";
export { generateHookQuestions } from "./hook-generator";
export { getTaskPoolData } from "./task-pool";
export { generateReadingPlan } from "./article-planner";
export { expandReadingPlan } from "./plan-expander";
export { generateInstructionQuestions } from "./instruction-question-generator";

// V2 Pipeline Infrastructure
export { PromptExecutor, type GenerationConfig } from "./prompts/executor";
export { createLLMClient, type CreateLLMClientOptions } from "./prompts/create-executor";
export { Pipeline, PipelineError, type PipelineStep, type StepDependencies, type DatabaseClient } from "./prompts/pipeline";
export { analysisPromptV2, hookGeneratorPromptV2, type HookGeneratorPromptContext } from "./prompts/v2";
export {
  // Schemas
  ArchetypeSchema,
  LogicalSchemaSchema,
  StructuralSkeletonSchema,
  DomainSchema,
  CoreThesisSchema,
  SourceLocationSchema,
  HookContextSchema,
  PedagogySchema,
  MetadataSchema,
  HookQuestionOptionSchema,
  HookQuestionSchema,
  AnalysisResponseSchema,
  HookGenerationResponseSchema,
  QuizOptionSchema,
  RemediationSchema,
  QuizCardSchema,
  HookGeneratorV2ResponseSchema,
  // Types
  type Archetype,
  type LogicalSchema,
  type StructuralSkeleton,
  type Domain,
  type CoreThesis,
  type SourceLocation,
  type HookContext,
  type Pedagogy,
  type Metadata,
  type HookQuestionOption,
  type HookQuestion,
  type AnalysisResponse,
  type HookGenerationResponse,
  type QuizOption,
  type Remediation,
  type QuizCard,
  type HookGeneratorV2Response,
  type CuriosityQuestionWorkflowInput,
  type CuriosityQuestionWorkflowOutput,
} from "./workflows/curiosity-question-workflow";
