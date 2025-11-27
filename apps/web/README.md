# Diffread Web Placeholder

This folder hosts a minimal Next.js app so you can wire `alpha.diffread.app` to Vercel before the real prototype ships.

## Getting started

1. Install dependencies
   ```bash
   bun install
   ```
2. Run locally
   ```bash
   bun run dev
   ```
3. Deploy to Vercel as usual. The app is static today, so no environment variables are required.

### Environment variables

The Gemini-powered question worker now requires a Google Generative AI key:

- `GEMINI_API_KEY`: server-side API key used by the background quiz processor and the `@diffread/question-engine` CLI.
- `GEMINI_MODEL` (optional): override the default `gemini-1.5-flash` model.

Add these to `.env.local` (or Vercel project settings) so quiz generation can run end-to-end.

### Local metadata analysis

To test the metadata prompt against any URL without touching Supabase, run:

```bash
bun run task:analyze-metadata https://example.com/article
```

The task reuses the production scraper to fetch the page, calls `analyzeArticleMetadata`, and prints the structured metadata JSON to stdout.

## What ships in this placeholder

- Opinionated copy that references the quiz-guided reading loop from the PRD.
- Status tiles outlining the three major modules (Hook, IDE Split View, Skip Logic).
- A lightweight CTA so interested testers can email `alpha@diffread.app`.

Feel free to update the content or styling as you unlock more of the prototype. All UI lives inside `app/page.tsx` with global styles in `app/globals.css`.

## Admin helper

To register a session and run the hook workflow (mirrors the `/api/hooks` behavior), run:

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-secret \
bun run admin:hook user@example.com https://example.com/article
```

Set `SUPABASE_DB_SCHEMA` if you expose a different schema via the Data API. The script calls `enqueueAndProcessSession`, so hooks are generated immediately.

To register a session and generate both hooks and instruction questions (mirrors `/api/instructions`), run:

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-secret \
bun run admin:instruction user@example.com https://example.com/article
```

This ensures the session/quiz exist, forces the hook workflow to finish, flips the quiz status to `pending`, and then runs the instruction workflow synchronously.

## Quiz bootstrap flow

- `bootstrapQuiz(rawUrl)` normalizes the URL, ensures the article exists, and enqueues a `quizzes` row in `pending` whenever there is no quiz. If the latest quiz failed it reuses that row by resetting its status to `pending`. The function returns `{ normalizedUrl, article, quiz, enqueued }`, where `enqueued` tells you whether a new job was created/reset or an existing one was reused.

## Session + quiz orchestration

- Use `enqueueAndProcessSession(email, url)` (`src/lib/workflows/session-flow.ts`) whenever a user submits a URL (API route, CLI, tests). Under the hood it:
  1. Calls `initSession` to reuse/create the session row.
  2. Runs `bootstrapQuiz` to ensure the quiz job exists (resetting failed jobs).
  3. Kicks off `processNextPendingQuiz` in the background.
- Session-triggered scrapes are rate limited via `p-limit` so no more than 5 scrapes run at once. The background backlog worker is also mutexed so only one sweep runs at a time.

## Session/quiz maintenance

- `processNextPendingQuiz()` (`src/lib/workflows/process-quiz.ts`) still encapsulates the end-to-end scraping + quiz generation flow, so you can call it from cron jobs or API routes when you need to drain the queue programmatically (see below).
- To manually rescue a session (e.g., after flipping it back to `pending` in the dashboard), run:

  ```bash
  bun run admin:drain-session <session_token>
  ```

  This script reloads the session via `initSession`, re-creates the quiz job if necessary, and immediately processes that quiz via `processQuizById`, so you can work purely at the session layer.
- To sweep the backlog on a schedule, run:

  ```bash
  bun run admin:drain-pending
  ```

  Hook this up to cron/serverless schedulers. Each invocation drains a single pending quiz; repeated runs keep the queue healthy.

- Design recap:
  - **Quizzes** are the immutable job queue (`status = not_required|pending|processing|ready|failed|skip_*`).
  - **Sessions** are mutable, user-facing records pointing at quizzes.
  - **Two worker entry points:** `processQuizById` handles session-triggered jobs (rate-limited to ≤5 concurrent scrapes), while `processNextPendingQuiz` handles backlog sweeps (mutexed to one run at a time).
  - **Safety net:** API/CLI invocations wake the backlog worker after each job, and the scheduled `admin:drain-pending` script can run periodically to catch anything left behind.

## Hook vs. instruction status matrix

Hooks (stored in `hook_questions.status`) and instructions (`quizzes.status`) move independently so retriable failures do not block each other. The worker decides what to run by checking both columns:

| `hook_questions.status` | `quizzes.status`     | Worker action |
| ----------------------- | -------------------- | ------------- |
| `pending`               | `not_required`       | Run the hook workflow. On success mark hooks `ready`; on failure mark hooks `failed` and leave the quiz in `not_required` (or `failed` if the run should surface to the user). |
| `pending`               | `pending`            | Still run the hook workflow first. If it succeeds, immediately transition the quiz to `processing` and run the instruction workflow. |
| `ready`                 | `not_required`       | Nothing to do—hooks exist and instructions have not been requested. |
| `ready`                 | `pending`            | Promote the quiz to `processing` and run the instruction workflow. |
| `ready`                 | `processing`         | Another worker is already generating instructions; skip. |
| `ready`                 | `ready`              | Both question sets exist; worker skips. |
| `ready`                 | `failed`             | Instructions failed earlier. The worker waits until an admin/API flips the quiz back to `pending` before retrying. |
| `failed` / `skip_*`     | any                  | Hooks failed or were skipped. The worker does nothing until someone resets the hooks row to `pending`. |

`quizzes.status = not_required` is the default for new jobs so hooks can run immediately while instructions remain opt-in. Calling `/api/instructions` (or the admin scripts) flips the quiz to `pending`, which allows the worker to run the instruction workflow once hooks are `ready`.

## Client quiz viewer

The quiz page uses a **Client-Side Rendering (CSR)** architecture to avoid Chakra UI hydration issues and provide a more responsive user experience.

### Architecture: SSR → CSR Migration

The quiz page (`/app/quiz/page.tsx`) is a Client Component (`"use client"`) that fetches data using SWR for automatic caching and revalidation.

### API Endpoints

All endpoints use the `?q={sessionToken}` parameter for authentication. The session token is the only client-facing credential—internal database IDs like `quizId` are never exposed.

#### `GET /api/quiz?q={sessionToken}`

Returns session metadata and article information for initial page load:

```typescript
{
  session: {
    session_token: string;
    status: "pending" | "ready" | "completed" | "errored";
    article_url: string | null;
  };
  article: {
    id: number;
    status: string;
    metadata: { title: string | null };
  } | null;
}
```

#### `GET /api/hooks?q={sessionToken}`

Returns hook questions status and data:

```typescript
{
  status: HookStatus;           // "pending" | "processing" | "ready" | "failed" | "skip_*"
  hooks: unknown;               // Raw hook questions array from database
  errorMessage: string | null;
}
```

The `hooks` field is normalized client-side using `normalizeHookQuestions()` from `src/lib/quiz/normalize-hook-questions.ts`.

#### `GET /api/instructions?q={sessionToken}`

Returns instruction questions status and normalized questions:

```typescript
{
  status: QuizStatus;           // "not_required" | "pending" | "processing" | "ready" | "failed"
  questions: QuizQuestion[];    // Already normalized question objects
  failureReason: string | null;
}
```

Questions are pre-normalized on the backend using `normalizeQuestion()` from `src/lib/quiz/normalize-question.ts`.

### Data Flow

1. **Page Load**: User visits `/quiz?q={sessionToken}`
2. **Parallel Fetching**: SWR fetches from three endpoints simultaneously:
   - `/api/quiz` - Session metadata (always fetched)
   - `/api/hooks` - Hook questions (always fetched)
   - `/api/instructions` - Instruction questions (only if session status is "ready" or `show=instructions` param is present)
3. **Normalization**:
   - Hook questions: Normalized client-side via `normalizeHookQuestions(hooksData.hooks)`
   - Instruction questions: Already normalized by API, used directly
4. **Rendering**: `QuizView` component receives normalized data and renders the quiz UI

### Security Model

- **Session Token as Authentication**: The `sessionToken` (passed as `?q=xxx` in URL) is the only authentication mechanism, similar to a magic link
- **No Internal IDs Exposed**: The `quizId` and other internal database IDs are never sent to the client to prevent enumeration attacks
- **Token Validation**: All API endpoints validate the session token using `getSessionByToken()` helper before returning data

### SWR Benefits

- **Automatic Caching**: Responses are cached and shared across components
- **Deduplication**: Multiple requests to the same endpoint are automatically deduplicated
- **Revalidation**: Data is automatically revalidated on focus/reconnection
- **No Manual State Management**: No need for localStorage or complex state management

### Component Structure

- **`/app/quiz/page.tsx`**: Client Component that orchestrates SWR data fetching and handles loading/error states
- **`/src/components/quiz/QuizView.tsx`**: Presentational component that renders quiz cards, handles answer selection, and manages UI interactions
- **`/src/lib/quiz/normalize-hook-questions.ts`**: Normalizes raw hook question data from database format to `QuizQuestion` format
- **`/src/lib/quiz/normalize-question.ts`**: Normalizes instruction question rows from database to unified `QuizQuestion` format

## Configuration

- `SESSION_WORKER_CONCURRENCY` (default `5`): caps how many session-triggered scrapes can run simultaneously.
- `PENDING_WORKER_CONCURRENCY` (default `1`): limits the backlog sweeper that runs after each enqueue or via cron.
- `SUPABASE_ARTICLE_BUCKET` (default `articles`): bucket storing normalized markdown content (`article/<id>/content.md`).
- `SUPABASE_PDF_BUCKET` (default `articles-pdf`): bucket used by the scraper to store fetched PDFs.
- `MAX_PDF_SIZE_BYTES` (default `26214400`): maximum PDF size (in bytes) accepted when downloading via URL.


## Updating the hardened `api` schema

When you alter `public.articles` (or any table exposed through the hardened `api` schema), run these steps so the Supabase Data API stays in sync:

1. Temporarily drop the dependent view so migrations can touch the base table:
   ```sql
   drop view if exists api.articles;
   ```
2. Apply your migration:
   ```bash
   bunx supabase db push
   ```
3. Recreate the view with the new column set (adjust the `select` as needed):
   ```sql
   create or replace view api.articles as
     select *
     from public.articles;
   ```
4. Regrant permissions (dropping the view clears grants):
   ```sql
   grant select, insert, update on all tables in schema api to service_role;
   ```
5. Reapply any additional grants (e.g., `authenticated`, `anon`) you rely on for the Data API.
