import { supabase } from "@/lib/supabase";
import type { HookQuestionRow, HookStatus } from "@/types/db";

type UpsertHookQuestionsInput = {
  quizId: number;
  status: HookStatus;
  hooks?: unknown | null;
  modelVersion?: string | null;
  strategyPrompt?: string | null;
  errorMessage?: string | null;
};

export async function upsertHookQuestions(
  input: UpsertHookQuestionsInput
): Promise<HookQuestionRow> {
  const payload: Record<string, unknown> = {
    quiz_id: input.quizId,
    status: input.status,
  };

  if (Object.prototype.hasOwnProperty.call(input, "hooks")) {
    payload.hooks = input.hooks ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "modelVersion")) {
    payload.model_version = input.modelVersion ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "strategyPrompt")) {
    payload.strategy_prompt = input.strategyPrompt ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "errorMessage")) {
    payload.error_message = input.errorMessage ?? null;
  }

  const { data, error } = await supabase
    .from("hook_questions")
    .upsert(payload, { onConflict: "quiz_id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert hook questions: ${error?.message}`);
  }

  return data as HookQuestionRow;
}

export async function getHookQuestionsByQuizId(
  quizId: number
): Promise<HookQuestionRow | null> {
  const { data, error } = await supabase
    .from("hook_questions")
    .select("*")
    .eq("quiz_id", quizId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load hook questions: ${error.message}`);
  }

  return (data as HookQuestionRow) ?? null;
}
