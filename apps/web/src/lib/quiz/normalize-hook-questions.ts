import type { QuizQuestion } from "@/lib/quiz/normalize-question";
import type { HookQuestion, QuizCard } from "@diffread/question-engine";

type RawHookQuestion = Partial<HookQuestion> & { id?: number };
type RawQuizCard = Partial<QuizCard>;

function isV1HookQuestion(input: unknown): input is RawHookQuestion {
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

function isV2QuizCard(input: unknown): input is RawQuizCard {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as RawQuizCard;
  return (
    typeof value.question === "string" &&
    Array.isArray(value.options) &&
    typeof value.format === "string" &&
    value.options.some((opt: unknown) =>
      typeof opt === "object" && opt !== null && "is_correct" in opt
    )
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

    // Check if V2 format (quiz_cards)
    if (isV2QuizCard(hook)) {
      const card = hook as RawQuizCard;
      const answerIndex = card.options?.findIndex((opt: any) => opt.is_correct === true) ?? 0;

      result.push({
        id: -(index + 1),
        category: card.format?.toLowerCase() ?? "hook",
        prompt: card.question ?? "",
        options: (card.options ?? []).map((option: any) => ({
          text: option?.text ?? "",
          rationale: option?.feedback,
        })),
        answerIndex,
        sourceLocation: typeof card.remediation === "object" &&
          card.remediation !== null &&
          (card.remediation as any).go_read_anchor
          ? {
            anchorText: (card.remediation as any).go_read_anchor,
          }
          : undefined,
        remediationPointer: typeof card.remediation === "object" && card.remediation !== null
          ? `${(card.remediation as any).headline}\n\n${(card.remediation as any).body}`
          : undefined,
      });
      continue;
    }

    // Fall back to V1 format (legacy)
    if (isV1HookQuestion(hook)) {
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
  }

  return result;
}
