import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { enqueueAndProcessSession } from "@/lib/workflows/session-flow";
import { processQuizByIdV2 as processQuizById } from "@/lib/workflows/process-quiz-v2";
import { supabase } from "@/lib/supabase";
import { getSessionByToken } from "@/lib/db/sessions";
import { normalizeQuestion, QuizQuestion } from "@/lib/quiz/normalize-question";
import type { QuizStatus } from "@/types/db";

export async function POST(request: Request) {
  try {
    const { currentToken, articleUrl } = await request.json();

    if (!currentToken || !articleUrl) {
      return NextResponse.json(
        { message: "Missing currentToken or articleUrl." },
        { status: 400 }
      );
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("session_token", currentToken)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json(
        { message: "Failed to load session." },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { message: "Session not found." },
        { status: 404 }
      );
    }

    const result = await enqueueAndProcessSession(
      session.user_email,
      articleUrl
    );

    const { data: latestQuiz, error: latestError } = await supabase
      .from("quizzes")
      .select("*")
      .eq("id", result.quiz.id)
      .maybeSingle();

    if (latestError && latestError.code !== "PGRST116") {
      throw new Error(`Failed to refresh quiz: ${latestError.message}`);
    }

    if (!latestQuiz) {
      return NextResponse.json(
        { message: "Quiz not found." },
        { status: 404 }
      );
    }

    const status = latestQuiz.status as QuizStatus;
    const needsReset = new Set<QuizStatus>([
      "not_required",
      "failed",
    ]);

    if (status === "ready") {
      return NextResponse.json({
        sessionToken: result.session.session_token,
        status: "ready",
      });
    }

    if (status === "pending" || status === "processing") {
      await processQuizById(latestQuiz.id);
      return NextResponse.json({
        sessionToken: result.session.session_token,
        status: "processing",
      });
    }

    if (needsReset.has(status)) {
      const { error: updateError } = await supabase
        .from("quizzes")
        .update({ status: "pending" })
        .eq("id", latestQuiz.id);

      if (updateError) {
        throw new Error(
          `Failed to enqueue instruction workflow: ${updateError.message}`
        );
      }

      await processQuizById(latestQuiz.id);

      return NextResponse.json({
        sessionToken: result.session.session_token,
        status: "pending",
      });
    }

    return NextResponse.json({
      sessionToken: result.session.session_token,
      status,
    });

    return NextResponse.json({
      sessionToken: result.session.session_token,
      status: result.session.status,
    });
  } catch (error) {
    logger.error({ err: error }, "POST /api/instructions failed");
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("q");

    if (!token) {
      return NextResponse.json(
        { message: "Missing session token." },
        { status: 400 }
      );
    }

    const session = await getSessionByToken(token);

    if (!session) {
      return NextResponse.json(
        { message: "Session not found." },
        { status: 404 }
      );
    }

    const quizId = session.quiz_id;
    let quizStatus: QuizStatus = "not_required";
    let failureReason: string | null = null;
    let questions: QuizQuestion[] = [];

    if (quizId) {
      const { data: quiz, error: quizError } = await supabase
        .from("quizzes")
        .select("status, model_used")
        .eq("id", quizId)
        .maybeSingle();

      if (quizError && quizError.code !== "PGRST116") {
        logger.error({ err: quizError }, "Failed to load quiz");
      } else if (quiz) {
        quizStatus = quiz.status as QuizStatus;
        if (session.status === "errored") {
          failureReason = quiz.model_used ?? null;
        }

        // Fetch questions if quiz is ready
        if (quizStatus === "ready") {
          const { data: questionRows, error: questionError } = await supabase
            .from("questions")
            .select("*")
            .eq("quiz_id", quizId)
            .order("sort_order", { ascending: true });

          if (questionError) {
            logger.error({ err: questionError }, "Failed to load questions");
          } else if (questionRows) {
            questions = questionRows
              .map((row) => normalizeQuestion(row))
              .filter((q): q is QuizQuestion => q !== null);
          }
        }
      }
    }

    return NextResponse.json({
      status: quizStatus,
      questions,
      failureReason,
    });
  } catch (error) {
    logger.error({ err: error }, "GET /api/instructions failed");
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
