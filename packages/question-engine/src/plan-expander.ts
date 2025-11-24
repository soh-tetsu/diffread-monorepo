import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";

import type {
  ArticleMetadata,
  QuestionEngineOptions,
  ReadingPlanPart,
  TaskTemplate,
} from "./types";
import { planExpanderPrompt } from "./prompts";

const DEFAULT_EXPANDER_MODEL = "gemini-2.5-flash-lite";

const InstructionSchema = z.object({
  instruction_id: z.string().min(1),
  task_instruction: z.string().min(1),
  question_type: z.enum(["explicit", "implicit", "confirmative"]),
  relevant_context: z.string().min(1),
  source_location: z.object({
    anchor_text: z.string().min(1),
    estimated_paragraph: z.number().int().positive(),
  }),
  estimated_difficulty: z.enum(["easy", "medium", "hard"]),
});

const ExpandedObjectiveSchema = z.object({
  objective_id: z.string().min(1),
  objective_description: z.string().min(1),
  instructions: z.array(InstructionSchema).min(1),
});

const CoverageReportSchema = z.object({
  total_paragraphs: z.number().int().positive(),
  covered_paragraphs: z.array(z.number().int().positive()),
  coverage_percent: z.number().min(0),
});

const PlanExpanderSchema = z.object({
  rationale: z.string().min(1),
  expanded_plan: z.array(ExpandedObjectiveSchema).min(1),
  coverage_report: CoverageReportSchema,
});

type PlanExpanderInput = {
  text: string;
  metadata: ArticleMetadata;
  readingPlan: ReadingPlanPart[];
  taskPool: TaskTemplate[];
};

function resolveExpanderApiKey(options?: QuestionEngineOptions): string {
  return options?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
}

function resolveExpanderModel(options?: QuestionEngineOptions): string {
  return options?.model ?? process.env.GEMINI_EXPANDER_MODEL ?? DEFAULT_EXPANDER_MODEL;
}

export async function expandReadingPlan(
  input: PlanExpanderInput,
  options?: QuestionEngineOptions
) {
  if (!input.text?.trim()) {
    throw new Error("expandReadingPlan requires non-empty article text.");
  }
  if (!input.metadata) {
    throw new Error("expandReadingPlan requires metadata.");
  }
  if (!input.readingPlan || input.readingPlan.length === 0) {
    throw new Error("expandReadingPlan requires a non-empty reading plan.");
  }
  if (!input.taskPool || input.taskPool.length === 0) {
    throw new Error("expandReadingPlan requires a non-empty task pool.");
  }

  const apiKey = resolveExpanderApiKey(options);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for plan expansion.");
  }

  const client = new GoogleGenAI({ apiKey });
  const prompt = planExpanderPrompt.render({
    text: input.text,
    metadata: input.metadata,
    taskPool: input.taskPool,
    readingPlan: input.readingPlan,
  });

  const response = await client.models.generateContent({
    model: resolveExpanderModel(options),
    contents: prompt,
    config: {
      systemInstruction: planExpanderPrompt.systemInstruction,
      temperature: 0.2,
      topP: 1,
      topK: 1,
      maxOutputTokens: 4096,
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
    throw new Error("Gemini returned an empty response for plan expansion.");
  }

  let parsed: z.infer<typeof PlanExpanderSchema>;
  try {
    parsed = PlanExpanderSchema.parse(JSON.parse(raw));
  } catch (error) {
    const snippet = raw.slice(0, 400);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse plan expansion JSON (prompt ${planExpanderPrompt.version}): ${reason}. Snippet: ${raw}`
    );
  }

  return parsed;
}
