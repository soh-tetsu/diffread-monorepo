import { analyzeArticleMetadata } from "./analyze-article";
import { generateHookQuestions } from "./hook-generator";
import { getTaskPoolData } from "./task-pool";
import { generateReadingPlan } from "./article-planner";
import { expandReadingPlan } from "./plan-expander";
import { generateInstructionQuestions } from "./instruction-question-generator";

import type {
  QuizArticleInput,
  QuestionEngineOptions,
  QuestionWorkflowResult,
} from "./types";

function ensureArticleText(article: QuizArticleInput): string {
  const text = article.text?.trim();
  if (!text) {
    throw new Error("Question workflow requires article.text with non-empty content.");
  }
  return text;
}

function ensureTaskPool(archetype: string, taskPool: ReturnType<typeof getTaskPoolData>) {
  if (!taskPool || taskPool.length === 0) {
    throw new Error(`No task template pool registered for archetype "${archetype}".`);
  }
  return taskPool;
}

export async function runQuestionWorkflow(
  article: QuizArticleInput,
  options?: QuestionEngineOptions
): Promise<QuestionWorkflowResult> {
  const articleText = ensureArticleText(article);

  const metadata = await analyzeArticleMetadata(articleText, options);

  const taskPool = ensureTaskPool(metadata.archetype, getTaskPoolData(metadata.archetype));

  const hookQuestions = await generateHookQuestions(
    { metadata, articleText },
    options
  );

  const readingPlan = await generateReadingPlan(
    { metadata, taskPool },
    options
  );

  const planExpansion = await expandReadingPlan(
    {
      text: articleText,
      metadata,
      readingPlan: readingPlan.reading_plan,
      taskPool,
    },
    options
  );

  const instructionQuestions = await generateInstructionQuestions(
    planExpansion.expanded_plan,
    metadata.language ?? "en",
    options
  );

  return {
    metadata,
    taskPool,
    hookQuestions,
    readingPlan,
    planExpansion,
    instructionQuestions,
  };
}

export const generateQuizQuestions = runQuestionWorkflow;
