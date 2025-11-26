import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { getArticleById } from "@/lib/db/articles";
import { setSessionStatusByQuiz } from "@/lib/db/sessions";
import { getHookQuestionsByQuizId } from "@/lib/db/hooks";
import {
  ensureArticleAnalysis,
  ensureArticleContent,
} from "@/lib/workflows/article-content";
import { buildHookQuestionsForQuiz } from "@/lib/workflows/hook-generation";
import { generateInstructionWorkflow } from "@/lib/quiz/question-engine";
import type { InstructionWorkflowResult } from "@diffread/question-engine";
import type { ArticleRow, QuizRow, QuizStatus } from "@/types/db";

type ClaimHookJobResult = {
  quiz_id: number;
  article_id: number;
  quiz_status: QuizStatus;
  hook_id: number;
};

async function loadQuizById(quizId: number): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load quiz ${quizId}: ${error.message}`);
  }

  return (data as QuizRow) ?? null;
}

async function claimNextHookQuiz(): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .rpc("claim_next_hook_job")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to claim hook job: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  // Map the RPC result to QuizRow format
  return {
    id: data.quiz_id,
    article_id: data.article_id,
    status: data.quiz_status,
  } as QuizRow;
}

async function claimNextInstructionQuiz(): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .rpc("claim_next_instruction_job")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to claim instruction job: ${error.message}`);
  }

  return (data as QuizRow) ?? null;
}

async function promoteQuizToProcessing(quizId: number): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .from("quizzes")
    .update({ status: "processing" })
    .eq("id", quizId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to promote quiz ${quizId}: ${error.message}`);
  }

  return (data as QuizRow) ?? null;
}

async function persistQuestions(
  quiz: QuizRow,
  workflow: InstructionWorkflowResult,
  modelUsed: string
) {
  await supabase.from("questions").delete().eq("quiz_id", quiz.id);

  const payload = workflow.instructionQuestions.map((question, index) => ({
    quiz_id: quiz.id,
    question_type: "mcq",
    content: question,
    sort_order: index,
  }));

  const { error: insertError } = await supabase
    .from("questions")
    .insert(payload);

  if (insertError) {
    throw new Error(`Failed to insert questions: ${insertError.message}`);
  }

  const { error: updateError } = await supabase
    .from("quizzes")
    .update({ status: "ready", model_used: modelUsed })
    .eq("id", quiz.id);

  if (updateError) {
    throw new Error(`Failed to mark quiz ready: ${updateError.message}`);
  }
}

async function markFailed(quizId: number, reason: string) {
  await supabase
    .from("quizzes")
    .update({ status: "failed", model_used: reason.slice(0, 120) })
    .eq("id", quizId);
  await setSessionStatusByQuiz(quizId, "errored");
  logger.error({ quizId, reason }, "Quiz failed");
}

export type ProcessResult =
  | {
      quiz: QuizRow;
      article: ArticleRow;
      status: "ready";
    }
  | null;

async function handleInstructionJob(quiz: QuizRow): Promise<ProcessResult> {
  if (quiz.status !== "processing") {
    return null;
  }

  try {
    const articleRecord = await getArticleById(quiz.article_id);
    const prepared = await ensureArticleContent(articleRecord);
    const analysis = await ensureArticleAnalysis(
      prepared.article,
      prepared.content
    );

    const { workflow, model } = await generateInstructionWorkflow(
      analysis.article,
      prepared.content,
      analysis.metadata
    );

    await persistQuestions(quiz, workflow, model);
    await setSessionStatusByQuiz(quiz.id, "ready");
    logger.info(
      {
        quizId: quiz.id,
        articleId: analysis.article.id,
        normalizedUrl: analysis.article.normalized_url,
      },
      "Instruction workflow completed"
    );
    return {
      quiz: { ...quiz, status: "ready" },
      article: analysis.article,
      status: "ready",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(quiz.id, reason);
    throw error;
  }
}

async function handleHookJob(quiz: QuizRow): Promise<void> {
  const hookRecord = await getHookQuestionsByQuizId(quiz.id);
  if (hookRecord?.status === "ready") {
    return;
  }

  try {
    await buildHookQuestionsForQuiz(quiz);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(quiz.id, reason);
    throw error;
  }

  const refreshedQuiz = await loadQuizById(quiz.id);
  if (!refreshedQuiz) {
    return;
  }

  if (refreshedQuiz.status === "pending") {
    const promoted = await promoteQuizToProcessing(refreshedQuiz.id);
    if (promoted) {
      await handleInstructionJob(promoted);
    }
  } else if (
    refreshedQuiz.status === "failed" ||
    refreshedQuiz.status === "not_required"
  ) {
    await supabase
      .from("quizzes")
      .update({ status: "not_required" })
      .eq("id", refreshedQuiz.id)
      .in("status", ["failed", "not_required"]);
  }
}

export async function processNextPendingQuiz(): Promise<ProcessResult> {
  const hookQuiz = await claimNextHookQuiz();
  if (hookQuiz) {
    logger.info({ quizId: hookQuiz.id }, "Processing pending hook workflow");
    await handleHookJob(hookQuiz);
    return null;
  }

  const instructionQuiz = await claimNextInstructionQuiz();
  if (!instructionQuiz) {
    logger.debug("No pending hooks or instructions");
    return null;
  }

  logger.info(
    { quizId: instructionQuiz.id },
    "Processing next instruction workflow"
  );
  return handleInstructionJob(instructionQuiz);
}

export async function processQuizById(
  quizId: number
): Promise<ProcessResult> {
  let quiz = await loadQuizById(quizId);
  if (!quiz) {
    return null;
  }

  await handleHookJob(quiz);
  quiz = await loadQuizById(quizId);
  if (!quiz) {
    return null;
  }

  if (quiz.status === "pending") {
    const promoted = await promoteQuizToProcessing(quiz.id);
    if (!promoted) {
      return null;
    }
    return handleInstructionJob(promoted);
  }

  if (quiz.status === "processing") {
    return handleInstructionJob(quiz);
  }

  return null;
}
