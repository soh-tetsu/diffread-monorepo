-- Remove user_id from quizzes table
-- Previously reserved for "user-specific quizzes" feature, now removed for simplicity
-- Quizzes are article-level, not user-level

-- Drop dependent view
DROP VIEW IF EXISTS "api"."quizzes";

-- Drop foreign key constraint
ALTER TABLE "public"."quizzes"
DROP CONSTRAINT IF EXISTS "quizzes_user_id_fkey";

-- Drop old unique index that filtered on user_id IS NULL
DROP INDEX IF EXISTS "one_shared_quiz_per_article";

-- Drop user_id column
ALTER TABLE "public"."quizzes"
DROP COLUMN IF EXISTS "user_id";

-- Add new simple unique constraint on article_id
ALTER TABLE "public"."quizzes"
ADD CONSTRAINT "quizzes_article_id_key" UNIQUE ("article_id");

-- Recreate view without user_id column
CREATE OR REPLACE VIEW "api"."quizzes" AS
 SELECT "id",
    "article_id",
    "variant",
    "created_at",
    "updated_at"
   FROM "public"."quizzes";

ALTER VIEW "api"."quizzes" OWNER TO "postgres";

-- Grant permissions to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON "api"."quizzes" TO "service_role";
