/**
 * V2 Curiosity Quiz Prompts & Schemas
 *
 * Curiosity quizzes are the entry point to the quiz flow.
 * They present 3 predictive questions to assess existing knowledge.
 */

export { analysisPromptV2 } from './analysis'
export {
  type CuriosityGeneratorPromptContext,
  curiosityGeneratorPromptV2,
} from './curiosity-generator'
export * from './schemas'
