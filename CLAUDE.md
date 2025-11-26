# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Diffread** is a "Knowledge IDE" that transforms passive reading into active learning through a quiz-first approach. Users submit articles, receive predictive "hook" questions to assess existing knowledge, then access detailed "instruction" questions in an IDE-style split view for deep learning.

**Core Philosophy:** "The Confidence to Skip" - verify mastery through quizzes, enabling users to skip content they already know or deep-dive into knowledge gaps.

### Technology Stack

- **Monorepo:** Bun workspaces (`apps/*`, `packages/*`)
- **Frontend:** Next.js 14 (App Router), React 18, Chakra UI 3
- **Backend:** Supabase (PostgreSQL + Storage), serverless API routes
- **AI:** Google Gemini (via `@google/genai`) for question generation
- **Package Manager:** Bun 1.3.2

## Development Commands

### Root Level

```bash
bun install              # Install all workspace dependencies
```

### Web App (`apps/web`)

```bash
cd apps/web
bun run dev             # Start Next.js dev server (http://localhost:3000)
bun run build           # Production build
bun run lint            # Run ESLint on .ts/.tsx/.js files
```

### Question Engine (`packages/question-engine`)

```bash
cd packages/question-engine
bun run build           # Compile TypeScript to dist/
bun run dev             # Watch mode compilation
```

### Admin Scripts (`apps/web`)

All scripts run from `apps/web/` using `tsx`:

```bash
# Generate hook + instruction questions for a session
bun run admin:hook user@example.com https://article-url.com

# Generate hook questions only (use /api/instructions later to add instruction questions)
bun run admin:instruction user@example.com https://article-url.com

# Manually process a specific session by token
bun run admin:drain-session <session_token>

# Process next pending quiz from backlog (for cron jobs)
bun run admin:drain-pending

# Test metadata extraction without touching DB
bun run task:analyze-metadata https://article-url.com
```

## Architecture

### Data Flow: Session → Article → Quiz → Questions

1. **Session Creation**: User submits URL + email → `initSession()` creates/reuses session
2. **Article Normalization**: URL normalized, article record created/fetched
3. **Quiz Bootstrap**: `bootstrapQuiz()` ensures quiz job exists, resets failed jobs
4. **Worker Processing**: Background workers claim jobs via RPC, generate questions
5. **Quiz Retrieval**: Frontend loads `/quiz?q=<session_token>` to display questions

### Database Schema (Supabase)

**Core Tables** (in `public` schema, exposed via `api` schema views):

- **`articles`**: Normalized article records with storage paths, metadata, scraping status
- **`quizzes`**: Job queue for question generation (status: not_required → pending → processing → ready/failed)
- **`hook_questions`**: Separate job tracking for hook workflow (independent retry/failure)
- **`questions`**: Instruction questions for deep-dive learning
- **`sessions`**: User-facing records linking email + URL to quiz token

**Status Flow:**

```
Hook Questions:  pending → processing → ready/failed
Quizzes:         not_required → pending → processing → ready/failed
Sessions:        pending → ready/completed/errored
```

### Worker Architecture

**Two Independent Queues:**

1. **Hook Worker** (`buildHookQuestionsForQuiz`):
   - Generates 3 predictive "common sense test" questions
   - Claims jobs via `claim_next_hook_job()` RPC (atomic locking)
   - On success: marks hooks `ready`, may auto-promote quiz to `pending`
   - On failure: marks hooks `failed`, does not block instruction workflow

2. **Instruction Worker** (`handleInstructionJob`):
   - Generates deep-dive questions via multi-stage Gemini workflow
   - Claims jobs via `claim_next_instruction_job()` RPC
   - Only runs when hooks are `ready` and quiz is `pending`/`processing`
   - Stores questions in `questions` table, marks quiz `ready`

**Concurrency Controls:**

- `SESSION_WORKER_CONCURRENCY=5`: Max concurrent session-triggered scrapes (rate-limited via `p-limit`)
- `PENDING_WORKER_CONCURRENCY=1`: Backlog sweeper mutex (prevents duplicate cron runs)

### Question Generation Pipeline

**Hook Workflow** (`@diffread/question-engine`):

1. `analyzeArticleMetadata()`: Extract archetype, complexity, domain, thesis
2. `generateHookQuestions()`: Create 3 MCQs with remediation + source locations

**Instruction Workflow** (multi-stage):

1. `analyzeArticleMetadata()`: Same metadata extraction as hooks
2. `generateReadingPlan()`: Break article into parts with task templates
3. `expandReadingPlan()`: Generate instruction details + coverage report
4. `generateInstructionQuestions()`: Convert instructions to MCQs with remediations

Both workflows use structured Gemini prompts (in `packages/question-engine/src/prompts/`) with Zod schema validation.

### Storage Strategy

- **Article Content**: Stored in Supabase Storage bucket `articles` as `article/<id>/content.md`
- **PDFs**: Stored in `articles-pdf` bucket (max 25MB, configurable via `MAX_PDF_SIZE_BYTES`)
- **Metadata**: Stored in `articles.metadata` JSONB column (title, thesis, concepts)

### API Routes

- **`POST /api/hooks`**: Submit URL → create session → trigger hook workflow
- **`POST /api/instructions`**: Promote existing session's quiz to `pending` → trigger instruction workflow
- **`GET /api/sessions`**: Query sessions by email/URL
- **`GET /quiz?q=<token>`**: Render quiz UI with hook + instruction questions

## Environment Variables

### Required

- `GEMINI_API_KEY`: Google Generative AI key for question generation
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side Supabase key (full admin access)

### Optional

- `GEMINI_MODEL`: Override default `gemini-1.5-flash` for instruction workflow
- `GEMINI_HOOK_MODEL`: Override default hook model (defaults to `GEMINI_MODEL`)
- `SUPABASE_DB_SCHEMA`: Schema for Data API (default: `api`)
- `SUPABASE_ARTICLE_BUCKET`: Storage bucket for markdown content (default: `articles`)
- `SUPABASE_PDF_BUCKET`: Storage bucket for PDFs (default: `articles-pdf`)
- `MAX_PDF_SIZE_BYTES`: Max PDF download size (default: `26214400` = 25MB)
- `SESSION_WORKER_CONCURRENCY`: Session-triggered scrape limit (default: `5`)
- `PENDING_WORKER_CONCURRENCY`: Backlog sweeper limit (default: `1`)
- `SESSION_TOKEN_LENGTH`: Nanoid length for session tokens (default: `16`)

## Code Organization

```
apps/web/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (hooks, instructions, sessions)
│   ├── quiz/                     # Quiz viewer page
│   └── page.tsx                  # Landing page
├── src/
│   ├── components/               # React components (QuizView, QuestionCard)
│   ├── lib/
│   │   ├── workflows/            # Orchestration logic (session-flow, process-quiz, hook-generation)
│   │   ├── quiz/                 # Quiz engine integration (scraper, question-engine, bootstrap)
│   │   ├── db/                   # Database access layer (articles, quizzes, sessions, hooks)
│   │   └── utils/                # Utilities (normalize-url)
│   └── types/                    # TypeScript types (db.ts)
├── scripts/                      # Admin CLI tools (add-session, drain-pending, etc.)
└── supabase/migrations/          # Database migrations

packages/question-engine/
├── src/
│   ├── prompts/                  # Gemini prompt templates
│   ├── analyze-article.ts        # Metadata extraction
│   ├── hook-generator.ts         # Hook question generation
│   ├── instruction-question-generator.ts
│   ├── article-planner.ts        # Reading plan generation
│   ├── plan-expander.ts          # Instruction detail expansion
│   └── question-generator.ts     # Orchestration functions
└── bin/question-engine.ts        # CLI entry point
```

## Important Patterns

### Always Read Files Before Modifying

When working with existing code, **always use Read tool first**. The codebase uses specific patterns for database access, worker orchestration, and AI prompt construction that must be preserved.

### Status Transitions Are Critical

The quiz/hook status state machine is the core of the worker system. Never manually set statuses without understanding the RPC locking functions (`claim_next_hook_job`, `claim_next_instruction_job`). Incorrect transitions can cause deadlocks or duplicate work.

### Scraper Uses Mozilla Readability

Article scraping in `apps/web/src/lib/quiz/scraper.ts` uses `@mozilla/readability` + `jsdom` for HTML extraction, with fallback to `turndown` for markdown conversion. Preserve this approach for consistency.

### Question Schema Validation

All AI-generated questions are validated against Zod schemas in `@diffread/question-engine`. Changes to question structure must update both the schemas and the database `content` JSONB column types.

### Hardened API Schema

The Supabase database uses a `public` schema for tables and an `api` schema for views. The Data API only exposes `api.*` views to limit surface area. When adding columns to `public.articles` or other tables:

1. Drop dependent `api.*` view
2. Run migration
3. Recreate view with new columns
4. Regrant permissions to `service_role`

See README section "Updating the hardened `api` schema" for details.

## Testing Article Processing

To quickly test the full pipeline without manual URL submission:

```bash
# From apps/web
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-key \
bun run admin:hook test@example.com https://article-url.com
```

This synchronously runs scraping → metadata analysis → hook generation → instruction generation (if quiz transitions to `pending`).

## Common Gotchas

1. **Race Conditions**: The worker uses `for update skip locked` to prevent duplicate processing, but if you bypass the RPC functions, you may process the same quiz twice.

2. **PDF Support**: Hook questions do **not** support PDFs (will throw error). Instruction questions may support PDFs in the future, but currently the content must be markdown.

3. **Failed Quiz Reset**: `bootstrapQuiz()` auto-resets `failed` quizzes to `pending`. If a quiz keeps failing, check the `model_used` column for error messages (truncated to 120 chars).

4. **Storage Paths**: Article content is stored at `article/<article_id>/content.md`. The `storage_path` column stores this path, **not** the full URL.

5. **Metadata Null Handling**: The `articles.metadata` column defaults to `{}` but can be `null` in legacy records. Always check `metadata?.title` rather than `metadata.title`.
