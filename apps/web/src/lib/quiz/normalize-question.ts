import { QuestionContent, QuestionRow } from "@/types/db";

export type QuizOption = {
  text: string;
  rationale?: string;
};

export type QuizQuestion = {
  id: number;
  category: string;
  prompt: string;
  options: QuizOption[];
  answerIndex: number;
  sourceLocation?: {
    anchorText: string;
    estimatedParagraph?: number;
  };
  relevantContext?: string;
  remediationPointer?: string;
};

function isStructuredContent(
  content: QuestionContent
): content is Extract<
  QuestionContent,
  { type: "common_sense_test" | "root_cause" | "conceptual_flip" }
> {
  return (
    typeof content === "object" &&
    content !== null &&
    "question" in content &&
    "options" in content &&
    Array.isArray(content.options)
  );
}

function isInstructionQuestionContent(
  content: QuestionContent
): content is Extract<
  QuestionContent,
  {
    instruction_id: string;
    type: string;
    question: string;
    options: Array<{ option: string; remediation: string }>;
  }
> {
  return (
    typeof content === "object" &&
    content !== null &&
    "instruction_id" in content &&
    "question" in content &&
    "options" in content &&
    Array.isArray((content as { options?: unknown }).options) &&
    (content as { options: Array<{ option?: unknown }> }).options.every(
      (opt) => opt && typeof opt === "object" && "option" in opt
    )
  );
}

export function normalizeQuestion(row: QuestionRow): QuizQuestion | null {
  const content = row.content;

if (isInstructionQuestionContent(content)) {
    return {
      id: row.id,
      category: content.type,
      prompt: content.question,
      options: content.options.map((opt) => ({
        text: opt.option,
        rationale: opt.remediation,
      })),
      answerIndex: content.answer_index ?? 0,
      sourceLocation: content.source_location
        ? {
            anchorText: content.source_location.anchor_text,
            estimatedParagraph: content.source_location.estimated_paragraph,
          }
        : undefined,
      relevantContext: content.relevant_context,
    };
  }

  if (isStructuredContent(content)) {
    return {
      id: row.id,
      category: content.type.replace(/_/g, " "),
      prompt: content.question,
      options: content.options.map((opt) => ({
        text: opt.text ?? opt.label ?? "",
        rationale: opt.rationale,
      })),
      answerIndex: content.answer_index ?? 0,
      sourceLocation: content.source_location
        ? {
            anchorText: content.source_location.anchor_text,
            estimatedParagraph: content.source_location.estimated_paragraph,
          }
        : undefined,
    };
  }

  if (content.type === "mcq") {
    const options = content.options.map((opt) => ({
      text: opt.label,
    }));

    const answerIdx = content.options.findIndex(
      (opt) => opt.id === content.answer
    );

    return {
      id: row.id,
      category: "multiple choice",
      prompt: content.prompt,
      options,
      answerIndex: answerIdx >= 0 ? answerIdx : 0,
    };
  }

  if (content.type === "true_false") {
    return {
      id: row.id,
      category: "true or false",
      prompt: content.prompt,
      options: [
        { text: "True" },
        { text: "False" },
      ],
      answerIndex: content.answer ? 0 : 1,
    };
  }

  return null;
}
