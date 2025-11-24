import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";

import type {
  ArticleMetadata,
  QuestionEngineOptions,
  ReadingPlanResponse,
  TaskTemplate,
} from "./types";
import { articlePlannerPrompt } from "./prompts";

const DEFAULT_PLANNER_MODEL = "gemini-2.5-flash-lite";

const ReadingPlanTaskSchema = z.object({
  task_id: z.string().min(1),
  task_instruction: z.string().min(1),
  question_type: z.enum(["explicit", "implicit", "confirmative"]),
});

const ReadingPlanPartSchema = z.object({
  part: z.number().int().positive(),
  title: z.string().min(1),
  tasks: z.array(ReadingPlanTaskSchema).min(1),
});

const ReadingPlanSchema = z.object({
  rationale: z.string().min(1),
  reading_plan: z.array(ReadingPlanPartSchema).min(1),
});

type PlannerInput = {
  metadata: ArticleMetadata;
  taskPool: TaskTemplate[];
};

function resolvePlannerApiKey(options?: QuestionEngineOptions): string {
  return options?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
}

function resolvePlannerModel(options?: QuestionEngineOptions): string {
  return options?.model ?? process.env.GEMINI_PLANNER_MODEL ?? DEFAULT_PLANNER_MODEL;
}

export async function generateReadingPlan(
  input: PlannerInput,
  options?: QuestionEngineOptions
): Promise<ReadingPlanResponse> {
  if (!input.metadata) {
    throw new Error("generateReadingPlan requires article metadata.");
  }

  if (!input.taskPool || input.taskPool.length === 0) {
    throw new Error("generateReadingPlan requires a non-empty task pool.");
  }

  const apiKey = resolvePlannerApiKey(options);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for reading plan generation.");
  }

  const client = new GoogleGenAI({ apiKey });
  const prompt = articlePlannerPrompt.render({
    metadata: input.metadata,
    taskPool: input.taskPool,
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await client.models.generateContent({
    model: resolvePlannerModel(options),
    contents: prompt,
    config: {
      systemInstruction: articlePlannerPrompt.systemInstruction,
      temperature: 0.1,
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
      lastError = new Error("Gemini returned an empty response for reading plan generation.");
      continue;
    }

    try {
      return ReadingPlanSchema.parse(JSON.parse(raw));
    } catch (error) {
      lastError = new Error(
        `Failed to parse reading plan JSON (prompt ${articlePlannerPrompt.version}): ${
          error instanceof Error ? error.message : String(error)
        }. Snippet: ${raw}`
      );
    }
  }

  throw lastError ??
    new Error("Reading plan generation failed for unknown reasons.");
}
