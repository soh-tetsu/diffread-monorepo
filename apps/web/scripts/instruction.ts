#!/usr/bin/env tsx

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { logger } from "@/lib/logger";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
}

const [, , email, articleUrl] = process.argv;

if (!email || !articleUrl) {
  logger.error(
    "Usage: bun run admin:instruction <user_email> <article_url>"
  );
  process.exit(1);
}

async function main() {
  const [
    { enqueueAndProcessSession },
    { processQuizByIdV2: processQuizById },
    { supabase },
  ] =
    await Promise.all([
      import("@/lib/workflows/session-flow"),
      import("@/lib/workflows/process-quiz-v2"),
      import("@/lib/supabase"),
    ]);

  const result = await enqueueAndProcessSession(email, articleUrl);

  await processQuizById(result.quiz.id);

  const { data: latestQuiz, error: latestError } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", result.quiz.id)
    .maybeSingle();

  if (latestError && latestError.code !== "PGRST116") {
    throw new Error(`Failed to refresh quiz: ${latestError.message}`);
  }

  if (!latestQuiz) {
    throw new Error("Quiz not found after session creation.");
  }

  const status = latestQuiz.status as
    | "pending"
    | "processing"
    | "ready"
    | "failed"
    | "not_required"
    | "skip_by_admin"
    | "skip_by_failure";

  const needsReset = new Set([
    "not_required",
    "failed",
  ]);

  let instructionStatus: string = status;

  if (status === "ready") {
    logger.info(
      { quizId: latestQuiz.id, status },
      "Instruction workflow already ready; skipping"
    );
  } else if (status === "pending" || status === "processing") {
    await processQuizById(latestQuiz.id);
    instructionStatus = "processing";
  } else if (needsReset.has(status)) {
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
    instructionStatus = "pending";
  }

  logger.info(
    {
      session: {
        token: result.session.session_token,
        status: result.session.status,
      },
      quizId: result.quiz.id,
      instructionStatus,
    },
    "Instruction workflow completed"
  );
}

main().catch((err) => {
  logger.error({ err }, "admin:instruction failed");
  process.exit(1);
});
