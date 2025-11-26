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
  HookWorkflowResult,
  InstructionWorkflowResult,
  ArticleMetadata,
  TaskTemplate,
} from "./types";

function ensureArticleText(article: QuizArticleInput): string {
  const text = article.text?.trim();
  if (!text) {
    throw new Error("Question workflow requires article.text with non-empty content.");
  }
  return text;
}

function resolveTaskPool(
  archetype: string,
  provided?: TaskTemplate[] | null
): TaskTemplate[] {
  const pool = provided ?? getTaskPoolData(archetype);
  if (!pool || pool.length === 0) {
    throw new Error(`No task template pool registered for archetype "${archetype}".`);
  }
  return pool;
}

export async function runHookWorkflow(
  article: QuizArticleInput,
  metadata: ArticleMetadata,
  options?: QuestionEngineOptions,
): Promise<HookWorkflowResult> {
  const articleText = ensureArticleText(article);

  const hookQuestions = await generateHookQuestions(
    { metadata, articleText },
    options
  );

  return { metadata,hookQuestions };
}

export async function runInstructionWorkflow(
  article: QuizArticleInput,
  metadata: ArticleMetadata,
  options?: QuestionEngineOptions,
  taskPoolOverride?: TaskTemplate[]
): Promise<InstructionWorkflowResult> {
  const articleText = ensureArticleText(article);
  const taskPool = resolveTaskPool(metadata.archetype, taskPoolOverride);

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

  return { metadata, taskPool, readingPlan, planExpansion, instructionQuestions };
}

export async function runQuestionWorkflow(
  article: QuizArticleInput,
  options?: QuestionEngineOptions
): Promise<QuestionWorkflowResult> {
  const articleText = ensureArticleText(article);
  const metadata = await analyzeArticleMetadata(articleText, options);
  const taskPool = resolveTaskPool(metadata.archetype);

  const [hookResult, instructionResult] = await Promise.all([
    runHookWorkflow(article, metadata, options),
    runInstructionWorkflow(article, metadata, options, taskPool),
  ]);

  return {
    metadata,
    taskPool,
    hookQuestions: hookResult.hookQuestions,
    readingPlan: instructionResult.readingPlan,
    planExpansion: instructionResult.planExpansion,
    instructionQuestions: instructionResult.instructionQuestions,
  };
}

export const generateQuizQuestions = runQuestionWorkflow;
