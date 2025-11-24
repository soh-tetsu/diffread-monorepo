import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  getArticleById,
  isArticleFresh,
  updateArticleContent,
  updateArticleStatus,
} from "@/lib/db/articles";
import { setSessionStatusByQuiz } from "@/lib/db/sessions";
import { scrapeArticle, ScrapeError } from "@/lib/quiz/scraper";
import type { ScrapedArticle } from "@/lib/quiz/scraper";
import { generateQuizQuestions } from "@/lib/quiz/question-engine";
import type { QuestionWorkflowResult } from "@diffread/question-engine";
import type { ArticleRow, QuizRow } from "@/types/db";
import {
  downloadArticleContent,
  uploadArticleBundle,
  uploadArticlePdf,
  hasStoredContent,
} from "@/lib/storage";

async function claimNextQuiz(): Promise<QuizRow | null> {
  const { data: candidate, error: fetchError } = await supabase
    .from("quizzes")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    throw new Error(`Failed to fetch pending quiz: ${fetchError.message}`);
  }

  if (!candidate) {
    return null;
  }

  const { data: claimed, error: claimError } = await supabase
    .from("quizzes")
    .update({ status: "processing" })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError && claimError.code !== "PGRST116") {
    throw new Error(`Failed to claim quiz ${candidate.id}: ${claimError.message}`);
  }

  if (!claimed) {
    return null;
  }

  return claimed as QuizRow;
}

async function persistQuestions(
  quiz: QuizRow,
  workflow: QuestionWorkflowResult,
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

function extractString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function mergeMetadata(
  existing: Record<string, unknown> | null,
  scraped: ScrapedArticle["metadata"]
): Record<string, unknown> {
  const base = existing ?? {};
  return {
    ...base,
    title: scraped.title ?? extractString(base["title"]) ?? null,
    byline: scraped.byline ?? extractString(base["byline"]) ?? null,
    excerpt: scraped.excerpt ?? extractString(base["excerpt"]) ?? null,
    length: scraped.length ?? extractNumber(base["length"]) ?? null,
    siteName: scraped.siteName ?? extractString(base["siteName"]) ?? null,
    lang: scraped.lang ?? extractString(base["lang"]) ?? null,
  };
}

export type ProcessResult =
  | {
      quiz: QuizRow;
      article: ArticleRow;
      status: "ready";
    }
  | null;

async function processQuizRecord(quiz: QuizRow): Promise<ProcessResult> {
  let article: ArticleRow | null = null;
  let scrapingInProgress = false;
  try {
    article = await getArticleById(quiz.article_id);
    const fresh = isArticleFresh(article);
    let content: string | null = null;

    if (fresh && hasStoredContent(article)) {
      try {
        content = await downloadArticleContent(
          article.storage_path!,
          article.storage_metadata
        );
      } catch (error) {
        logger.warn(
          { articleId: article.id, err: error },
          "Failed to load stored article content; falling back to scraping"
        );
      }
    }

    if (!content) {
      scrapingInProgress = true;
      await updateArticleStatus(article.id, "scraping");
      const scraped = await scrapeArticle(article);

      if (scraped.kind === "article") {
        content = scraped.textContent;
        const upload = await uploadArticleBundle(article.id, scraped.normalizedUrl, {
          html: scraped.htmlContent,
          text: scraped.textContent,
        });
        const mergedMetadata = mergeMetadata(
          article.metadata as Record<string, unknown> | null,
          scraped.metadata
        );
        await updateArticleContent(article.id, {
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: "html",
        });
        article = {
          ...article,
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: "html",
        };
      } else {
        const upload = await uploadArticlePdf(
          scraped.pdfBuffer,
          scraped.normalizedUrl
        );
        content = [
          "PDF content stored for later processing.",
          `Bucket: ${upload.metadata.bucket}`,
          `Path: ${upload.path}`,
          `Fingerprint: ${upload.metadata.url_fingerprint}`,
        ].join("\n");
        const mergedMetadata = mergeMetadata(
          article.metadata as Record<string, unknown> | null,
          scraped.metadata
        );
        await updateArticleContent(article.id, {
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: "pdf",
        });
        article = {
          ...article,
          storage_path: upload.path,
          storage_metadata: upload.metadata,
          content_hash: upload.contentHash,
          metadata: mergedMetadata,
          content_medium: "pdf",
        };
      }
    } else {
      logger.debug(
        { articleId: article.id },
        "Article content still fresh; reusing cached text"
      );
    }

    await updateArticleStatus(article.id, "ready");
    scrapingInProgress = false;

    if (!content || !content.trim()) {
      throw new Error("Article text is empty; cannot generate questions.");
    }

    if (article.content_medium === "pdf") {
      throw new Error("PDF articles are not yet supported for question generation.");
    }

    const { workflow, model } = await generateQuizQuestions(article, content);
    await persistQuestions(quiz, workflow, model);
    await setSessionStatusByQuiz(quiz.id, "ready");
    logger.info(
      { quizId: quiz.id, articleId: article.id, normalizedUrl: article.normalized_url },
      "Quiz processed"
    );
    return { quiz, article, status: "ready" };
  } catch (error) {
    if (article && scrapingInProgress) {
      try {
        await updateArticleStatus(article.id, "skip_by_failure");
      } catch (statusError) {
        logger.error(
          { err: statusError, articleId: article?.id },
          "Failed to update article status"
        );
      }
    }
    const reason =
      error instanceof ScrapeError
        ? `${error.code}:${error.message}`
        : (error as Error).message;
    await markFailed(quiz.id, reason);
    throw error;
  }
}

export async function processNextPendingQuiz(): Promise<ProcessResult> {
  const quiz = await claimNextQuiz();
  if (!quiz) {
    logger.debug("No pending quizzes found");
    return null;
  }
  logger.info({ quizId: quiz.id }, "Processing next pending quiz");
  return processQuizRecord(quiz);
}

export async function processQuizById(
  quizId: number
): Promise<ProcessResult> {
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load quiz ${quizId}: ${error.message}`);
  }

  if (!quiz) {
    return null;
  }

  if (quiz.status !== "pending") {
    logger.info({ quizId }, "Resetting quiz before processing");
    const { data: updated, error: resetError } = await supabase
      .from("quizzes")
      .update({ status: "pending" })
      .eq("id", quizId)
      .select("*")
      .single();

    if (resetError || !updated) {
      throw new Error(`Failed to reset quiz ${quizId}: ${resetError?.message}`);
    }

    return processQuizRecord(updated as QuizRow);
  }

  const { data: claimed, error: claimError } = await supabase
    .from("quizzes")
    .update({ status: "processing" })
    .eq("id", quizId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (claimError && claimError.code !== "PGRST116") {
    throw new Error(`Failed to claim quiz ${quizId}: ${claimError.message}`);
  }

  if (!claimed) {
    throw new Error("Quiz was already processed.");
  }

  const claimedQuiz = claimed as QuizRow;
  logger.info({ quizId }, "Processing quiz by id");
  return processQuizRecord(claimedQuiz);
}
