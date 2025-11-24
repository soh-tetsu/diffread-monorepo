import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { enqueueAndProcessSession } from "@/lib/workflows/session-flow";
import { supabase } from "@/lib/supabase";

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

    return NextResponse.json({
      sessionToken: result.session.session_token,
      status: result.session.status,
    });
  } catch (error) {
    logger.error({ err: error }, "POST /api/sessions failed");
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { message: "Missing session token." },
        { status: 400 }
      );
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .select(
        `
        *,
        quiz:quizzes!sessions_quiz_id_fkey(id, status, model_used)
      `
      )
      .eq("session_token", token)
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

    const failureReason =
      session.status === "errored" ? session.quiz?.model_used ?? null : null;

    return NextResponse.json({
      status: session.status,
      quizId: session.quiz_id,
      failureReason,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
