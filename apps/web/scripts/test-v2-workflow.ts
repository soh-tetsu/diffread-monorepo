#!/usr/bin/env bun

import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";

import {
  createLLMClient,
  analysisPromptV2,
  hookGeneratorPromptV2,
  AnalysisResponseSchema,
  HookGeneratorV2ResponseSchema,
  type AnalysisResponse,
  type HookGeneratorV2Response,
} from "@diffread/question-engine";

import type { ArticleRow } from "@/types/db";
import { scrapeArticle, ScrapeError } from "@/lib/quiz/scraper";
import { logger } from "@/lib/logger";

function requireUrl(): string {
  const [, , input] = process.argv;
  if (!input) {
    throw new Error("Usage: bun run test:v2 <url>");
  }
  try {
    return new URL(input).toString();
  } catch {
    throw new Error(`Invalid URL provided: ${input}`);
  }
}

function buildAdHocArticle(url: string): ArticleRow {
  return {
    id: Date.now(),
    normalized_url: url,
    original_url: url,
    content_hash: null,
    storage_path: null,
    last_scraped_at: null,
    status: "pending",
    metadata: null,
    storage_metadata: null,
    content_medium: "unknown",
  };
}

const BASE_ENV_PATH = path.resolve(process.cwd(), ".env");
const LOCAL_ENV_PATH = path.resolve(process.cwd(), ".env.local");
const baseEnvResult = dotenv.config({ path: BASE_ENV_PATH });
const localEnvResult = dotenv.config({ path: LOCAL_ENV_PATH, override: true });

async function main() {
  logger.info(
    {
      cwd: process.cwd(),
      envFiles: {
        [BASE_ENV_PATH]: baseEnvResult.error ? "missing" : "loaded",
        [LOCAL_ENV_PATH]: localEnvResult.error ? "missing" : "loaded",
      },
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "[set]" : "[missing]",
      GEMINI_MODEL: process.env.GEMINI_MODEL ?? "[default]",
    },
    "Env debug"
  );

  const url = requireUrl();
  const article = buildAdHocArticle(url);

  try {
    const scraped = await scrapeArticle(article);

    if (scraped.kind !== "article") {
      throw new Error(
        "Scraper returned PDF. V2 workflow currently expects article text."
      );
    }

    logger.info(
      { textLength: scraped.textContent.length, url },
      "Article scraped"
    );

    // Setup executor
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }

    const executor = createLLMClient({
      apiKey,
      model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "text/plain",
      thinkingConfig: {
        includeThoughts: false,
        thinkingBudget: 0,
      },
    });

    // Step 1: Run analysis prompt
    logger.info("Running analysis prompt...");
    const analysisStart = Date.now();
    const analysisResponse: AnalysisResponse = await executor.execute(
      analysisPromptV2,
      { text: scraped.textContent },
      AnalysisResponseSchema
    );
    const analysisDuration = Date.now() - analysisStart;

    logger.info(
      {
        duration: analysisDuration,
        archetype: analysisResponse.metadata.archetype,
        logicalSchema: analysisResponse.metadata.logical_schema,
        domain: analysisResponse.metadata.domain,
        coreThesis: analysisResponse.metadata.core_thesis,
        structuralOutline: analysisResponse.metadata.structural_skeleton.outline,
        pedagogyHooks: analysisResponse.metadata.pedagogy.hooks,
      },
      "Analysis completed"
    );

    // Step 2: Run hook generation prompt
    logger.info("Running hook generation prompt...");
    const hookStart = Date.now();
    const hookResponse: HookGeneratorV2Response = await executor.execute(
      hookGeneratorPromptV2,
      {
        metadata: analysisResponse.metadata,
      },
      HookGeneratorV2ResponseSchema
    );
    const hookDuration = Date.now() - hookStart;

    logger.info(
      {
        duration: hookDuration,
        quizCardCount: hookResponse.quiz_cards.length,
        quizCards: hookResponse.quiz_cards,
        hookGenerationRationale: hookResponse.rationale,
      },
      "Hook questions generated"
    );

    const totalDuration = analysisDuration + hookDuration;
    logger.info({ totalDuration }, "V2 workflow completed successfully");

  } catch (error) {
    if (error instanceof ScrapeError) {
      logger.error(
        { code: error.code, err: error },
        "[scrape] Scraper failure"
      );
    } else {
      logger.error({ err: error }, "[pipeline] V2 workflow failed");
    }
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Task failed");
  process.exit(1);
});
