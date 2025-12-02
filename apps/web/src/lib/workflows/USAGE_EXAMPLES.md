# V2 Curiosity Question Workflow - Usage Examples

## Example 1: Basic Usage in Worker

Replace the existing hook generation worker:

```typescript
// apps/web/src/lib/workers/hook-worker.ts
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";
import type { QuizRow } from "@/types/db";

export async function processHookJob(quizId: number): Promise<void> {
  const quiz = await getQuizById(quizId);

  const result = await buildCuriosityQuestionsV2(quiz);

  console.log(`Generated ${result.hookQuestions.length} curiosity questions`);
  console.log(`Archetype: ${result.metadata.archetype}`);
  console.log(`Language: ${result.metadata.language}`);
}
```

## Example 2: API Route with Retry Logic

```typescript
// apps/web/app/api/curiosity-questions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildCuriosityQuestionsV2, retryCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";
import { PipelineError } from "@diffread/question-engine";

export async function POST(request: NextRequest) {
  try {
    const { quizId, retry } = await request.json();

    if (!quizId) {
      return NextResponse.json(
        { error: "quizId is required" },
        { status: 400 }
      );
    }

    const quiz = await getQuizById(quizId);

    // Use retry function if requested
    const result = retry
      ? await retryCuriosityQuestionsV2(quiz)
      : await buildCuriosityQuestionsV2(quiz);

    return NextResponse.json({
      success: true,
      data: {
        hookQuestions: result.hookQuestions,
        metadata: result.metadata,
        hookContext: result.hookContext,
      },
    });

  } catch (error) {
    if (error instanceof PipelineError) {
      return NextResponse.json(
        {
          error: "Pipeline failed",
          step: error.stepName,
          message: error.message,
          canRetry: error.stepName === "hook-generation-llm-v2",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## Example 3: Admin Script to Process Pending Quizzes

```typescript
// apps/web/scripts/process-pending-curiosity-questions.ts
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";
import { supabase } from "@/lib/supabase";
import pLimit from "p-limit";

const CONCURRENCY = 3;

async function main() {
  // Get all quizzes with pending hook questions
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select(`
      *,
      hook_questions!inner(*)
    `)
    .eq("hook_questions.status", "pending")
    .limit(100);

  if (!quizzes || quizzes.length === 0) {
    console.log("No pending quizzes found");
    return;
  }

  console.log(`Processing ${quizzes.length} pending quizzes...`);

  const limit = pLimit(CONCURRENCY);
  let successCount = 0;
  let failCount = 0;

  const results = await Promise.allSettled(
    quizzes.map((quiz) =>
      limit(async () => {
        try {
          await buildCuriosityQuestionsV2(quiz);
          successCount++;
          console.log(`✓ Quiz ${quiz.id} completed`);
        } catch (error) {
          failCount++;
          console.error(`✗ Quiz ${quiz.id} failed:`, error);
        }
      })
    )
  );

  console.log(`\nResults:`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
}

main().catch(console.error);
```

Usage:
```bash
cd apps/web
bun run tsx scripts/process-pending-curiosity-questions.ts
```

## Example 4: Integrate into Existing Session Flow

```typescript
// apps/web/src/lib/workflows/session-flow.ts
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";

export async function initSession(email: string, url: string) {
  // 1. Create session and quiz records
  const session = await createSession(email, url);
  const quiz = await createQuiz(session);

  // 2. Trigger curiosity question generation (async)
  buildCuriosityQuestionsV2(quiz).catch((error) => {
    console.error("Background curiosity question generation failed:", error);
  });

  // 3. Return session token immediately
  return { token: session.session_token };
}
```

## Example 5: Compare V1 vs V2 Quality

```typescript
// apps/web/scripts/compare-v1-v2.ts
import { buildHookQuestionsForQuiz } from "@/lib/workflows/hook-generation";
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";

async function compareWorkflows(quizId: number) {
  const quiz = await getQuizById(quizId);

  console.log("\n=== Running V1 Workflow ===");
  const startV1 = Date.now();
  const v1Result = await buildHookQuestionsForQuiz(quiz);
  const durationV1 = Date.now() - startV1;

  console.log("\n=== Running V2 Workflow ===");
  const startV2 = Date.now();
  const v2Result = await buildCuriosityQuestionsV2(quiz);
  const durationV2 = Date.now() - startV2;

  console.log("\n=== Comparison ===");
  console.log(`V1 Duration: ${durationV1}ms`);
  console.log(`V2 Duration: ${durationV2}ms`);
  console.log(`V1 Questions: ${v1Result.hookQuestions.length}`);
  console.log(`V2 Questions: ${v2Result.hookQuestions.length}`);
  console.log(`V1 Metadata Keys: ${Object.keys(v1Result.metadata).length}`);
  console.log(`V2 Metadata Keys: ${Object.keys(v2Result.metadata).length}`);

  console.log("\n=== V1 Questions ===");
  v1Result.hookQuestions.forEach((q: any, i: number) => {
    console.log(`${i + 1}. [${q.type}] ${q.question}`);
  });

  console.log("\n=== V2 Questions ===");
  v2Result.hookQuestions.forEach((q, i) => {
    console.log(`${i + 1}. [${q.type}] ${q.question}`);
  });

  console.log("\n=== V2 Hook Context ===");
  console.log("Core Thesis:", v2Result.hookContext.core_thesis);
  console.log("Key Claims:", v2Result.hookContext.key_claims);
  console.log("Surprising Facts:", v2Result.hookContext.surprising_facts);
  console.log("Counter-Intuitive:", v2Result.hookContext.counter_intuitive_points);
}

const quizId = parseInt(process.argv[2]);
if (!quizId) {
  console.error("Usage: bun run tsx scripts/compare-v1-v2.ts <quizId>");
  process.exit(1);
}

compareWorkflows(quizId).catch(console.error);
```

Usage:
```bash
bun run tsx scripts/compare-v1-v2.ts 123
```

## Example 6: Custom Database Client with Caching

For better performance, implement a custom database client with proper caching:

```typescript
// apps/web/src/lib/workflows/curiosity-question-workflow-v2.ts

import { getArticleById } from "@/lib/db/articles";
import { getHookQuestionsByQuizId } from "@/lib/db/hooks";

function createDatabaseClient(quizId: number, articleId: number) {
  return {
    articles: {
      async findById(_quizId: number) {
        // Load article by actual article_id
        const article = await getArticleById(articleId);

        // Check if metadata contains required V2 fields
        if (
          article?.metadata &&
          typeof article.metadata === "object" &&
          "archetype" in article.metadata &&
          "hook_context_v2" in article.metadata
        ) {
          return {
            metadata: article.metadata as any,
          };
        }

        return null;
      },

      async saveMetadata(_quizId: number, metadata: any) {
        // Get existing metadata
        const article = await getArticleById(articleId);

        // Merge with new metadata (preserving other fields)
        const merged = {
          ...article.metadata,
          ...metadata,
        };

        await saveArticleMetadata(articleId, merged);
      },
    },

    hookQuestions: {
      async getByQuizId(quizId: number) {
        const existing = await getHookQuestionsByQuizId(quizId);

        // Only return if ready and has hooks
        if (
          existing &&
          existing.status === "ready" &&
          existing.hooks &&
          Array.isArray(existing.hooks) &&
          existing.hooks.length > 0
        ) {
          return existing;
        }

        return null;
      },

      async upsert(data: any) {
        await upsertHookQuestions(data);
      },
    },
  };
}
```

## Example 7: Feature Flag Integration

Use a feature flag to gradually roll out V2:

```typescript
// apps/web/src/lib/feature-flags.ts
export function shouldUseV2Workflow(quizId: number): boolean {
  // Option 1: Environment variable
  if (process.env.USE_V2_WORKFLOW === "true") {
    return true;
  }

  // Option 2: Percentage rollout
  const rolloutPercentage = parseInt(process.env.V2_ROLLOUT_PERCENTAGE || "0");
  if (rolloutPercentage > 0) {
    return (quizId % 100) < rolloutPercentage;
  }

  // Option 3: Allowlist
  const allowlist = process.env.V2_QUIZ_ALLOWLIST?.split(",").map(Number) || [];
  if (allowlist.includes(quizId)) {
    return true;
  }

  return false;
}

// apps/web/src/lib/workflows/hook-dispatcher.ts
import { buildHookQuestionsForQuiz } from "@/lib/workflows/hook-generation";
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";
import { shouldUseV2Workflow } from "@/lib/feature-flags";

export async function buildHooks(quiz: QuizRow, article?: ArticleRow) {
  if (shouldUseV2Workflow(quiz.id)) {
    console.log(`Using V2 workflow for quiz ${quiz.id}`);
    return buildCuriosityQuestionsV2(quiz, article);
  } else {
    console.log(`Using V1 workflow for quiz ${quiz.id}`);
    return buildHookQuestionsForQuiz(quiz, article);
  }
}
```

Environment variables:
```bash
# Enable for all quizzes
USE_V2_WORKFLOW=true

# Or enable for 25% of traffic
V2_ROLLOUT_PERCENTAGE=25

# Or enable for specific quizzes
V2_QUIZ_ALLOWLIST=123,456,789
```

## Example 8: Monitoring & Metrics

Track V2 workflow metrics:

```typescript
// apps/web/src/lib/workflows/curiosity-question-workflow-v2.ts

import { logger } from "@/lib/logger";

export async function buildCuriosityQuestionsV2(
  quiz: QuizRow,
  providedArticle?: ArticleRow
) {
  const startTime = Date.now();
  let stepDurations: Record<string, number> = {};

  try {
    // ... existing code ...

    const result = await runCuriosityQuestionWorkflow(input, dependencies);

    const totalDuration = Date.now() - startTime;

    logger.info({
      quizId: quiz.id,
      workflow: "curiosity-questions-v2",
      duration: totalDuration,
      stepDurations,
      questionCount: result.hookQuestions.length,
      archetype: result.metadata.archetype,
      language: result.metadata.language,
      cached: totalDuration < 500, // If very fast, likely cached
    }, "Workflow completed");

    return { ...result, article };

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error({
      quizId: quiz.id,
      workflow: "curiosity-questions-v2",
      duration: totalDuration,
      error: error instanceof Error ? error.message : String(error),
    }, "Workflow failed");

    throw error;
  }
}
```

## Example 9: Testing with Mock Data

```typescript
// apps/web/src/lib/workflows/__tests__/curiosity-question-workflow-v2.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCuriosityQuestionsV2 } from "../curiosity-question-workflow-v2";

describe("buildCuriosityQuestionsV2", () => {
  const mockQuiz = {
    id: 123,
    quiz_id: "test-quiz",
    article_id: 456,
    status: "pending" as const,
    model_used: null,
    created_at: new Date().toISOString(),
  };

  const mockArticle = {
    id: 456,
    normalized_url: "https://example.com/article",
    original_url: "https://example.com/article",
    content_hash: "hash123",
    storage_path: "article/456/content.md",
    last_scraped_at: new Date().toISOString(),
    status: "ready" as const,
    metadata: null,
    storage_metadata: null,
    content_medium: "html" as const,
    title: "Test Article",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate 3 curiosity questions", async () => {
    const result = await buildCuriosityQuestionsV2(mockQuiz, mockArticle);

    expect(result.hookQuestions).toHaveLength(3);
    expect(result.hookQuestions[0].type).toBe("common_sense_test");
    expect(result.hookQuestions[1].type).toBe("surprising_claim");
    expect(result.hookQuestions[2].type).toBe("prediction_test");
  });

  it("should include metadata and hook context", async () => {
    const result = await buildCuriosityQuestionsV2(mockQuiz, mockArticle);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.archetype).toBeDefined();
    expect(result.hookContext).toBeDefined();
    expect(result.hookContext.core_thesis).toBeDefined();
    expect(result.hookContext.key_claims).toBeInstanceOf(Array);
  });

  it("should handle PDF rejection", async () => {
    const pdfArticle = {
      ...mockArticle,
      content_medium: "pdf" as const,
    };

    await expect(
      buildCuriosityQuestionsV2(mockQuiz, pdfArticle)
    ).rejects.toThrow("PDF articles are not supported");
  });
});
```

## Example 10: Debugging Failed Workflows

Script to inspect failed workflows:

```typescript
// apps/web/scripts/debug-failed-workflow.ts
import { getHookQuestionsByQuizId } from "@/lib/db/hooks";
import { getArticleById } from "@/lib/db/articles";

async function debugFailedWorkflow(quizId: number) {
  console.log(`\n=== Debugging Quiz ${quizId} ===\n`);

  // Check hook_questions status
  const hooks = await getHookQuestionsByQuizId(quizId);
  console.log("Hook Questions Status:", hooks?.status);
  console.log("Error Message:", hooks?.error_message);
  console.log("Model Version:", hooks?.model_version);
  console.log("Has Hooks:", hooks?.hooks ? "Yes" : "No");

  // Check article metadata
  const quiz = await getQuizById(quizId);
  const article = await getArticleById(quiz.article_id);

  console.log("\nArticle Metadata:");
  console.log("  Has archetype:", article.metadata?.archetype ? "Yes" : "No");
  console.log("  Has hook_context_v2:", article.metadata?.hook_context_v2 ? "Yes" : "No");

  if (article.metadata?.archetype) {
    console.log("  Archetype:", article.metadata.archetype);
  }

  if (article.metadata?.hook_context_v2) {
    console.log("  Hook Context Keys:", Object.keys(article.metadata.hook_context_v2));
  }

  console.log("\nDiagnosis:");

  if (!hooks) {
    console.log("❌ No hook_questions record found");
  } else if (hooks.status === "failed") {
    console.log("❌ Workflow failed at some step");
    console.log("   Error:", hooks.error_message);
  } else if (!article.metadata?.archetype) {
    console.log("❌ Step 1 (analysis) not completed");
  } else if (!article.metadata?.hook_context_v2) {
    console.log("❌ Step 1 completed but hook_context_v2 missing");
  } else if (!hooks.hooks) {
    console.log("❌ Step 3 (hook generation) not completed");
  } else {
    console.log("✅ Workflow appears complete");
  }
}

const quizId = parseInt(process.argv[2]);
debugFailedWorkflow(quizId).catch(console.error);
```

Usage:
```bash
bun run tsx scripts/debug-failed-workflow.ts 123
```
