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

To create or look up a `sessions` row from the CLI and enqueue a quiz job for the same URL, use the helper script (loads `.env.local`, targets the hardened `api` schema by default, and requires `SUPABASE_SERVICE_ROLE_KEY` plus either `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`):

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-secret \
bun run admin:add-session user@example.com https://example.com/article
```

Set `SUPABASE_DB_SCHEMA` if you expose a different schema via the Data API. The script calls `enqueueAndProcessSession`, so it mirrors the POST API behavior: enqueue (or reuse) the quiz job and immediately trigger a processing pass.

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
  - **Quizzes** are the immutable job queue (`status = pending|processing|ready|failed|skip_*`).
  - **Sessions** are mutable, user-facing records pointing at quizzes.
  - **Two worker entry points:** `processQuizById` handles session-triggered jobs (rate-limited to ≤5 concurrent scrapes), while `processNextPendingQuiz` handles backlog sweeps (mutexed to one run at a time).
  - **Safety net:** API/CLI invocations wake the backlog worker after each job, and the scheduled `admin:drain-pending` script can run periodically to catch anything left behind.

## Client quiz viewer

- The `/quiz?q=<session_token>` route (App Router page) renders the quiz for a session token created via `initSession`. Tokens are short nanoid slugs (`SESSION_TOKEN_LENGTH` env, default `16`).
- `getSessionQuizPayload` (`src/lib/quiz/get-session-quiz.ts`) loads session, article, quiz, and normalized questions in one call.
- `QuizView` (`src/components/quiz/QuizView.tsx`) shows responsive cards, handles local answer state, and sends stub analytics events via `trackQuizSelection` (`src/lib/analytics/client.ts`) ready for future wiring.

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
