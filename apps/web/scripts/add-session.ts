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

const [, , email, originalUrl] = process.argv;

if (!email || !originalUrl) {
  logger.error("Usage: npm run admin:add-session <user_email> <article_url>");
  process.exit(1);
}

async function main() {
  const { enqueueAndProcessSession } = await import(
    "@/lib/workflows/session-flow"
  );

  const result = await enqueueAndProcessSession(email, originalUrl);

  logger.info(
    {
      session: {
        token: result.session.session_token,
        status: result.session.status,
      },
      quizId: result.quiz.id,
      enqueued: result.enqueued,
    },
    "Session processed"
  );
}

main().catch((err) => {
  logger.error({ err }, "admin:add-session failed");
  process.exit(1);
});
