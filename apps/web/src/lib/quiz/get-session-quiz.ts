import { supabase } from "@/lib/supabase";
import { normalizeQuestion, QuizQuestion } from "@/lib/quiz/normalize-question";
import { normalizeHookQuestions } from "@/lib/quiz/normalize-hook-questions";
import { ArticleRow, HookStatus, QuizRow, SessionRow } from "@/types/db";

export type SessionQuizPayload = {
  session: SessionRow;
  quiz: QuizRow | null;
  article: ArticleRow | null;
  questions: QuizQuestion[];
  hookQuestions: QuizQuestion[];
  hookStatus: HookStatus | null;
};

function extractArticleTitle(article: ArticleRow | null): string | null {
  if (!article || !article.metadata || typeof article.metadata !== "object") {
    return null;
  }
  const metadata = article.metadata as Record<string, unknown>;
  const title = metadata["title"];
  return typeof title === "string" ? title : null;
}

function hydrateArticleTitle(article: ArticleRow | null): ArticleRow | null {
  if (!article) {
    return null;
  }
  const title = extractArticleTitle(article);
  if (article.title === title) {
    return article;
  }
  return { ...article, title };
}

export async function getSessionQuizPayload(
  sessionToken: string
): Promise<SessionQuizPayload> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (sessionError && sessionError.code !== "PGRST116") {
    throw new Error(`Failed to load session: ${sessionError.message}`);
  }

  if (!session) {
    throw new Error("Session not found.");
  }

  if (!session.quiz_id) {
    return {
      session: session as SessionRow,
      quiz: null,
      article: null,
      questions: [],
      hookQuestions: [],
      hookStatus: null,
    };
  }

  const [{ data: quiz, error: quizError }, { data: article, error: articleError }] =
    await Promise.all([
      supabase
        .from("quizzes")
        .select("*")
        .eq("id", session.quiz_id)
        .maybeSingle(),
      supabase
        .from("articles")
        .select("*")
        .eq("original_url", session.article_url)
        .maybeSingle(),
    ]);

  if (quizError && quizError.code !== "PGRST116") {
    throw new Error(`Failed to load quiz: ${quizError.message}`);
  }

  if (articleError && articleError.code !== "PGRST116") {
    throw new Error(`Failed to load article: ${articleError.message}`);
  }

  const hydratedArticle = hydrateArticleTitle(article as ArticleRow | null);

  if (!quiz) {
    return {
      session: session as SessionRow,
      quiz: null,
      article: hydratedArticle,
      questions: [],
      hookQuestions: [],
      hookStatus: null,
    };
  }

  const [
    { data: hookRow, error: hookError },
    { data: questionRows, error: questionError },
  ] = await Promise.all([
    supabase
      .from("hook_questions")
      .select("*")
      .eq("quiz_id", quiz.id)
      .maybeSingle(),
    supabase
      .from("questions")
      .select("*")
      .eq("quiz_id", quiz.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (hookError && hookError.code !== "PGRST116") {
    throw new Error(`Failed to load hook questions: ${hookError.message}`);
  }

  if (questionError) {
    throw new Error(`Failed to load questions: ${questionError.message}`);
  }

  const questions: QuizQuestion[] =
    questionRows
      ?.map((row) => normalizeQuestion(row))
      .filter((q): q is QuizQuestion => q !== null) ?? [];

  const hookQuestions =
    hookRow && hookRow.hooks ? normalizeHookQuestions(hookRow.hooks) : [];

  return {
    session: session as SessionRow,
    quiz: quiz as QuizRow,
    article: hydratedArticle,
    questions,
    hookQuestions,
    hookStatus: (hookRow?.status as HookStatus | undefined) ?? null,
  };
}
