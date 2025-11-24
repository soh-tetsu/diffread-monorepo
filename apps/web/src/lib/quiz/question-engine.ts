import {
  generateQuizQuestions as runQuestionEngine,
  type QuestionWorkflowResult,
} from "@diffread/question-engine";

import type { ArticleRow } from "@/types/db";

function extractTitle(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const maybeTitle = (metadata as Record<string, unknown>)["title"];
  return typeof maybeTitle === "string" ? maybeTitle : null;
}

export async function generateQuizQuestions(
  article: ArticleRow,
  articleText: string
): Promise<{ workflow: QuestionWorkflowResult; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for quiz generation.");
  }

  const workflow = await runQuestionEngine(
    {
      normalizedUrl: article.normalized_url,
      title: extractTitle(article.metadata),
      text: articleText,
      metadata: article.metadata,
    },
    {
      apiKey,
      model,
    }
  );

  return {
    workflow,
    model,
  };
}
