import { type GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import type { z } from 'zod'
import type { PromptContext, PromptDefinition } from './types'

export const DEFAULT_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
]

export type GenerationConfig = {
  model: string
  temperature: number
  topP?: number
  topK?: number
  maxOutputTokens: number
  responseMimeType?: 'application/json' | 'text/plain'
  thinkingConfig?: {
    includeThoughts?: boolean
    thinkingBudget?: number
  }
}

export class PromptExecutor {
  constructor(
    private client: GoogleGenAI,
    private config: GenerationConfig
  ) {}

  // TODO: After V2 migration is complete, remove V1 overload and simplify to only support generic prompts
  async execute<T>(
    prompt: PromptDefinition,
    context: PromptContext,
    schema: z.ZodSchema<T>
  ): Promise<T>
  async execute<T, TContext>(
    prompt: {
      id: string
      version: string
      systemInstruction: string
      render(context: TContext): string
    },
    context: TContext,
    schema: z.ZodSchema<T>
  ): Promise<T>
  async execute<T, TContext>(
    prompt:
      | PromptDefinition
      | {
          id: string
          version: string
          systemInstruction: string
          render(context: TContext): string
        },
    context: TContext,
    schema: z.ZodSchema<T>
  ): Promise<T> {
    const rendered = prompt.render(context as any)

    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents: rendered,
      config: {
        // systemInstruction: prompt.systemInstruction,
        ...this.config,
        safetySettings: DEFAULT_SAFETY_SETTINGS,
      },
    })

    const raw = response.text?.trim()
    if (!raw) {
      throw new Error(
        `Gemini returned empty response for prompt ${prompt.id} (version: ${prompt.version})`
      )
    }

    // console.error("Raw response:", raw);

    try {
      // Extract rationale from <rationale></rationale> block
      const rationaleMatch = raw.match(/<rationale>([\s\S]*?)<\/rationale>/)
      const rationale = rationaleMatch?.[1]?.trim() ?? ''

      // console.error("Rationale:", rationale);

      // Extract JSON from ```json ... ``` block
      const jsonStartMatch = raw.match(/```json\s*/)
      let jsonContent: string

      if (jsonStartMatch) {
        const jsonStart = jsonStartMatch.index! + jsonStartMatch[0].length
        const afterJson = raw.slice(jsonStart)
        const jsonEndIndex = afterJson.lastIndexOf('```')

        if (jsonEndIndex !== -1) {
          jsonContent = afterJson.slice(0, jsonEndIndex).trim()
        } else {
          throw new Error('No closing ``` found for JSON block')
        }
      } else {
        // Fallback: try to parse raw as JSON if no code fence
        jsonContent = raw
      }

      const parsed = JSON.parse(jsonContent)

      // Merge rationale into the parsed object
      const withRationale = { rationale, ...parsed }

      return schema.parse(withRationale)
    } catch (error) {
      const snippet = raw.slice(0, 500)
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to parse response for prompt ${prompt.id} (version: ${prompt.version}): ${reason}. Snippet: ${snippet}`
      )
    }
  }
}
