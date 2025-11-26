import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";

import { getHookStrategyPrompt } from "./prompts";
import type { QuestionEngineOptions, HookQuestion, ArticleMetadata } from "./types";

const HOOK_MODEL = "gemini-2.5-flash-lite";

const HookQuestionSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.string(),
  question: z.string(),
  options: z.array(
    z.object({
      text: z.string(),
      rationale: z.string().optional(),
    })
  ),
  remediation: z.string(),
  answer_index: z.number().int(),
});

const HookResponseSchema = z.object({
  hooks: z.array(HookQuestionSchema),
});

type HookGenerationInput = {
  metadata: ArticleMetadata;
  articleText: string;
};

function resolveModel(options?: QuestionEngineOptions): string {
  return options?.model ?? process.env.GEMINI_HOOK_MODEL ?? HOOK_MODEL;
}

function resolveApiKey(options?: QuestionEngineOptions): string {
  return options?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
}

export async function generateHookQuestions(
  input: HookGenerationInput,
  options?: QuestionEngineOptions
): Promise<HookQuestion[]> {
  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for hook question generation.");
  }

  if (!input.articleText.trim()) {
    throw new Error("Cannot generate hook questions for empty article text.");
  }

  const strategyPrompt = getHookStrategyPrompt(input.metadata.archetype);
  const prompt = strategyPrompt.render({
    metadata: input.metadata,
    text: input.articleText,
  });

  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: resolveModel(options),
    contents: prompt,
    config: {
      systemInstruction: strategyPrompt.systemInstruction,
      temperature: 0.7,
      topP: 1,
      topK: 1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
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
  });

  const raw = response.text?.trim();
  if (!raw) {
    throw new Error("Gemini returned an empty response for hook questions.");
  }

  let parsed: z.infer<typeof HookResponseSchema>;
  try {
    parsed = HookResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    const snippet = raw.slice(0, 400);
    throw new Error(
      `Failed to parse hook questions JSON (prompt ${strategyPrompt.id}): ${snippet}`
    );
  }

  return parsed.hooks;
}
