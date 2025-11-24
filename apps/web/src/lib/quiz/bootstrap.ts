import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";
import { ArticleRow, QuizRow } from "@/types/db";
import { normalizeUrl } from "@/lib/utils/normalize-url";

async function createPendingQuiz(articleId: number): Promise<QuizRow> {
  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      article_id: articleId,
      quiz_id: randomUUID(),
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to enqueue quiz: ${error?.message}`);
  }

  return data as QuizRow;
}

async function resetFailedQuiz(quiz: QuizRow): Promise<QuizRow> {
  const { data, error } = await supabase
    .from("quizzes")
    .update({
      status: "pending",
      model_used: null,
    })
    .eq("id", quiz.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to reset quiz: ${error?.message}`);
  }

  return data as QuizRow;
}

export type BootstrapQuizResult =
  {
    normalizedUrl: string;
    article: ArticleRow;
    quiz: QuizRow;
    enqueued: boolean;
  };

export async function bootstrapQuiz(originalUrl: string): Promise<BootstrapQuizResult> {
  const normalizedUrl = normalizeUrl(originalUrl);

  const { data: existingArticle, error: articleError } = await supabase
    .from("articles")
    .select("*")
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();

  if (articleError && articleError.code !== "PGRST116") {
    throw new Error(`Failed to check article: ${articleError.message}`);
  }

  let article = existingArticle as ArticleRow | null;

  if (!article) {
    const { data: insertedArticle, error: insertError } = await supabase
      .from("articles")
      .insert({
        normalized_url: normalizedUrl,
        original_url: originalUrl,
      })
      .select("*")
      .single();

    if (insertError || !insertedArticle) {
      throw new Error(`Failed to insert article: ${insertError?.message}`);
    }

    article = insertedArticle as ArticleRow;
  }

  const { data: latestQuiz, error: quizError } = await supabase
    .from("quizzes")
    .select("*")
    .eq("article_id", article.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quizError && quizError.code !== "PGRST116") {
    throw new Error(`Failed to load quiz status: ${quizError.message}`);
  }

  if (!latestQuiz) {
    return {
      normalizedUrl,
      article,
      quiz: await createPendingQuiz(article.id),
      enqueued: true,
    };
  }

  if (latestQuiz.status === "failed") {
    return {
      normalizedUrl,
      article,
      quiz: await resetFailedQuiz(latestQuiz as QuizRow),
      enqueued: true,
    };
  }

  return {
    normalizedUrl,
    article,
    quiz: latestQuiz as QuizRow,
    enqueued: false,
  };
}
