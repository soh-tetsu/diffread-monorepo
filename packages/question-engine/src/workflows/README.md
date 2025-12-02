# Curiosity Question Workflow V2

## Overview

The V2 workflow uses a declarative pipeline pattern to generate curiosity-driven "hook questions" from article text. It consists of 4 steps with interleaved LLM calls and database persistence for granular retry capability.

## Architecture

```
Input: { quizId, articleText }
  ↓
Step 1: Analysis LLM
  → Extract metadata + hook context
  → Check DB cache (skip if exists)
  ↓
Step 2: Persist Analysis
  → Save metadata + hook_context_v2 to articles table
  ↓
Step 3: Hook Generation LLM
  → Generate 3 curiosity questions
  → Check DB cache (skip if exists)
  ↓
Step 4: Persist Hooks
  → Save hooks to hook_questions table
  ↓
Output: { metadata, hookContext, hookQuestions, rationales }
```

## Key Features

### 1. Granular Retry
If Step 3 fails, re-running the workflow will:
- Skip Step 1 (load metadata from DB)
- Skip Step 2 (already persisted)
- Retry Step 3 (regenerate hooks)
- Execute Step 4 (persist new hooks)

### 2. Idempotency
Each LLM step checks `isCompleted()` before execution:
- **Analysis Step**: Checks if `articles.metadata.archetype` exists
- **Hook Generation Step**: Checks if `hook_questions.status === 'ready'`

If completed, calls `loadExisting()` to retrieve cached results.

### 3. Type Safety
- Input/output types validated at compile time
- LLM responses validated with Zod schemas at runtime

## Usage

### Basic Usage

```typescript
import { GoogleGenAI } from "@google/genai";
import {
  PromptExecutor,
  runCuriosityQuestionWorkflow,
  type StepDependencies,
} from "@diffread/question-engine";

// Setup dependencies
const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const executor = new PromptExecutor(geminiClient, {
  model: "gemini-2.5-flash-lite",
  temperature: 0.2,
  maxOutputTokens: 4096,
});

const db = {
  articles: {
    async findById(quizId: number) {
      // Return article with metadata field
    },
    async saveMetadata(quizId: number, metadata: any) {
      // Save metadata to articles table
    },
  },
  hookQuestions: {
    async getByQuizId(quizId: number) {
      // Return existing hook questions
    },
    async upsert(data: any) {
      // Upsert hook questions
    },
  },
};

const dependencies: StepDependencies = { executor, db };

// Run workflow
const result = await runCuriosityQuestionWorkflow(
  {
    quizId: 123,
    articleText: "Full article content...",
  },
  dependencies
);

console.log(result.metadata.archetype); // "Argumentative Essay"
console.log(result.hookQuestions.length); // 3
console.log(result.analysisRationale); // Debug info
```

### With Supabase

```typescript
import { supabase } from "@/lib/supabase";
import { getArticleById, saveArticleMetadata } from "@/lib/db/articles";
import { getHookQuestionsByQuizId, upsertHookQuestions } from "@/lib/db/hooks";

const db = {
  articles: {
    findById: async (quizId: number) => {
      const article = await getArticleById(quizId);
      return article;
    },
    saveMetadata: async (quizId: number, metadata: any) => {
      await saveArticleMetadata(quizId, metadata);
    },
  },
  hookQuestions: {
    getByQuizId: async (quizId: number) => {
      return await getHookQuestionsByQuizId(quizId);
    },
    upsert: async (data: any) => {
      await upsertHookQuestions(data);
    },
  },
};

const result = await runCuriosityQuestionWorkflow(input, { executor, db });
```

### Error Handling

```typescript
import { PipelineError } from "@diffread/question-engine";

try {
  const result = await runCuriosityQuestionWorkflow(input, dependencies);
} catch (error) {
  if (error instanceof PipelineError) {
    console.error(`Failed at step: ${error.stepName}`);
    console.error(`Cause:`, error.cause);

    // Retry logic based on which step failed
    if (error.stepName === "hook-generation-llm-v2") {
      // Retry entire workflow - Step 1 will load from cache
      await runCuriosityQuestionWorkflow(input, dependencies);
    }
  }
}
```

## Database Schema Requirements

### Articles Table

The workflow expects `articles.metadata` to be a JSONB column. After Step 2, it will contain:

```json
{
  "archetype": "Argumentative Essay",
  "domain": { ... },
  "complexity": { ... },
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

### Hook Questions Table

The workflow uses the existing `hook_questions` table structure:

```sql
CREATE TABLE hook_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER REFERENCES quizzes(id),
  status TEXT NOT NULL, -- 'pending' | 'processing' | 'ready' | 'failed'
  hooks JSONB,          -- Array of hook questions
  strategy_prompt TEXT,
  model_version TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Output Format

### Analysis Output

```typescript
{
  quizId: 123,
  articleText: "...",
  analysisRationale: "This is an Argumentative Essay...",
  metadata: {
    archetype: "Argumentative Essay",
    domain: {
      primary: "economy_business_and_finance",
      secondary: "employment",
      specific_topic: "Work-Life Balance"
    },
    complexity: {
      overall: "Professional",
      lexical: "Specialized",
      syntactic: "Moderate"
    },
    core_thesis: "...",
    key_concepts: [...],
    language: "en",
    estimated_reading_minutes: 8
  },
  hookContext: {
    core_thesis: "...",
    key_claims: [...],
    surprising_facts: [...],
    counter_intuitive_points: [...]
  }
}
```

### Final Output

```typescript
{
  // ... all fields from analysis output
  hookGenerationRationale: "Generated 3 hook questions...",
  hookQuestions: [
    {
      id: 1,
      type: "common_sense_test",
      question: "True or False: Taking more vacation time is the most effective way to prevent burnout.",
      options: [
        { text: "True", rationale: "..." },
        { text: "False", rationale: "..." }
      ],
      remediation: "See the section on 'Burnout Causes'",
      answer_index: 1
    },
    {
      id: 2,
      type: "surprising_claim",
      question: "What surprising finding does this article present?",
      options: [
        { text: "Most productivity advice reduces long-term output", rationale: "..." },
        { text: "The most productive people work exactly 8 hours", rationale: "..." },
        { text: "Multitasking increases efficiency by 40%", rationale: "..." }
      ],
      remediation: "...",
      answer_index: 0
    },
    {
      id: 3,
      type: "prediction_test",
      question: "How does the author view 'work-life balance'?",
      options: [
        { text: "It's essential for long-term health", rationale: "..." },
        { text: "It's a harmful myth", rationale: "..." },
        { text: "It's achievable through time management", rationale: "..." }
      ],
      remediation: "...",
      answer_index: 1
    }
  ]
}
```

## Testing

### Unit Test Example

```typescript
import { describe, it, expect, vi } from "vitest";
import { analysisLLMStep } from "./curiosity-question-workflow";

describe("analysisLLMStep", () => {
  it("should skip LLM if metadata exists in DB", async () => {
    const mockExecutor = { execute: vi.fn() };
    const mockDb = {
      articles: {
        findById: vi.fn().mockResolvedValue({
          metadata: {
            archetype: "Argumentative Essay",
            hook_context_v2: { ... }
          }
        })
      }
    };

    const result = await analysisLLMStep.execute(
      { quizId: 123, articleText: "test" },
      { executor: mockExecutor, db: mockDb }
    );

    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(result.metadata.archetype).toBe("Argumentative Essay");
  });
});
```

## Migration from V1

V1 and V2 can coexist. To migrate:

1. Keep existing `runHookWorkflow()` for production
2. Test V2 with feature flag or separate table
3. Compare outputs for quality validation
4. Gradually migrate traffic to V2
5. Deprecate V1 after validation period

## Extending the Workflow

### Adding a New Step

```typescript
import { type TransformStep } from "@diffread/question-engine";

const validateHooksStep: TransformStep<HookOutput, HookOutput> = {
  name: "validate-hooks",
  type: "transform",

  async execute(input, deps) {
    // Custom validation logic
    if (input.hookQuestions.length < 3) {
      throw new Error("Expected 3 hook questions");
    }

    // Pass through
    return input;
  },
};

// Add to workflow
export const curiosityQuestionWorkflow = new Pipeline()
  .addStep(analysisLLMStep)
  .addStep(persistAnalysisStep)
  .addStep(hookGenerationLLMStep)
  .addStep(validateHooksStep) // NEW
  .addStep(persistHooksStep);
```

### Custom Database Client

```typescript
// Define your own DB interface
interface MyDatabaseClient extends DatabaseClient {
  articles: {
    findById(id: number): Promise<Article>;
    saveMetadata(id: number, data: any): Promise<void>;
  };
  hookQuestions: {
    getByQuizId(quizId: number): Promise<HookQuestionRow | null>;
    upsert(data: any): Promise<void>;
  };
}

// Use with workflow
const db: MyDatabaseClient = { ... };
const result = await runCuriosityQuestionWorkflow(input, { executor, db });
```

## Troubleshooting

### Step 1 Always Re-executes
- Check that `db.articles.findById()` returns an object with `metadata.archetype` and `metadata.hook_context_v2`
- Ensure metadata structure matches `ArticleMetadata` type

### Step 3 Always Re-executes
- Check that `db.hookQuestions.getByQuizId()` returns an object with `status === 'ready'` and `hooks` array
- Ensure hooks are persisted correctly in Step 4

### Schema Validation Errors
- Check LLM response snippet in error message
- Verify prompt is returning valid JSON
- Test with lower `temperature` (e.g., 0.1) for more consistent output
