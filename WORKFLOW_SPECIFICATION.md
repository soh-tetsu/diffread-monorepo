# Workflow Specification: Correct Reuse, Redo, Skip, and Status Logic

## Overview

This document defines the correct behavior for entity lifecycle management in the V2 workflow.

**Core Principles:**
1. **Status field is source of truth** - Don't check related fields when determining entity behavior
2. **Workers update status** - API returns immediately, workers sync status asynchronously
3. **Clear separation** - Curiosity quiz (required) vs Scaffold quiz (optional) are separate tables
4. **Process flow:** `session → article → quiz (container) → curiosity_quiz → (optional) scaffold_quiz`

---

## New Schema Design

### **Terminology:**
- **Curiosity Quiz** (formerly "hooks" or "hook_questions") - Required entry point, 3 questions to raise curiosity
- **Scaffold Quiz** (formerly "instructions" or "questions") - Optional deep-dive, N questions for detailed learning
- **Quiz** - Container entity that links article to its curiosity and scaffold quizzes

### **Relationships:**

```
1 article
  └─ 1 quiz (container, no status, no questions)
      ├─ 1 curiosity_quiz (required, has status + questions JSONB)
      └─ 0..1 scaffold_quiz (optional, has status + questions JSONB)

N sessions (per article)
  └─ session.status depends on curiosity_quiz.status
```

### **Database Tables:**

```sql
-- Table 1: quizzes (Container only)
CREATE TABLE quizzes (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id),

  -- Future personalization (nullable for now)
  user_id BIGINT,    -- NULL = shared quiz, set = personalized
  variant TEXT,      -- NULL = default, could be 'beginner', 'advanced'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One shared quiz per article (for now)
CREATE UNIQUE INDEX one_shared_quiz_per_article
  ON quizzes(article_id)
  WHERE user_id IS NULL;

-- Table 2: curiosity_quizzes (Required, entry point)
CREATE TYPE curiosity_quiz_status AS ENUM (
  'pending', 'processing', 'ready', 'failed',
  'skip_by_admin', 'skip_by_failure'
);

CREATE TABLE curiosity_quizzes (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  status curiosity_quiz_status NOT NULL DEFAULT 'pending',

  -- Questions data (JSONB, not normalized)
  questions JSONB,  -- Array of 3 curiosity questions
  pedagogy JSONB,   -- Metadata analysis (for idempotency)

  -- Metadata
  model_version TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(quiz_id)  -- 1:1 with quiz
);

-- Table 3: scaffold_quizzes (Optional, created on-demand)
CREATE TYPE scaffold_quiz_status AS ENUM (
  'pending', 'processing', 'ready', 'failed',
  'skip_by_admin', 'skip_by_failure'
);

CREATE TABLE scaffold_quizzes (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  status scaffold_quiz_status NOT NULL DEFAULT 'pending',

  -- Questions data (JSONB, not normalized)
  questions JSONB,  -- Array of N instruction questions
  reading_plan JSONB,  -- For idempotency

  -- Metadata
  model_version TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(quiz_id)  -- 0..1 per quiz
);

-- Table 4: sessions (Updated)
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  user_email TEXT NOT NULL,
  article_url TEXT NOT NULL,

  quiz_id BIGINT REFERENCES quizzes(id),  -- Can be NULL temporarily
  status session_status NOT NULL DEFAULT 'pending',
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_email, article_url)
);

-- Table 5: articles (Updated with 'stale' status)
CREATE TYPE article_status AS ENUM (
  'pending', 'scraping', 'ready', 'stale', 'failed',
  'skip_by_admin', 'skip_by_failure'
);

CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,

  status article_status NOT NULL DEFAULT 'pending',
  storage_path TEXT,
  content_hash TEXT,
  last_scraped_at TIMESTAMPTZ,

  metadata JSONB,  -- Mixed: scraping metadata + AI metadata
  storage_metadata JSONB,  -- Storage-only metadata
  content_medium content_medium DEFAULT 'html',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Status Dependencies:**

```
session.status ← depends on ← curiosity_quiz.status
  - curiosity='pending' → session='pending'
  - curiosity='processing' → session='pending'
  - curiosity='ready' → session='ready'
  - curiosity='failed' → session='errored'
  - curiosity='skip_by_failure' → session='skip_by_failure'

scaffold_quiz.status is INDEPENDENT
  - User can access curiosity quiz even if scaffold fails
  - Scaffold status doesn't affect session status
```

---

## Entity Lifecycle Specifications

### 1. Session

**Unique Key:** `(user_email, article_url)`

**Design Principles:**
- **Status field is source of truth** - Don't check quiz_id, hook_questions when determining session behavior
- **Worker updates status** - API returns immediately, worker syncs status asynchronously
- **Quiz sharing** - Multiple sessions can share same quiz_id (same article, different users)
- **Auto-recovery** - If quiz/hooks deleted, worker detects and regenerates

#### **When to REUSE existing session (skip creating):**

```
IF session exists for (email, url) AND:
  - session.status IN ('ready', 'pending', 'errored', 'skip_by_admin', 'skip_by_failure')
THEN:
  - REUSE existing session (never create duplicate)
  - Continue to behavior rules below
```

#### **When to CREATE new session:**

```
IF no session exists for (email, url)
THEN:
  - CREATE session with status='pending'
  - Bootstrap article/quiz/hooks
  - Invoke worker (fire and forget)
  - RETURN session to user
```

#### **Behavior Based on Status (for existing sessions):**

```
CASE status = 'ready':
  - RETURN session directly to user
  - No worker invocation
  - User can access quiz immediately

CASE status = 'pending':
  - REUSE session
  - Invoke worker (fire and forget) to ensure processing continues
  - RETURN session to user
  - User must poll to check if ready

CASE status = 'errored':
  - REUSE session
  - Invoke worker (fire and forget) to auto-retry
  - Worker will update status to 'pending' then process
  - RETURN session to user (status='errored', will update soon)
  - User must poll to check if ready

CASE status IN ('skip_by_admin', 'skip_by_failure'):
  - REUSE session
  - RETURN session directly to user
  - No worker invocation (terminal state)
  - User cannot retry
```

#### **Status Transitions:**

```
Session Status Flow:
  pending ←→ errored → skip_by_failure
     ↓
   ready

Note: 'completed' status removed (not used)

Transition Rules:
  - pending → ready: Worker sets when hook_questions.status = 'ready'
  - pending → errored: Worker sets when hook generation fails (retryable)
  - errored → pending: Worker resets before retry
  - errored → skip_by_failure: Worker sets after MAX_RETRIES (3) failures
  - ready → errored: API/Worker sets when quiz/hooks deleted (auto-recovery)
  - * → skip_by_admin: Manual override by admin
```

#### **Worker Responsibilities:**

```
Worker must:
  1. Update session.status when hook_questions.status changes
  2. Update ALL sessions linked to same quiz_id (quiz sharing)
  3. Detect deleted/invalid quiz_id and trigger regeneration (set status='errored')
  4. Keep session.status in sync with hook_questions.status at all times

Status Sync Rules:
  - IF hook_questions.status = 'ready' → session.status = 'ready'
  - IF hook_questions.status = 'failed' AND retry_count < 3 → session.status = 'errored'
  - IF hook_questions.status = 'skip_by_failure' → session.status = 'skip_by_failure'
  - IF hook_questions.status = 'skip_by_admin' → session.status = 'skip_by_admin'
```

#### **Recovery from Deleted Quiz/Hooks:**

```
IF session.status = 'ready' BUT quiz/hooks deleted:
  - API or worker detects missing quiz_id data
  - Update session.status = 'errored'
  - Worker runs bootstrapQuiz to create new quiz
  - Worker updates session.quiz_id to new quiz
  - Worker processes hooks
  - Worker updates session.status = 'ready' when complete
```

#### **Worker Invocation Patterns:**

```
Pattern 1: API-triggered (fire and forget)
  - When session.status IN ('pending', 'errored')
  - API calls pendingWorkerLimit(() => processNextPendingHookV2())
  - Worker runs asynchronously
  - API returns immediately

Pattern 2: Scheduled (cron)
  - Periodic polling for stuck/failed jobs
  - Processes backlog of pending hooks
  - Ensures no jobs are missed

User Interaction:
  - API returns session immediately (status='pending' or 'errored')
  - User polls GET /quiz?q=<session_token> to check if ready
  - No WebSocket, no long-polling, no webhooks
```

---

### 2. Article

**Unique Key:** `normalized_url`

**Design Principles:**
- **Status field is source of truth** - Don't check storage_path, last_scraped_at when determining article behavior
- **ensureArticleContent() updates status** - No separate scraping worker
- **Content freshness = 30 days** - Stale content triggers re-scraping
- **Graceful degradation** - Use stale content if re-scraping fails (product decision, subject to change)

#### **Storage Flow:**

```
Scraping (from web):
  normalized_url → scrapeArticle() → raw content

Caching (to storage):
  raw content → uploadArticleBundle() → storage_path

Retrieval (from cache):
  storage_path → downloadArticleContent() → cached content

Summary:
  - Scrape FROM normalized_url (original article on web)
  - Upload TO storage_path (Supabase Storage bucket)
  - Download FROM storage_path (when reusing)
```

#### **When to REUSE existing article record (skip creating):**

```
IF article exists for normalized_url AND:
  - article.status IN ('ready', 'stale', 'scraping', 'pending', 'failed', 'skip_by_*')
THEN:
  - REUSE existing article record (never create duplicate)
  - Continue to behavior rules below
```

#### **When to CREATE new article:**

```
IF no article exists for normalized_url
THEN:
  - CREATE article with status='pending', storage_path=NULL
  - RETURN article
```

#### **Behavior Based on Status (for existing articles):**

```
CASE status = 'ready':
  - Content is fresh (last_scraped_at < 30 days)
  - Download FROM storage_path
  - Use cached content directly
  - No scraping needed

CASE status = 'stale':
  - Content exists but old (last_scraped_at >= 30 days)
  - Old content still available in storage_path
  - Trigger re-scraping FROM normalized_url
  - IF re-scraping succeeds:
      → Upload TO storage_path (overwrite)
      → Update status='ready'
  - IF re-scraping fails:
      → Download FROM storage_path (fallback to old content)
      → Keep status='stale' OR update to 'failed' (based on severity)
      → Use old content (graceful degradation)

CASE status = 'pending':
  - Article record exists but no content scraped yet
  - storage_path IS NULL
  - Trigger scraping FROM normalized_url
  - ensureArticleContent() updates to 'scraping'

CASE status = 'scraping':
  - Scraping currently in progress
  - Do NOT trigger another scrape (avoid duplicate work)
  - Wait for completion (or timeout)
  - Will update to 'ready' or 'failed'

CASE status = 'failed':
  - Previous scraping attempt failed
  - Trigger retry scraping FROM normalized_url
  - ensureArticleContent() updates to 'scraping'
  - After 3 failures → 'skip_by_failure'

CASE status IN ('skip_by_admin', 'skip_by_failure'):
  - Terminal state, cannot scrape
  - Throw error
  - Cannot generate quiz/hooks
```

#### **Status Transitions:**

```
Article Status Flow:
  pending → scraping → ready → stale → scraping → ready
               ↓                            ↓
            failed (retry up to 3)       failed
               ↓                            ↓
         skip_by_failure            skip_by_failure

  * → skip_by_admin (manual intervention)

Transition Rules:
  - pending → scraping: ensureArticleContent() starts initial scrape
  - scraping → ready: Upload to storage succeeds, set last_scraped_at
  - scraping → failed: Scraping/upload fails
  - failed → scraping: On retry (if retry_count < 3)
  - failed → skip_by_failure: After 3 consecutive failures
  - ready → stale: ensureArticleContent() checks (NOW() - last_scraped_at) > 30 days
  - stale → scraping: ensureArticleContent() starts re-scrape
  - * → skip_by_admin: Manual override

Note: 'stale' is set lazily when article is accessed, not by scheduled job
```

#### **ensureArticleContent() Responsibilities:**

```
ensureArticleContent() is called by hook worker and must:

  1. Check article.status (source of truth)

  2. CASE status = 'ready':
       - Check freshness: IF (NOW() - last_scraped_at) > 30 days
           THEN UPDATE status='stale', continue to Case 'stale'
       - Download FROM storage_path
       - RETURN cached content

  3. CASE status = 'stale':
       - Try re-scraping FROM normalized_url
       - IF success:
           → Upload TO storage_path
           → UPDATE status='ready', last_scraped_at=NOW()
           → RETURN fresh content
       - IF failure (graceful degradation):
           → Download FROM storage_path (old content)
           → Keep status='stale' (or 'failed' based on error type)
           → RETURN stale content (product decision: serve something vs nothing)

  4. CASE status IN ('pending', 'failed'):
       - UPDATE status='scraping'
       - Scrape FROM normalized_url
       - Upload TO storage_path
       - UPDATE status='ready', last_scraped_at=NOW()
       - RETURN fresh content
       - ON ERROR:
           → UPDATE status='failed', increment retry_count
           → IF retry_count >= 3 THEN UPDATE status='skip_by_failure'
           → THROW error

  5. CASE status = 'scraping':
       - Another process is scraping (race condition or timeout)
       - Wait or throw error (implementation detail)

  6. CASE status IN ('skip_by_*'):
       - THROW error (terminal state)
```

#### **Freshness Check Logic:**

```
Freshness constant:
  MAX_ARTICLE_AGE_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

Transition ready → stale:
  IF article.status = 'ready'
     AND article.last_scraped_at IS NOT NULL
     AND (NOW() - article.last_scraped_at) > MAX_ARTICLE_AGE_MS
  THEN:
    UPDATE article.status = 'stale'

This check happens in ensureArticleContent() before using content.
```

#### **Metadata Handling:**

```
Two types of metadata:

1. storage_metadata (JSONB):
   - Set during scraping/upload
   - Contains storage bucket info, fingerprints
   - Not used for quiz generation

2. metadata (JSONB):
   - Contains mixed data:
     a) Scraping metadata: title, byline, excerpt, lang (from @mozilla/readability)
     b) AI metadata: archetype, thesis, pedagogy (from hook generation)
   - Updated incrementally:
     → ensureArticleContent() adds scraping metadata
     → handleV2HookJob() merges AI metadata (preserves scraping metadata)

Merge strategy:
  mergedMetadata = {
    ...existingMetadata,
    title: scrapedTitle ?? existingTitle,  // Prefer new
    archetype: aiArchetype,                 // Add AI fields
  }
```

#### **Type Definition Update Required:**

```typescript
// apps/web/src/types/db.ts
export type ArticleStatus =
  | 'pending'
  | 'scraping'
  | 'ready'
  | 'stale'              // NEW STATUS
  | 'failed'
  | 'skip_by_admin'
  | 'skip_by_failure'
```

**Database Migration Required:**
- Add 'stale' to article_status enum
- No schema changes needed (just enum value)

---

### 3. Quiz

**Unique Key:** `article_id` (one quiz per article, versioned by creation time)

#### **When to REUSE existing quiz:**

```
IF latest quiz for article_id exists AND:
  - quiz.status IN ('ready', 'processing')
THEN:
  - Reuse quiz record
  - Return existing quiz
  - Do NOT create new quiz
```

#### **When to RESET and REUSE failed quiz:**

```
IF latest quiz for article_id exists AND:
  - quiz.status = 'failed'
THEN:
  - Update quiz.status = 'pending'
  - Clear quiz.model_used (error message)
  - Reuse same quiz record (keep quiz_id)
  - Trigger worker to reprocess
```

#### **When to CREATE new quiz:**

```
IF no quiz exists for article_id
OR latest quiz.status IN ('skip_by_admin', 'skip_by_failure')
THEN:
  - Create new quiz with status 'not_required'
  - Generate new quiz_id (UUID)
  - Link to article_id
  - Create corresponding hook_questions record
```

#### **When to SKIP quiz:**

```
Manual Skip:
  - Admin sets quiz.status = 'skip_by_admin'

Automatic Skip:
  - Article.status = 'skip_by_failure' → quiz.status = 'skip_by_failure'
  - Hook_questions.status = 'skip_by_failure' → quiz.status = 'skip_by_failure'
```

#### **Status Transitions:**

```
Quiz Status Flow:
  not_required → pending → processing → ready
                     ↓
                  failed (can retry)
                     ↓
              skip_by_failure (after max retries)

  * → skip_by_admin (manual intervention)

Transition Rules:
  - not_required → pending: When /api/instructions is called (user wants deep-dive)
  - not_required → not_required: Quiz stays inactive if only hooks are needed
  - pending → processing: When claim_next_instruction_job() claims it
  - processing → ready: When instruction questions are generated successfully
  - processing → failed: When generation fails
  - failed → pending: On retry (via resetFailedQuiz)
  - * → skip_by_admin: Manual override
  - * → skip_by_failure: When article or hooks are skipped
```

---

### 4. Hook Questions

**Unique Key:** `quiz_id` (1:1 relationship with quiz)

#### **When to REUSE existing hook_questions:**

```
IF hook_questions exists for quiz_id AND:
  - hook_questions.status = 'ready'
  - AND hook_questions.hooks IS NOT NULL
THEN:
  - Reuse hook_questions record
  - Do NOT reprocess
  - Return existing hooks
```

#### **When to RETRY failed hook_questions:**

```
IF hook_questions exists for quiz_id AND:
  - hook_questions.status = 'failed'
  - AND retry_count < MAX_RETRIES (3)
THEN:
  - Update hook_questions.status = 'pending'
  - Clear error_message
  - Increment retry_count
  - Trigger worker to reprocess
```

#### **When to REUSE pedagogy but regenerate hooks:**

```
IF hook_questions exists for quiz_id AND:
  - hook_questions.pedagogy IS NOT NULL (Step 5 complete)
  - AND hook_questions.hooks IS NULL (Step 6 incomplete)
  - AND hook_questions.status IN ('processing', 'failed')
THEN:
  - Skip Step 5 (metadata analysis)
  - Reuse pedagogy from hook_questions.pedagogy
  - Run Step 6 (hook generation)
```

#### **When to CREATE new hook_questions:**

```
IF no hook_questions exists for quiz_id
THEN:
  - Create hook_questions with status 'pending'
  - Set hooks = NULL
  - Set pedagogy = NULL
  - Trigger worker to process
```

#### **When to SKIP hook_questions:**

```
Manual Skip:
  - Admin sets hook_questions.status = 'skip_by_admin'

Automatic Skip:
  - Article.status = 'skip_by_failure' → hook_questions.status = 'skip_by_failure'
  - After MAX_RETRIES failures → hook_questions.status = 'skip_by_failure'
```

#### **Status Transitions:**

```
Hook Questions Status Flow:
  pending → processing → ready
               ↓
            failed (retry up to 3 times)
               ↓
         skip_by_failure (after 3 failures)

  * → skip_by_admin (manual intervention)

Transition Rules:
  - pending → processing: When claim_next_hook_job() claims it
  - processing → ready: When hooks are generated successfully
  - processing → failed: When generation fails
  - failed → pending: On retry (if retry_count < MAX_RETRIES)
  - failed → skip_by_failure: After MAX_RETRIES (3) consecutive failures
  - * → skip_by_admin: Manual override

Note: There is NO 'ready_pedagogy' intermediate status.
Pedagogy is stored in hook_questions.pedagogy JSONB field for idempotency,
but status remains 'processing' until final hooks are generated.
```

---

## Process Flow Specification (New Design)

### **Initialization Flow: `initSession(email, url)`**

```typescript
async function initSession(email: string, originalUrl: string) {
  const normalizedUrl = normalizeUrl(originalUrl)

  // Step 1: Get/create session (quiz_id can be NULL)
  let session = await getOrCreateSession(email, originalUrl)

  // Step 2: Early return if ready
  if (session.status === 'ready') {
    return session  // No work needed
  }

  // Step 3: Bootstrap quiz if session has no quiz_id
  if (!session.quiz_id) {
    // 3a. Create/get article
    const article = await getOrCreateArticle(normalizedUrl, originalUrl)

    // 3b. Create quiz (container, no transaction)
    const quiz = await createQuiz(article.id)

    // 3c. Create curiosity quiz (status='pending')
    await createCuriosityQuiz(quiz.id)

    // 3d. Link session to quiz
    session = await updateSession(session.id, { quiz_id: quiz.id })
  }

  // Step 4: Invoke worker if session needs processing
  if (session.status === 'pending' || session.status === 'errored') {
    pendingWorkerLimit(() => processNextPendingCuriosityQuiz())
  }

  return session
}
```

### **Worker Flow: `processNextPendingCuriosityQuiz()`**

```typescript
async function processNextPendingCuriosityQuiz() {
  // Step 1: Claim next pending curiosity quiz (atomic lock)
  const curiosityQuiz = await claimNextCuriosityQuiz()
  if (!curiosityQuiz) return  // No work

  try {
    // Step 2: Load article content
    const article = await getArticleByQuizId(curiosityQuiz.quiz_id)
    const content = await ensureArticleContent(article)

    // Step 3: Check if pedagogy already extracted (idempotency)
    let pedagogy
    if (curiosityQuiz.pedagogy) {
      pedagogy = curiosityQuiz.pedagogy  // Reuse
    } else {
      // Step 3a: Extract pedagogy (metadata analysis)
      pedagogy = await extractPedagogy(content)
      await updateCuriosityQuiz(curiosityQuiz.id, { pedagogy })
      await updateArticleMetadata(article.id, pedagogy)
    }

    // Step 4: Generate curiosity questions from pedagogy
    const questions = await generateCuriosityQuestions(pedagogy)

    // Step 5: Store questions and mark ready
    await updateCuriosityQuiz(curiosityQuiz.id, {
      questions,
      status: 'ready',
      model_version: GEMINI_MODEL
    })

    // Step 6: Update ALL sessions linked to this quiz
    await updateSessionsByQuizId(curiosityQuiz.quiz_id, { status: 'ready' })

  } catch (error) {
    // Handle failure
    await handleCuriosityQuizFailure(curiosityQuiz.id, error)
  }
}
```

### **Scaffold Quiz Flow: `POST /api/scaffold` (User requests deep-dive)**

```typescript
async function requestScaffoldQuiz(sessionToken: string) {
  // Step 1: Get session
  const session = await getSessionByToken(sessionToken)
  if (!session.quiz_id) throw new Error('Session has no quiz')

  // Step 2: Create scaffold quiz if doesn't exist
  let scaffoldQuiz = await getScaffoldQuizByQuizId(session.quiz_id)
  if (!scaffoldQuiz) {
    scaffoldQuiz = await createScaffoldQuiz(session.quiz_id, { status: 'pending' })
  }

  // Step 3: Invoke worker if pending
  if (scaffoldQuiz.status === 'pending' || scaffoldQuiz.status === 'failed') {
    pendingWorkerLimit(() => processNextPendingScaffoldQuiz())
  }

  return { scaffoldQuizId: scaffoldQuiz.id, status: scaffoldQuiz.status }
}
```

### **Detailed Flow Visualization:**

```
User submits URL + email:
  ↓
1. getOrCreateSession(email, url)
  ├─ IF session exists → REUSE
  └─ ELSE → CREATE with status='pending', quiz_id=NULL
  ↓
2. Check session.status
  ├─ IF 'ready' → RETURN immediately (early exit)
  └─ ELSE → Continue
  ↓
3. Check session.quiz_id
  ├─ IF NULL → Bootstrap quiz:
  │   ├─ 3a. getOrCreateArticle(normalized_url)
  │   ├─ 3b. createQuiz(article_id) → quiz.id
  │   ├─ 3c. createCuriosityQuiz(quiz.id, status='pending')
  │   └─ 3d. updateSession(session.id, quiz_id=quiz.id)
  └─ ELSE → Quiz already linked
  ↓
4. Check session.status
  ├─ IF 'pending' or 'errored' → invokeWorker()
  └─ ELSE → No worker needed
  ↓
5. RETURN session to user
  ↓
User polls GET /quiz?q=<token> until session.status='ready'

---

Background worker (fire-and-forget):
  ↓
6. claimNextCuriosityQuiz() → atomic lock
  ↓
7. ensureArticleContent(article)
  ├─ Check article.status
  ├─ IF 'ready' + fresh → Download from storage
  ├─ IF 'stale' or 'pending' → Scrape + upload
  └─ RETURN content
  ↓
8. Check curiosityQuiz.pedagogy
  ├─ IF NULL → extractPedagogy(content), store
  └─ ELSE → Reuse existing
  ↓
9. generateCuriosityQuestions(pedagogy)
  ↓
10. updateCuriosityQuiz(status='ready', questions)
  ↓
11. updateSessionsByQuizId(status='ready')  // ALL sessions
```

---

## Status Dependency Rules (New Design)

### **Session Status Depends On:**

```
session.status ← curiosity_quiz.status
  - curiosity='pending' → session='pending'
  - curiosity='processing' → session='pending'
  - curiosity='ready' → session='ready'
  - curiosity='failed' AND retry_count < 3 → session='errored'
  - curiosity='failed' AND retry_count >= 3 → session='skip_by_failure'
  - curiosity='skip_by_admin' → session='skip_by_admin'
```

### **Curiosity Quiz Status Depends On:**

```
curiosity_quiz.status transitions:
  - pending → processing: When claimed by worker
  - processing → ready: When questions generated successfully
  - processing → failed: When generation fails
  - failed → pending: On retry (if retry_count < 3)
  - failed → skip_by_failure: After 3 consecutive failures
  - * → skip_by_admin: Manual override
```

### **Scaffold Quiz Status (Independent):**

```
quiz.status = 'not_required' WHEN created (optional deep-dive not requested yet)
quiz.status = 'pending'      WHEN user requests /api/instructions
quiz.status = 'processing'   WHEN claimed by instruction worker
quiz.status = 'ready'        WHEN instruction questions generated
quiz.status = 'failed'       WHEN instruction generation fails
quiz.status = 'skip_by_failure' WHEN article.status = 'skip_by_failure'
```

### **Article Status Depends On:**

```
article.status = 'pending'   WHEN created
article.status = 'scraping'  WHEN ensureArticleContent() starts scraping
article.status = 'ready'     WHEN scraping succeeds OR reusing fresh content
article.status = 'failed'    WHEN scraping fails (can retry)
article.status = 'skip_by_failure' WHEN scraping fails 3+ times
```

---

## Update Triggers

### **When to Update Session Status:**

```
Trigger: hook_questions.status changes
Action:
  - IF hook_questions.status = 'ready'
      THEN UPDATE sessions SET status='ready' WHERE quiz_id = hook_questions.quiz_id

  - IF hook_questions.status = 'failed' AND retry_count < MAX_RETRIES
      THEN UPDATE sessions SET status='errored' WHERE quiz_id = hook_questions.quiz_id

  - IF hook_questions.status = 'skip_by_failure'
      THEN UPDATE sessions SET status='skip_by_failure' WHERE quiz_id = hook_questions.quiz_id
```

### **When to Update Article Status:**

```
Trigger: ensureArticleContent() called
Action:
  - IF reusing fresh content
      THEN UPDATE articles SET status='ready' WHERE id = article.id

  - IF starting scrape
      THEN UPDATE articles SET status='scraping' WHERE id = article.id

  - IF scrape succeeds
      THEN UPDATE articles SET status='ready' WHERE id = article.id

  - IF scrape fails
      THEN UPDATE articles SET status='failed' WHERE id = article.id
      THEN IF failure_count >= 3
           THEN UPDATE articles SET status='skip_by_failure' WHERE id = article.id
```

### **When to Update Hook Questions Status:**

```
Trigger: processNextPendingHookV2() processing
Action:
  - IF claim_next_hook_job() succeeds
      THEN UPDATE hook_questions SET status='processing' WHERE id = claimed_id

  - IF pedagogy + hooks generated successfully
      THEN UPDATE hook_questions SET status='ready' WHERE id = claimed_id

  - IF generation fails
      THEN UPDATE hook_questions SET status='failed', error_message=error WHERE id = claimed_id
      THEN IF retry_count >= MAX_RETRIES
           THEN UPDATE hook_questions SET status='skip_by_failure' WHERE id = claimed_id
```

### **When to Update Quiz Status:**

```
Trigger: /api/instructions called (user wants deep-dive)
Action:
  - IF quiz.status = 'not_required'
      THEN UPDATE quizzes SET status='pending' WHERE id = quiz.id

Trigger: claim_next_instruction_job() (worker picks up)
Action:
  - UPDATE quizzes SET status='processing' WHERE id = claimed_quiz_id

Trigger: Instruction questions generated
Action:
  - IF success
      THEN UPDATE quizzes SET status='ready' WHERE id = quiz.id
  - IF failure
      THEN UPDATE quizzes SET status='failed', model_used=error WHERE id = quiz.id
```

---

## Idempotency Rules

### **Session Idempotency:**

```
Multiple calls to initSession(email, url) with same parameters:
  - MUST return same session record
  - MUST NOT create duplicate sessions
  - MUST update quiz_id if quiz was regenerated
  - MUST update status based on current hook_questions.status
```

### **Article Idempotency:**

```
Multiple calls to bootstrapQuiz(url):
  - MUST return same article record for same normalized_url
  - MUST NOT re-scrape if content is fresh
  - MUST re-scrape if content is stale (>30 days)
  - MUST update article.status to 'ready' when reusing content
```

### **Quiz Idempotency:**

```
Multiple calls to bootstrapQuiz(url):
  - MUST return latest quiz for article
  - MUST NOT create new quiz if latest is 'ready' or 'processing'
  - MUST reset quiz if latest is 'failed'
  - MUST create new quiz if latest is 'skip_by_admin' or 'skip_by_failure'
```

### **Hook Questions Idempotency:**

```
Multiple calls to upsertHookQuestions(quiz_id, status='pending'):
  - MUST NOT overwrite existing hooks if status='ready'
  - MUST NOT reset to 'pending' if already 'ready'
  - MUST preserve pedagogy if already extracted
  - MUST only update if status allows transition (e.g., 'failed' → 'pending' on retry)
```

### **Pedagogy Idempotency (Step 5):**

```
Multiple calls to handleV2HookJob(quiz):
  - IF hook_questions.pedagogy IS NOT NULL
      THEN skip metadata analysis, reuse existing pedagogy
  - ELSE
      THEN run full analysis, store in hook_questions.pedagogy
```

---

## Error Handling & Retry Logic

### **Retry Policy:**

```
Entity: hook_questions
Max Retries: 3
Retry Delay: Immediate (worker picks up on next poll)

Retry Flow:
  1. Generation fails → status='failed', retry_count++
  2. IF retry_count < 3 → worker resets to 'pending', retries
  3. IF retry_count >= 3 → status='skip_by_failure', stop retrying
```

### **Cascading Failures:**

```
IF article.status = 'skip_by_failure'
  THEN hook_questions.status = 'skip_by_failure'
  THEN quiz.status = 'skip_by_failure'
  THEN session.status = 'skip_by_failure'

IF hook_questions.status = 'skip_by_failure'
  THEN session.status = 'skip_by_failure'
  THEN quiz.status = 'skip_by_failure' (if quiz exists)
```

---

## Configuration Constants

```typescript
// Article freshness
MAX_ARTICLE_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Retry limits
MAX_HOOK_RETRIES = 3
MAX_QUIZ_RETRIES = 3
MAX_SCRAPE_RETRIES = 3

// Worker concurrency
SESSION_WORKER_CONCURRENCY = 5
PENDING_WORKER_CONCURRENCY = 1
```

---

## Summary Table: Reuse vs Redo

| Entity | Reuse When | Redo When | Skip When |
|--------|-----------|----------|----------|
| **Session** | status IN ('pending', 'ready') | status IN ('completed', 'errored', 'skip_*') | Manual skip OR hook failures >= 3 |
| **Article Record** | normalized_url exists | Never (always reuse record) | N/A |
| **Article Content** | Fresh (<30 days) AND storage_path exists | Stale (>30 days) OR missing storage | Scrape failures >= 3 |
| **Quiz** | status IN ('ready', 'processing', 'not_required') | status = 'failed' | status IN ('skip_*') |
| **Hook Questions** | status = 'ready' AND hooks IS NOT NULL | status = 'failed' AND retries < 3 | retries >= 3 OR article skipped |
| **Pedagogy** | pedagogy IS NOT NULL | pedagogy IS NULL | N/A (part of hook questions) |

---

## Validation Checklist

Before marking session.status = 'ready', verify:
- ✓ hook_questions.status = 'ready'
- ✓ hook_questions.hooks IS NOT NULL
- ✓ article.status = 'ready'
- ✓ article.storage_path IS NOT NULL

Before marking hook_questions.status = 'ready', verify:
- ✓ hook_questions.hooks IS NOT NULL
- ✓ hook_questions.pedagogy IS NOT NULL
- ✓ article.metadata contains analysis data

Before reusing article content, verify:
- ✓ article.storage_path IS NOT NULL
- ✓ article.last_scraped_at < 30 days
- ✓ Content downloadable from storage
- ✓ Update article.status = 'ready'

Before reusing hook_questions, verify:
- ✓ hook_questions.status = 'ready'
- ✓ hook_questions.hooks IS NOT NULL
- ✓ Do NOT reset to 'pending'
