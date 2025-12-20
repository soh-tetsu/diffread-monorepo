# Question Engine Architecture

V2 prompt-based question generation using Google Gemini API with type-safe Zod validation.

## Directory Structure

```
packages/question-engine/src/
├── prompts/
│   ├── executor.ts                  # PromptExecutor - executes V2 prompts with Gemini
│   ├── create-executor.ts           # createLLMClient factory function
│   ├── types.ts                     # PromptDefinitionV2<TContext> (generic typed prompts)
│   ├── index.ts                     # Re-exports
│   └── v2/                          # V2 Prompt suite
│       ├── curiosity/               # Curiosity Quiz prompts (entry point)
│       │   ├── analysis.ts          # V2 analysis prompt (metadata extraction)
│       │   ├── hook-generator.ts    # V2 hook generator prompt (3 questions)
│       │   ├── schemas.ts           # Zod schemas + types for curiosity responses
│       │   └── index.ts             # Re-exports
│       ├── scaffold/                # Scaffold Quiz prompts (deep learning)
│       │   ├── build-rst.ts         # RST structure generation prompt
│       │   ├── extract-threads.ts   # Thread/concept extraction prompt
│       │   ├── extract-toulmin.ts   # Logical argument extraction prompt
│       │   └── index.ts             # Re-exports
│       └── index.ts                 # Re-exports all V2 prompts + curiosity schemas
│
└── index.ts                         # Main package exports
```

## Key Concepts

### PromptDefinitionV2<TContext>
Generic prompt interface with type-safe context:
```typescript
export type PromptDefinitionV2<TContext> = {
  id: string
  version: string
  objective: string
  systemInstruction: string
  render(context: TContext): string
}
```

### PromptExecutor
Executes prompts and validates responses with Zod schemas:
```typescript
const executor = createLLMClient({ apiKey, model })
const result = await executor.execute(analysisPromptV2, { text }, AnalysisResponseSchema)
```

## Workflow: Curiosity Quiz

1. **Analysis** (`curiosity/analysis.ts`): Extract metadata (archetype, domain, thesis, pedagogy)
2. **Hook Generation** (`curiosity/hook-generator.ts`): Generate 3 predictive questions using pedagogy
3. **Schemas** (`curiosity/schemas.ts`): Validate responses with Zod

## Workflow: Scaffold Quiz (In Progress)

1. **Build RST** (`scaffold/build-rst.ts`): Generate document structure
2. **Extract Threads** (`scaffold/extract-threads.ts`): Identify key concepts
3. **Extract Toulmin** (`scaffold/extract-toulmin.ts`): Extract logical arguments
4. **Questions** (future): Convert to instruction questions
