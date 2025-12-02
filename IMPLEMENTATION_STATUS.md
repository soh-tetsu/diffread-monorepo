# Implementation Status: Schema Redesign

## Completed ✅

### 1. Database Migration
**File:** `apps/web/supabase/migrations/20251202100000_redesign_schema.sql`

- ✅ Created new enum types (article_status, session_status, curiosity_quiz_status, scaffold_quiz_status)
- ✅ Created `articles` table with 'stale' status
- ✅ Created `quizzes` table (container only, no status)
- ✅ Created `curiosity_quizzes` table with JSONB questions + pedagogy
- ✅ Created `scaffold_quizzes` table with JSONB questions + reading_plan
- ✅ Created `sessions` table with updated schema
- ✅ Created RPC functions: `claim_next_curiosity_quiz()`, `claim_next_scaffold_quiz()`
- ✅ Added indexes and triggers

### 2. TypeScript Types
**File:** `apps/web/src/types/db.ts`

- ✅ Updated all type definitions to match new schema
- ✅ Added `ArticleStatus` with 'stale'
- ✅ Removed 'completed' from `SessionStatus`
- ✅ Added `CuriosityQuizStatus` and `ScaffoldQuizStatus`
- ✅ Added RPC return types

### 3. Database Access Layer

**Files created:**
- ✅ `apps/web/src/lib/db/articles.ts` - Article CRUD with freshness check
- ✅ `apps/web/src/lib/db/quizzes.ts` - Quiz container operations
- ✅ `apps/web/src/lib/db/curiosity-quizzes.ts` - Curiosity quiz operations + RPC claim
- ✅ `apps/web/src/lib/db/scaffold-quizzes.ts` - Scaffold quiz operations + RPC claim
- ✅ `apps/web/src/lib/db/sessions.ts` - Session operations with bulk update

### 4. Article Content Logic
**File:** `apps/web/src/lib/workflows/article-content.ts`

- ✅ Implemented status-first approach
- ✅ Added 'stale' status detection and handling
- ✅ Implemented graceful degradation (use old content if re-scraping fails)
- ✅ Added proper status transitions
- ✅ Fixed function name: `saveArticleMetadata` → `updateArticleMetadata`

### 5. Session Initialization
**File:** `apps/web/src/lib/workflows/session-init.ts`

- ✅ Implemented session-first flow
- ✅ Added early return for 'ready' status
- ✅ Sequential creation: session → article → quiz → curiosity_quiz
- ✅ No transactions (avoid Supabase RPC overhead)

### 6. Curiosity Quiz Worker
**File:** `apps/web/src/lib/workers/process-curiosity-quiz.ts`

- ✅ Atomic job claiming via RPC
- ✅ Pedagogy idempotency check
- ✅ Two-step process: analysis → question generation
- ✅ Retry logic with max 3 attempts
- ✅ Bulk session status updates
- ✅ Proper error handling and logging

### 7. API Route
**File:** `apps/web/app/api/hooks/route.ts`

- ✅ POST endpoint for session initialization
- ✅ Worker invocation (fire-and-forget)
- ✅ Concurrency control via p-limit
- ✅ Input validation

---

## Remaining Tasks 🚧

### 1. API Routes to Update

- ⏳ **GET /quiz** - Query curiosity_quizzes instead of hook_questions
- ⏳ **POST /api/scaffold** - Create scaffold quiz on-demand
- ⏳ **GET /api/sessions** - Update query logic for new schema

### 2. Scaffold Quiz Worker

**File to create:** `apps/web/src/lib/workers/process-scaffold-quiz.ts`

- ⏳ Implement similar to curiosity quiz worker
- ⏳ Use existing instruction generation logic
- ⏳ Independent failure handling (doesn't affect session status)

### 3. Quiz Display Components

**Files to update:**
- ⏳ `apps/web/src/components/quiz/QuizView.tsx` - Load from new schema
- ⏳ `apps/web/src/components/quiz/QuestionCard.tsx` - Handle new question format

### 4. Admin Scripts

**Files to update:**
- ⏳ `apps/web/scripts/add-session.ts` - Use new initSession flow
- ⏳ `apps/web/scripts/drain-pending.ts` - Call new worker
- ⏳ Other admin scripts in `scripts/` directory

### 5. Testing

- ⏳ Run migration on test database
- ⏳ Test full flow: submit URL → curiosity quiz ready
- ⏳ Test scaffold quiz flow
- ⏳ Test error handling and retries
- ⏳ Test stale article re-scraping

### 6. Cleanup

- ⏳ Remove old files:
  - `apps/web/src/lib/db/hooks.ts` (replaced by curiosity-quizzes.ts)
  - `apps/web/src/lib/workflows/process-quiz-v2.ts` (replaced by worker)
  - `apps/web/src/lib/workflows/hook-generation.ts` (if exists)
- ⏳ Update imports throughout codebase
- ⏳ Remove old migration files (if doing fresh start)

---

## Migration Steps

### To Deploy:

1. **Backup current database** (if needed)
   ```bash
   # Export current data if you want to preserve anything
   ```

2. **Run migration**
   ```bash
   cd apps/web
   supabase db reset  # Fresh start
   # OR
   supabase migration up  # Apply migration
   ```

3. **Update dependencies**
   ```bash
   cd /Users/tetsusoh/repos/personal/diffread
   bun install
   cd packages/question-engine
   bun run build
   ```

4. **Test locally**
   ```bash
   cd apps/web
   bun run dev
   # Test POST /api/hooks with a URL
   ```

5. **Deploy**
   ```bash
   # Deploy to production when ready
   ```

---

## Key Design Changes

| Aspect | Old Design | New Design |
|--------|-----------|------------|
| **Quiz Types** | One `quizzes` table with status | Separate `curiosity_quizzes` + `scaffold_quizzes` |
| **Naming** | "hooks" / "instructions" | "curiosity quiz" / "scaffold quiz" |
| **Question Storage** | Separate `questions` table | JSONB in quiz tables |
| **Quiz Container** | Had status + questions | Pure container, no status |
| **Article Freshness** | Implicit check | Explicit 'stale' status |
| **Session Status** | Had 'completed' | Removed 'completed' |
| **Personalization** | Not supported | Ready with user_id + variant fields |

---

## Next Steps

**Recommended order:**

1. ✅ Test migration on local database
2. ⏳ Update remaining API routes (quiz, sessions, scaffold)
3. ⏳ Implement scaffold quiz worker
4. ⏳ Update UI components
5. ⏳ Update admin scripts
6. ⏳ Test end-to-end flow
7. ⏳ Clean up old code
8. ⏳ Deploy

**Estimated remaining work:** 4-6 hours

---

## Questions / Issues

- None currently - implementation matches specification

---

## Notes

- All database access uses status-first approach
- No transactions to avoid Supabase RPC overhead
- Worker uses atomic RPC claiming to prevent race conditions
- Graceful degradation for stale content re-scraping
- Retry logic: 3 attempts before skip_by_failure
