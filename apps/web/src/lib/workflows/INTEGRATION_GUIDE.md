# V2 Curiosity Question Workflow - Integration Guide

## Overview

The V2 workflow replaces the old `buildHookQuestionsForQuiz` with a new pipeline-based approach that:
- Generates metadata AND hook context in a single LLM call
- Persists results after each LLM step for granular retry
- Uses idempotency to skip completed steps on retry
- Generates 3 curiosity-driven questions (not just "myth-buster" strategy)

## Quick Start

### 1. Replace V1 Call

**Before (V1):**
```typescript
import { buildHookQuestionsForQuiz } from "@/lib/workflows/hook-generation";

const result = await buildHookQuestionsForQuiz(quiz, article);
// result: { article, metadata, hookQuestions }
```

**After (V2):**
```typescript
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";

const result = await buildCuriosityQuestionsV2(quiz, article);
// result: { article, metadata, hookContext, hookQuestions, analysisRationale, hookGenerationRationale }
```

### 2. Use in Worker/Job Processor

```typescript
// apps/web/src/lib/workers/hook-worker.ts
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";

export async function processHookJob(quiz: QuizRow) {
  try {
    const result = await buildCuriosityQuestionsV2(quiz);

    return {
      success: true,
      hookQuestions: result.hookQuestions,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error("Hook job failed:", error);
    throw error;
  }
}
```

### 3. Use in API Route

```typescript
// apps/web/app/api/hooks/route.ts
import { buildCuriosityQuestionsV2 } from "@/lib/workflows/curiosity-question-workflow-v2";

export async function POST(request: Request) {
  const { quizId } = await request.json();

  const quiz = await getQuizById(quizId);
  const result = await buildCuriosityQuestionsV2(quiz);

  return Response.json({
    hookQuestions: result.hookQuestions,
    metadata: result.metadata,
  });
}
```

## Key Differences from V1

### 1. Single Analysis Step

**V1:**
- `ensureArticleAnalysis()` → extracts metadata only
- `generateHookWorkflow()` → uses metadata to generate hooks

**V2:**
- `analysisLLMStep` → extracts metadata AND hook context in one call
- `hookGenerationLLMStep` → uses hook context to generate hooks

**Why:** Reduces LLM calls and ensures context is tailored for hook generation.

### 2. Database Persistence Strategy

**V1:**
```typescript
// Analysis result saved to articles.metadata.analysis
await saveArticleMetadata(articleId, {
  ...existing,
  analysis: metadata
});

// Hooks saved to hook_questions table
await upsertHookQuestions({ quizId, hooks, status: "ready" });
```

**V2:**
```typescript
// Analysis result saved to articles.metadata (nested structure)
await saveArticleMetadata(articleId, {
  ...metadata,
  hook_context_v2: hookContext
});

// Hooks saved to hook_questions table (same as V1)
await upsertHookQuestions({ quizId, hooks, status: "ready" });
```

**Why:** Hook context is persisted for debugging and potential reuse.

### 3. Retry Behavior

**V1:**
```typescript
// If hook generation fails, you must:
// 1. Re-analyze the article (duplicate LLM call)
// 2. Re-generate hooks

await buildHookQuestionsForQuiz(quiz); // Full re-execution
```

**V2:**
```typescript
// If hook generation fails at Step 3:
await buildCuriosityQuestionsV2(quiz);

// Automatically skips:
// - Step 1 (loads metadata from DB)
// - Step 2 (already persisted)
// Retries:
// - Step 3 (hook generation)
// - Step 4 (persist hooks)
```

**Why:** Saves cost and time by avoiding duplicate LLM calls.

## Configuration

### Environment Variables

```bash
# Optional: Override model for V2 workflow
GEMINI_V2_MODEL=gemini-2.5-flash-lite

# Required: API key (same as V1)
GEMINI_API_KEY=your-key-here
```

### Model Settings

Current defaults in `curiosity-question-workflow-v2.ts`:
- **Model:** `gemini-2.5-flash-lite` (fast, cheap)
- **Temperature:** `0.2` (more consistent)
- **Max Tokens:** `4096` (sufficient for metadata + hooks)

To customize:
```typescript
const executor = new PromptExecutor(client, {
  model: "gemini-1.5-pro", // Use more powerful model
  temperature: 0.3,
  maxOutputTokens: 8192,
});
```

## Database Schema

### Articles Table

The V2 workflow stores metadata in `articles.metadata` JSONB:

```json
{
  "title": "Article Title",
  "archetype": "Argumentative Essay",
  "domain": { "primary": "science_and_technology", ... },
  "complexity": { "overall": "Professional", ... },
  "core_thesis": "...",
  "key_concepts": [...],
  "language": "en",
  "estimated_reading_minutes": 8,
  "hook_context_v2": {
    "core_thesis": "...",
    "key_claims": [...],
    "surprising_facts": [...],
    "counter_intuitive_points": [...]
  }
}
```

**Important:** `hook_context_v2` is nested under metadata, not a separate column.

### Hook Questions Table

Same schema as V1 (no changes needed):

```sql
CREATE TABLE hook_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER REFERENCES quizzes(id),
  status TEXT NOT NULL,
  hooks JSONB,
  strategy_prompt TEXT,
  model_version TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

The `hooks` JSONB contains:
```json
[
  {
    "id": 1,
    "type": "common_sense_test",
    "question": "True or False: ...",
    "options": [
      { "text": "True", "rationale": "..." },
      { "text": "False", "rationale": "..." }
    ],
    "remediation": "See section...",
    "answer_index": 1
  },
  { "id": 2, "type": "surprising_claim", ... },
  { "id": 3, "type": "prediction_test", ... }
]
```

## Error Handling

### Pipeline Errors

```typescript
import { PipelineError } from "@diffread/question-engine";

try {
  await buildCuriosityQuestionsV2(quiz);
} catch (error) {
  if (error instanceof PipelineError) {
    console.error(`Failed at step: ${error.stepName}`);

    switch (error.stepName) {
      case "analysis-llm-v2":
        // Analysis failed - might be article text issue
        break;
      case "persist-analysis-v2":
        // DB write failed
        break;
      case "hook-generation-llm-v2":
        // Hook generation failed - can retry
        await retryCuriosityQuestionsV2(quiz);
        break;
      case "persist-hooks-v2":
        // DB write failed
        break;
    }
  }
}
```

### Common Issues

#### 1. Empty Article Text
```
Error: analysisPromptV2 requires non-empty article text.
```

**Fix:** Ensure `ensureArticleContent()` returns valid content before calling workflow.

#### 2. PDF Articles
```
Error: PDF articles are not supported for curiosity question generation.
```

**Fix:** Check `article.content_medium === "pdf"` before calling workflow.

#### 3. Schema Validation Errors
```
Error: Failed to parse response for prompt analysis-v2: ...
```

**Fix:**
- Check Gemini response snippet in error logs
- May need to adjust prompt or increase temperature
- Retry usually succeeds

## Monitoring & Debugging

### Logging

The workflow logs at key points:

```typescript
// Success
logger.info({
  quizId: 123,
  articleId: 456,
  hookCount: 3,
  archetype: "Argumentative Essay",
  language: "en"
}, "Curiosity questions generated (V2)");

// Failure
logger.error({
  err: error,
  quizId: 123,
  stepName: "hook-generation-llm-v2",
  cause: {...}
}, "Curiosity question pipeline failed");
```

### Accessing Debug Info

The workflow returns rationales for debugging:

```typescript
const result = await buildCuriosityQuestionsV2(quiz);

console.log("Analysis rationale:", result.analysisRationale);
// "This is an Argumentative Essay in the business domain..."

console.log("Hook generation rationale:", result.hookGenerationRationale);
// "Generated 3 hook questions targeting counter-intuitive claims..."
```

**Note:** Rationales are NOT persisted to DB by default. To persist, add a custom step.

## Migration Strategy

### Option A: Gradual Rollout

```typescript
const USE_V2 = process.env.USE_V2_WORKFLOW === "true";

export async function buildHooks(quiz: QuizRow, article?: ArticleRow) {
  if (USE_V2) {
    return buildCuriosityQuestionsV2(quiz, article);
  } else {
    return buildHookQuestionsForQuiz(quiz, article);
  }
}
```

### Option B: A/B Test

```typescript
import { hashQuizId } from "@/lib/utils";

export async function buildHooks(quiz: QuizRow, article?: ArticleRow) {
  const useV2 = hashQuizId(quiz.id) % 100 < 50; // 50% traffic

  if (useV2) {
    return buildCuriosityQuestionsV2(quiz, article);
  } else {
    return buildHookQuestionsForQuiz(quiz, article);
  }
}
```

### Option C: Side-by-Side Comparison

```typescript
export async function compareWorkflows(quiz: QuizRow, article?: ArticleRow) {
  const [v1Result, v2Result] = await Promise.allSettled([
    buildHookQuestionsForQuiz(quiz, article),
    buildCuriosityQuestionsV2(quiz, article),
  ]);

  // Log comparison metrics
  console.log("V1 questions:", v1Result.status === "fulfilled" ? v1Result.value.hookQuestions.length : 0);
  console.log("V2 questions:", v2Result.status === "fulfilled" ? v2Result.value.hookQuestions.length : 0);

  // Use V2 in production
  if (v2Result.status === "fulfilled") {
    return v2Result.value;
  }

  // Fallback to V1
  if (v1Result.status === "fulfilled") {
    return v1Result.value;
  }

  throw new Error("Both workflows failed");
}
```

## Performance Optimization

### 1. Caching Strategy

The workflow automatically caches at each LLM step:

```typescript
// First run: 2 LLM calls
await buildCuriosityQuestionsV2(quiz);
// → Step 1: Analysis LLM (2-3s)
// → Step 2: Persist (100ms)
// → Step 3: Hook Generation LLM (2-3s)
// → Step 4: Persist (100ms)
// Total: ~5s

// Second run (same quiz): 0 LLM calls
await buildCuriosityQuestionsV2(quiz);
// → Step 1: Load from DB (100ms)
// → Step 2: Skip (already persisted)
// → Step 3: Load from DB (100ms)
// → Step 4: Skip (already persisted)
// Total: ~200ms
```

### 2. Forcing Fresh Generation

```typescript
// Clear cache before running
await saveArticleMetadata(articleId, {}); // Clear metadata
await upsertHookQuestions({ quizId, status: "pending", hooks: null }); // Clear hooks

// Now run
await buildCuriosityQuestionsV2(quiz); // Will regenerate everything
```

### 3. Batch Processing

```typescript
import pLimit from "p-limit";

const limit = pLimit(5); // Max 5 concurrent workflows

const results = await Promise.allSettled(
  quizzes.map(quiz =>
    limit(() => buildCuriosityQuestionsV2(quiz))
  )
);
```

## Testing

### Unit Test Example

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildCuriosityQuestionsV2 } from "./curiosity-question-workflow-v2";

describe("buildCuriosityQuestionsV2", () => {
  it("should generate curiosity questions", async () => {
    const quiz = { id: 123, article_id: 456 };
    const article = { id: 456, normalized_url: "https://example.com" };

    const result = await buildCuriosityQuestionsV2(quiz, article);

    expect(result.hookQuestions).toHaveLength(3);
    expect(result.metadata.archetype).toBeDefined();
    expect(result.hookContext.core_thesis).toBeDefined();
  });

  it("should skip completed steps on retry", async () => {
    // First run
    await buildCuriosityQuestionsV2(quiz, article);

    // Second run should use cache
    const startTime = Date.now();
    await buildCuriosityQuestionsV2(quiz, article);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should be fast
  });
});
```

## Troubleshooting

### Issue: "Articles.metadata doesn't contain hook_context_v2"

**Cause:** The database client `saveMetadata` function may not be preserving the nested structure.

**Fix:** Update `createDatabaseClient` to handle nested metadata:

```typescript
async saveMetadata(_quizId: number, metadata: any) {
  // Ensure hook_context_v2 is preserved
  const existing = await getArticleById(_quizId);
  const merged = {
    ...existing.metadata,
    ...metadata,
  };
  await saveArticleMetadata(_quizId, merged);
}
```

### Issue: "Hook questions always regenerate (not cached)"

**Cause:** The `getByQuizId` function may not be checking the correct status.

**Fix:** Update the database client:

```typescript
async getByQuizId(quizId: number) {
  const result = await getHookQuestionsByQuizId(quizId);

  // Only return if status is "ready"
  if (result?.status === "ready" && result?.hooks) {
    return result;
  }

  return null;
}
```

### Issue: "PipelineError: Step 'analysis-llm-v2' failed"

**Cause:** Gemini may be returning invalid JSON or rate-limited.

**Fix:**
1. Check error logs for Gemini response snippet
2. Verify `GEMINI_API_KEY` is valid
3. Reduce concurrent requests
4. Increase temperature to 0.3 for more flexible parsing

## Support

For issues or questions:
1. Check error logs for `stepName` to identify which step failed
2. Review Gemini response snippet in error message
3. Try retry - idempotency will skip completed steps
4. Check database to verify metadata/hooks were persisted
