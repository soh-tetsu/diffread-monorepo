#!/usr/bin/env tsx

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { logger } from "@/lib/logger";

const envPath = resolve(process.cwd(), ".env.local");
logger.info(process.cwd());

const [, , sessionToken] = process.argv;

if (!sessionToken) {
  logger.error("Usage: npm run admin:drain-session <session_token>");
  process.exit(1);
}

if (existsSync(envPath)) {
  config({ path: envPath });
}

async function main() {
  const [{ getSessionByToken }, { enqueueAndProcessSession }, { processQuizById }] =
    await Promise.all([
      import("@/lib/db/sessions"),
      import("@/lib/workflows/session-flow"),
      import("@/lib/workflows/process-quiz"),
    ]);
  const session = await getSessionByToken(sessionToken);
  if (!session) {
    throw new Error("Session not found.");
  }

  const result = await enqueueAndProcessSession(
    session.user_email,
    session.article_url
  );

  logger.info(
    {
      session: result.session.session_token,
      status: result.session.status,
      quizStatus: result.quiz.status,
    },
    "Session synchronized"
  );

  if (!result.session.quiz_id) {
    logger.warn("Session has no quiz; nothing to drain.");
    return;
  }

  const outcome = await processQuizById(result.session.quiz_id);
  if (outcome) {
    logger.info(
      { quizId: outcome.quiz.id, article: outcome.article.normalized_url },
      "Quiz drained"
    );
  } else {
    logger.warn("Quiz was already processed or missing.");
  }
}

main().catch((err) => {
  logger.error({ err }, "admin:drain-session failed");
  process.exit(1);
});
