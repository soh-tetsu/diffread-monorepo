@Task: Implement the Database Access Layer (DAL) for DiffRead
@Context: We are building a Next.js (App Router) prototype with Supabase.
@TechStack: TypeScript, Supabase Client (No ORM).

@Database_Schema:
Please strictly follow this SQL definition for the types and logic:

1. Tables:
   - `articles`: (id, normalized_url, original_url, content_hash, storage_path, last_scraped_at, status, metadata, storage_metadata, content_medium)
   - `quizzes`: (id, quiz_id [UUID], article_id, status, model_used, created_at)
   - `questions`: (id, quiz_id, question_type, content, sort_order)
   - `sessions`: (id, session_token [UUID], user_email, article_url, quiz_id, status, metadata)

2. Key Logic Constraints:
   - Uniqueness: `articles` is unique by `normalized_url`.
   - Article statuses include: `pending`, `scraping`, `ready`, `failed`, `skip_by_admin`, `skip_by_failure`.
   - `articles.metadata` keeps Readability metadata (title/site/lang). `storage_path` references a Supabase Storage object (markdown or pdf), `storage_metadata` stores size + URL fingerprint + bucket, and `content_medium` (`markdown|pdf|html|unknown`) clarifies what lives at that path.
   - Uniqueness: `quizzes.quiz_id` is unique so async jobs can reference quizzes idempotently.
   - Quiz statuses include: `pending`, `processing`, `ready`, `failed`, `skip_by_admin`, `skip_by_failure`.
   - Session statuses include: `pending`, `ready`, `completed`, `errored`, `skip_by_admin`, `skip_by_failure`.
   - Uniqueness: `sessions` is unique by (`user_email`, `article_url`).
   - Flexibility: `questions.content` is a JSONB column.

@Requirements:

1. Create `src/lib/supabase.ts`:
   - Initialize the Supabase client using environment variables.

2. Create `src/types/db.ts`:
   - Define TypeScript interfaces for all 4 tables.
   - For `QuestionContent`, define a Union Type (MCQ | TrueFalse) to handle the JSON structure safely.

3. Create `src/lib/db/sessions.ts` (Helper Functions):
   - `getOrCreateSession(email: string, originalUrl: string)`:
     - Logic: First try to find an existing session for this user+url.
     - If exists, return it (Prevents OpenAI waste).
     - If not, create a NEW session with status 'pending' and return it.

4. Create `src/lib/db/articles.ts` (Helper Functions):
   - `findFreshArticle(normalizedUrl: string)`:
     - Check if article exists AND `last_scraped_at` is < 30 days old.
     - If valid, return the article + its latest 'ready' quiz.

5. Create `src/lib/db/quizzes.ts` (Helper Functions):
   - `saveQuiz(articleId: number, quizData: any)`:
     - Performs a transactional insert:
       1. Create `quizzes` row.
       2. Bulk insert `questions`.

@Note: Do NOT use Prisma. Use `supabase.from('table').select()` syntax.
