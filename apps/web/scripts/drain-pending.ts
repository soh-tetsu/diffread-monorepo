#!/usr/bin/env tsx

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { logger } from "@/lib/logger";

const envPath = resolve(process.cwd(), ".env.local");
logger.info(process.cwd());

if (existsSync(envPath)) {
  config({ path: envPath });
}

async function main() {
  const { processNextPendingQuiz } = await import("@/lib/workflows/process-quiz");

  const result = await processNextPendingQuiz();
  if (result) {
    logger.info(
      { quizId: result.quiz.id, article: result.article.normalized_url },
      "Drained pending quiz"
    );
  } else {
    logger.info("No pending quizzes.");
  }
}

main().catch((err) => {
  logger.error({ err }, "admin:drain-pending failed");
  process.exit(1);
});
