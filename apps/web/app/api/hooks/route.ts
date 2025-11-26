import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getSessionByToken } from "@/lib/db/sessions";
import { getArticleById } from "@/lib/db/articles";
import { initSession } from "@/lib/workflows/session-init";
import { getHookQuestionsByQuizId, upsertHookQuestions } from "@/lib/db/hooks";
import { processQuizById } from "@/lib/workflows/process-quiz";

function parseForceFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const currentToken = payload?.currentToken;
    const articleUrl = payload?.articleUrl;
    const force = parseForceFlag(payload?.force);

    if (!currentToken || !articleUrl) {
      return NextResponse.json(
        { message: "Missing currentToken or articleUrl." },
        { status: 400 }
      );
    }

    const currentSession = await getSessionByToken(currentToken);
    if (!currentSession) {
      return NextResponse.json(
        { message: "Session not found." },
        { status: 404 }
      );
    }

    const sessionResult = await initSession(
      currentSession.user_email,
      articleUrl
    );

    if (force) {
      await upsertHookQuestions({
        quizId: sessionResult.quiz.id,
        status: "pending",
      });
    }

    const existingHooks = await getHookQuestionsByQuizId(
      sessionResult.quiz.id
    );
    if (!force && existingHooks?.status === "ready" && existingHooks.hooks) {
      return NextResponse.json({
        sessionToken: sessionResult.session.session_token,
        quizId: sessionResult.quiz.id,
        status: existingHooks.status,
        hooks: existingHooks.hooks,
        modelVersion: existingHooks.model_version,
        errorMessage: existingHooks.error_message,
      });
    }

    await processQuizById(sessionResult.quiz.id);

    const refreshedHooks = await getHookQuestionsByQuizId(
      sessionResult.quiz.id
    );
    if (!refreshedHooks || refreshedHooks.status !== "ready") {
      return NextResponse.json(
        { message: "Hook questions are still pending. Try again shortly." },
        { status: 202 }
      );
    }

    const articleRecord = await getArticleById(sessionResult.quiz.article_id);

    return NextResponse.json({
      sessionToken: sessionResult.session.session_token,
      quizId: sessionResult.quiz.id,
      status: refreshedHooks.status,
      hooks: refreshedHooks.hooks,
      modelVersion: refreshedHooks.model_version,
      errorMessage: refreshedHooks.error_message,
      metadata:
        (articleRecord.metadata?.analysis as Record<string, unknown>) ?? null,
      article: {
        id: articleRecord.id,
        originalUrl: articleRecord.original_url,
        title:
          typeof (articleRecord.metadata?.title as unknown) === "string"
            ? (articleRecord.metadata?.title as string)
            : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "POST /api/hooks failed");
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const quizIdParam = searchParams.get("quizId");
    const sessionToken = searchParams.get("sessionToken");

    let quizId: number | null =
      quizIdParam !== null ? Number(quizIdParam) : null;

    if ((!quizId || Number.isNaN(quizId)) && sessionToken) {
      const session = await getSessionByToken(sessionToken);
      quizId = session?.quiz_id ?? null;
    }

    if (!quizId || Number.isNaN(quizId)) {
      return NextResponse.json(
        { message: "Provide quizId or sessionToken." },
        { status: 400 }
      );
    }

    const record = await getHookQuestionsByQuizId(quizId);

    if (!record) {
      return NextResponse.json({
        quizId,
        status: "pending",
        hooks: null,
      });
    }

    return NextResponse.json({
      quizId,
      status: record.status,
      hooks: record.hooks,
      errorMessage: record.error_message,
      modelVersion: record.model_version,
      updatedAt: record.updated_at,
    });
  } catch (error) {
    logger.error({ err: error }, "GET /api/hooks failed");
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
