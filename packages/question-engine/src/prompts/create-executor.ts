import { GoogleGenAI } from '@google/genai'
import { type GenerationConfig, PromptExecutor } from './executor'

export type CreateLLMClientOptions = {
  apiKey: string
  model?: string
  temperature?: number
  maxOutputTokens?: number
  responseMimeType?: 'application/json' | 'text/plain'
  thinkingConfig?: {
    includeThoughts?: boolean
    thinkingBudget?: number
  }
}

/**
 * Factory function to create a PromptExecutor instance
 *
 * This abstracts away the GoogleGenAI client dependency from consumers.
 */
export function createLLMClient(options: CreateLLMClientOptions): PromptExecutor {
  const { apiKey, ...configOptions } = options
  const client = new GoogleGenAI({ apiKey })

  const config: GenerationConfig = {
    model: 'gemini-2.5-flash-lite',
    temperature: 0.1,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 4096,
    },
    ...configOptions,
  }

  return new PromptExecutor(client, config)
}
