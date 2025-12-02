import pLimit from "p-limit";
import { logger } from "@/lib/logger";
import { initSession } from "@/lib/workflows/session-init";
import { processNextPendingHookV2 } from "@/lib/workflows/process-quiz-v2";
import { concurrencyConfig } from "@/lib/config";

const sessionWorkerLimit = pLimit(concurrencyConfig.sessionWorkers);
const pendingWorkerLimit = pLimit(concurrencyConfig.pendingWorkers);

export async function enqueueAndProcessSessionV2(
  email: string,
  originalUrl: string
) {
  const result = await sessionWorkerLimit(() =>
    initSession(email, originalUrl)
  );

  pendingWorkerLimit(() =>
    processNextPendingHookV2().catch((err) => {
      logger.error({ err }, "Failed to process V2 quiz immediately");
    })
  );

  logger.info(
    {
      sessionToken: result.session.session_token,
      quizId: result.quiz.id,
      enqueued: result.enqueued,
    },
    "V2 Session enqueued"
  );

  return result;
}
