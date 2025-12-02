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
# Generate curiosity quiz for a session (synchronous)
bun run admin:curiosity user@example.com https://article-url.com

# Generate scaffold quiz for a session (synchronous)
bun run admin:scaffold user@example.com https://article-url.com

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
- **`quizzes`**: Container linking articles to quiz types (no status field)
- **`curiosity_quizzes`**: 3 predictive questions to raise curiosity (required entry point)
- **`scaffold_quizzes`**: N deep-dive questions for learning (optional, created on-demand)
- **`sessions`**: User-facing records linking email + URL to quiz token

**Status Flow:**

```
Curiosity Quizzes:  pending → processing → ready / failed / skip_by_failure
Scaffold Quizzes:   pending → processing → ready / failed / skip_by_failure
Articles:           pending → scraping → ready / stale / failed / skip_by_failure
Sessions:           pending → ready / errored / skip_by_failure
```

### Worker Architecture

**Two Independent Queues:**

1. **Curiosity Quiz Worker** (`processNextPendingCuriosityQuiz`):
   - Generates 3 predictive questions to raise curiosity
   - Claims jobs via `claim_next_curiosity_quiz()` RPC (atomic locking)
   - On success: marks curiosity quiz `ready`, updates all linked sessions to `ready`
   - On failure: retries up to 3 times, then marks as `skip_by_failure`

2. **Scaffold Quiz Worker** (`processNextPendingScaffoldQuiz`):
   - Generates deep-dive questions via multi-stage Gemini workflow
   - Claims jobs via `claim_next_scaffold_quiz()` RPC
   - Created on-demand (not auto-created with curiosity quiz)
   - Stores questions in JSONB column, marks scaffold quiz `ready`
   - Failures do NOT affect session status (scaffold is optional)

**Concurrency Controls:**

- `SESSION_WORKER_CONCURRENCY=5`: Max concurrent session-triggered scrapes (rate-limited via `p-limit`)
- `PENDING_WORKER_CONCURRENCY=1`: Backlog sweeper mutex (prevents duplicate cron runs)

### Question Generation Pipeline

**Curiosity Quiz Workflow** (`@diffread/question-engine`):

1. `analyzeArticleMetadata()`: Extract archetype, complexity, domain, thesis (cached as "pedagogy")
2. `generateHookQuestions()`: Create 3 MCQs with remediation + source locations

**Scaffold Quiz Workflow** (multi-stage):

1. `analyzeArticleMetadata()`: Reuses pedagogy from curiosity quiz if available
2. `generateReadingPlan()`: Break article into parts with task templates
3. `expandReadingPlan()`: Generate instruction details + coverage report
4. `generateInstructionQuestions()`: Convert instructions to MCQs with remediations

Both workflows use structured Gemini prompts (in `packages/question-engine/src/prompts/`) with Zod schema validation.

### Storage Strategy

- **Article Content**: Stored in Supabase Storage bucket `articles` as `article/<id>/content.md`
- **PDFs**: Stored in `articles-pdf` bucket (max 25MB, configurable via `MAX_PDF_SIZE_BYTES`)
- **Metadata**: Stored in `articles.metadata` JSONB column (title, thesis, concepts)

### API Routes

- **`POST /api/curiosity`**: Submit URL + email → create session → trigger curiosity quiz worker (async)
- **`GET /api/curiosity?q=<token>`**: Fetch curiosity quiz status + questions
- **`POST /api/scaffold`**: Create scaffold quiz on-demand → trigger scaffold quiz worker (async)
- **`GET /api/scaffold?q=<token>`**: Fetch scaffold quiz status + questions
- **`GET /api/quiz?q=<token>`**: Fetch session + article metadata
- **`GET /quiz?q=<token>`**: Render quiz UI with curiosity + scaffold questions

## Environment Variables

### Required

- `GEMINI_API_KEY`: Google Generative AI key for question generation
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side Supabase key (full admin access)

### Optional

- `GEMINI_MODEL`: Override default `gemini-1.5-flash` for scaffold quiz workflow
- `GEMINI_HOOK_MODEL`: Override default curiosity quiz model (defaults to `GEMINI_MODEL`)
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
│   │   ├── workflows/            # Orchestration logic (session-init, enqueue-session, article-content)
│   │   ├── workers/              # Background workers (process-curiosity-quiz, process-scaffold-quiz)
│   │   ├── quiz/                 # Quiz engine integration (scraper, normalize-questions)
│   │   ├── db/                   # Database access layer (articles, quizzes, sessions, curiosity-quizzes, scaffold-quizzes)
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
bun run admin:curiosity test@example.com https://article-url.com
```

This synchronously runs scraping → metadata analysis → curiosity quiz generation.

## Common Gotchas

1. **Race Conditions**: Workers use `FOR UPDATE SKIP LOCKED` in RPC functions to prevent duplicate processing. Don't bypass RPC functions or you may process the same quiz twice.

2. **PDF Support**: Curiosity quizzes do **not** support PDFs (will throw error). Scaffold quizzes may support PDFs in the future, but currently content must be markdown.

3. **Retry Logic**: Both quiz types retry up to 3 times before marking as `skip_by_failure`. Check the `error_message` column for details (truncated to 500 chars).

4. **Storage Paths**: Article content is stored at `article/<article_id>/content.md`. The `storage_path` column stores this relative path, **not** the full URL.

5. **Metadata Null Handling**: The `articles.metadata` column defaults to `{}` but can be `null` in legacy records. Always check `metadata?.title` rather than `metadata.title`.

6. **Scaffold Quiz is Optional**: Scaffold quiz failures do NOT affect session status. Sessions become `ready` when curiosity quiz is `ready`, regardless of scaffold quiz state.

7. **Stale Content**: Articles older than 30 days are marked as `stale`. Workers attempt to re-scrape but gracefully degrade to old content if re-scraping fails.
