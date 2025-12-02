import type { PromptExecutor } from './executor'

/**
 * Dependencies injected into every pipeline step
 */
export type StepDependencies = {
  executor: PromptExecutor
  db: DatabaseClient
}

/**
 * Database client interface for pipeline steps
 */
export interface DatabaseClient {
  // Extensible - steps define what methods they need
  [key: string]: unknown
}

/**
 * Base pipeline step interface
 */
export interface PipelineStep<TInput, TOutput> {
  name: string
  type: 'llm' | 'persist' | 'transform' | 'conditional'

  execute(input: TInput, dependencies: StepDependencies): Promise<TOutput>

  // Optional: idempotency support
  isCompleted?(input: TInput, dependencies: StepDependencies): Promise<boolean>
  loadExisting?(input: TInput, dependencies: StepDependencies): Promise<TOutput | null>
}

/**
 * LLM step: Execute AI model calls with prompt templates
 */
export type LLMStep<TInput, TOutput> = PipelineStep<TInput, TOutput> & {
  type: 'llm'
}

/**
 * Persist step: Save data to database
 */
export type PersistStep<TInput, TOutput> = PipelineStep<TInput, TOutput> & {
  type: 'persist'
}

/**
 * Transform step: Apply business logic or data transformation
 */
export type TransformStep<TInput, TOutput> = PipelineStep<TInput, TOutput> & {
  type: 'transform'
}

/**
 * Conditional step: Branch execution based on runtime conditions
 */
export type ConditionalStep<TInput, TOutput> = PipelineStep<TInput, TOutput> & {
  type: 'conditional'
  condition(input: TInput): boolean | Promise<boolean>
  trueBranch: PipelineStep<TInput, TOutput>
  falseBranch?: PipelineStep<TInput, TOutput>
}

/**
 * Error thrown when a pipeline step fails
 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public stepName: string,
    public cause?: unknown
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

/**
 * Declarative pipeline for orchestrating multi-step AI workflows
 */
export class Pipeline<TInput, TOutput> {
  private steps: PipelineStep<any, any>[] = []

  addStep<TStepOutput>(step: PipelineStep<any, TStepOutput>): Pipeline<TInput, TStepOutput> {
    this.steps.push(step)
    return this as any
  }

  async execute(input: TInput, dependencies: StepDependencies): Promise<TOutput> {
    let context: any = input

    for (const step of this.steps) {
      try {
        // Check idempotency
        if (step.isCompleted && (await step.isCompleted(context, dependencies))) {
          const existing = await step.loadExisting?.(context, dependencies)
          if (existing) {
            context = existing
            continue
          }
        }

        // Execute step
        if (step.type === 'conditional') {
          const conditionalStep = step as ConditionalStep<any, any>
          const shouldExecuteTrueBranch = await conditionalStep.condition(context)

          if (shouldExecuteTrueBranch) {
            context = await conditionalStep.trueBranch.execute(context, dependencies)
          } else if (conditionalStep.falseBranch) {
            context = await conditionalStep.falseBranch.execute(context, dependencies)
          }
          // If no branch matches, pass through
        } else {
          context = await step.execute(context, dependencies)
        }
      } catch (error) {
        throw new PipelineError(
          `Step "${step.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          step.name,
          error
        )
      }
    }

    return context
  }
}
