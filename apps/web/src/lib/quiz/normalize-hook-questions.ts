import type { QuizQuestion } from "@/lib/quiz/normalize-question";
import type { HookQuestion } from "@diffread/question-engine";

type RawHookQuestion = Partial<HookQuestion> & { id?: number };

function isHookQuestion(input: unknown): input is RawHookQuestion {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as RawHookQuestion;
  return (
    typeof value.question === "string" &&
    Array.isArray(value.options) &&
    typeof value.answer_index === "number"
  );
}

export function normalizeHookQuestions(
  hooks: unknown
): QuizQuestion[] {
  if (!Array.isArray(hooks)) {
    return [];
  }

  const result: QuizQuestion[] = [];

  for (let index = 0; index < hooks.length; index++) {
    const hook = hooks[index];
    if (!isHookQuestion(hook)) {
      continue;
    }
    result.push({
      id: typeof hook.id === "number" ? -Math.abs(hook.id) : -(index + 1),
      category: hook.type ?? "hook",
      prompt: hook.question ?? "",
      options: (hook.options ?? []).map((option) => ({
        text: option?.text ?? "",
        rationale: option?.rationale,
      })),
      answerIndex: hook.answer_index ?? 0,
      remediationPointer: hook.remediation,
    });
  }

  return result;
}
