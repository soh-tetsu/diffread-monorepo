import pLimit from "p-limit";
import { logger } from "@/lib/logger";
import { initSession } from "@/lib/workflows/session-init";
import { processNextPendingQuiz } from "@/lib/workflows/process-quiz";
import { concurrencyConfig } from "@/lib/config";

const sessionWorkerLimit = pLimit(concurrencyConfig.sessionWorkers);
const pendingWorkerLimit = pLimit(concurrencyConfig.pendingWorkers);

export async function enqueueAndProcessSession(
  email: string,
  originalUrl: string
) {
  const result = await sessionWorkerLimit(() =>
    initSession(email, originalUrl)
  );

  pendingWorkerLimit(() =>
    processNextPendingQuiz().catch((err) => {
      logger.error({ err }, "Failed to process quiz immediately");
    })
  );

  logger.info(
    {
      sessionToken: result.session.session_token,
      quizId: result.quiz.id,
      enqueued: result.enqueued,
    },
    "Session enqueued"
  );

  return result;
}
