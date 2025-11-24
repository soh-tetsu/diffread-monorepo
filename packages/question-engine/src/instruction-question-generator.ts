import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";

import type {
  ExpandedObjective,
  InstructionQuestion,
  QuestionEngineOptions,
} from "./types";
import { questionGeneratorPrompt } from "./prompts";

const DEFAULT_INSTRUCTION_MODEL = "gemini-2.5-flash-lite";

const OptionSchema = z.object({
  option: z.string().min(1),
  remediation: z.string().min(1),
});

const InstructionQuestionSchema = z.object({
  type: z.string().min(1),
  question: z.string().min(1),
  options: z.array(OptionSchema).length(4),
  answer_index: z.number().int().min(0).max(3),
  rationale: z.string().min(1),
});

function resolveApiKey(options?: QuestionEngineOptions): string {
  return options?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
}

function resolveModel(options?: QuestionEngineOptions): string {
  return options?.model ?? process.env.GEMINI_INSTRUCTION_MODEL ?? DEFAULT_INSTRUCTION_MODEL;
}

export async function generateInstructionQuestions(
  expandedPlan: ExpandedObjective[],
  language = "en",
  options?: QuestionEngineOptions
): Promise<InstructionQuestion[]> {
  if (!expandedPlan || expandedPlan.length === 0) {
    throw new Error("generateInstructionQuestions requires a non-empty expanded plan.");
  }

  const instructions = expandedPlan.flatMap((objective) => objective.instructions ?? []);
  if (instructions.length === 0) {
    throw new Error("generateInstructionQuestions requires at least one instruction.");
  }

  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for instruction question generation.");
  }

  const client = new GoogleGenAI({ apiKey });
  const results: InstructionQuestion[] = [];

  for (const instruction of instructions) {
    if (!instruction.relevant_context?.trim()) {
      throw new Error(`Instruction ${instruction.instruction_id} is missing relevant_context.`);
    }
    if (!instruction.task_instruction?.trim()) {
      throw new Error(`Instruction ${instruction.instruction_id} is missing task_instruction.`);
    }
    if (!instruction.question_type?.trim()) {
      throw new Error(`Instruction ${instruction.instruction_id} is missing question_type.`);
    }

    const prompt = questionGeneratorPrompt.render({
      text: instruction.relevant_context,
      taskInstruction: instruction.task_instruction,
      questionType: instruction.question_type,
      language: language.trim().length > 0 ? language.trim() : "en",
    });

    const response = await client.models.generateContent({
      model: resolveModel(options),
      contents: prompt,
      config: {
        systemInstruction: questionGeneratorPrompt.systemInstruction,
        temperature: 0.2,
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
      throw new Error(
        `Gemini returned an empty response for instruction ${instruction.instruction_id}.`
      );
    }

    let parsed: z.infer<typeof InstructionQuestionSchema>;
    try {
      parsed = InstructionQuestionSchema.parse(JSON.parse(raw));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const snippet = raw.slice(0, 400);
      throw new Error(
        `Failed to parse instruction question JSON (prompt ${questionGeneratorPrompt.version}, instruction ${instruction.instruction_id}): ${reason}. Snippet: ${snippet}`
      );
    }

    results.push({
      ...parsed,
      instruction_id: instruction.instruction_id,
      source_location: instruction.source_location,
      relevant_context: instruction.relevant_context,
    });
  }

  return results;
}
