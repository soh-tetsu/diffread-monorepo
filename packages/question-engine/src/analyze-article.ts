import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import { z } from 'zod'
import { articleAnalysisPrompt } from './prompts'
import type { ArticleMetadata, QuestionEngineOptions } from './types'

const DEFAULT_ANALYSIS_MODEL = 'gemini-2.5-flash-lite'

const MAX_ARTICLE_CHARACTERS = 8000

const DomainSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  specific_topic: z.string(),
})

const ComplexitySchema = z.object({
  overall: z.string(),
  lexical: z.string(),
  syntactic: z.string(),
})

const MetadataSchema = z.object({
  metadata: z.object({
    archetype: z.string(),
    domain: DomainSchema,
    complexity: ComplexitySchema,
    core_thesis: z.string(),
    key_concepts: z.array(z.string()).min(1),
    language: z.string(),
    estimated_reading_minutes: z.number().int().nonnegative(),
    rationale: z.string().optional(),
  }),
})

function resolveAnalysisApiKey(options?: QuestionEngineOptions): string {
  return options?.apiKey ?? process.env.GEMINI_API_KEY ?? ''
}

function resolveAnalysisModel(options?: QuestionEngineOptions): string {
  return options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_ANALYSIS_MODEL
}

export async function analyzeArticleMetadata(
  text: string,
  options?: QuestionEngineOptions
): Promise<ArticleMetadata> {
  if (!text || !text.trim()) {
    throw new Error('Cannot analyze metadata from empty text input.')
  }

  const apiKey = resolveAnalysisApiKey(options)
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY for metadata analysis.')
  }

  const client = new GoogleGenAI({ apiKey })
  const sanitized = text.trim().slice(0, MAX_ARTICLE_CHARACTERS)
  const prompt = articleAnalysisPrompt.render({ text: sanitized })

  const response = await client.models.generateContent({
    model: resolveAnalysisModel(options),
    contents: prompt,
    config: {
      systemInstruction: articleAnalysisPrompt.systemInstruction,
      temperature: 0.2,
      topP: 1,
      topK: 1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      safetySettings: [
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
      ],
    },
  })

  const raw = response.text?.trim()
  if (!raw) {
    throw new Error('Gemini returned an empty response for metadata analysis.')
  }

  let parsed: z.infer<typeof MetadataSchema>
  try {
    parsed = MetadataSchema.parse(JSON.parse(raw))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to parse metadata JSON (prompt ${articleAnalysisPrompt.version}): ${reason}`
    )
  }

  return parsed.metadata
}
