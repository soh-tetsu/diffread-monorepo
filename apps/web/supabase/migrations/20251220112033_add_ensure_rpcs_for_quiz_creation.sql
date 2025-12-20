-- RPC functions for atomic create-if-absent operations
-- These functions use UPSERT pattern for atomic creation under uniqueness constraints

-- ensure_article_exists: Atomically create or return existing article
CREATE OR REPLACE FUNCTION "public"."ensure_article_exists"(
  "p_normalized_url" text,
  "p_original_url" text
)
RETURNS TABLE(
  "article_id" bigint,
  "normalized_url" text,
  "original_url" text,
  "status" "public"."article_status",
  "created_at" timestamp with time zone
)
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  INSERT INTO "public"."articles" (
    "normalized_url",
    "original_url",
    "status",
    "metadata",
    "storage_metadata"
  )
  VALUES (
    p_normalized_url,
    p_original_url,
    'pending'::"public"."article_status",
    '{}'::"jsonb",
    '{}'::"jsonb"
  )
  ON CONFLICT ("normalized_url")
  DO UPDATE SET
    "original_url" = EXCLUDED."original_url",
    "updated_at" = now()
  RETURNING
    "id" AS "article_id",
    "normalized_url",
    "original_url",
    "status",
    "created_at";
$$;

-- ensure_quiz_exists: Atomically create or return existing quiz for article
CREATE OR REPLACE FUNCTION "public"."ensure_quiz_exists"(
  "p_article_id" bigint
)
RETURNS TABLE(
  "quiz_id" bigint,
  "article_id" bigint,
  "created_at" timestamp with time zone
)
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  INSERT INTO "public"."quizzes" (
    "article_id",
    "variant"
  )
  VALUES (
    p_article_id,
    NULL
  )
  ON CONFLICT ("article_id")
  DO UPDATE SET
    "updated_at" = now()
  RETURNING
    "id" AS "quiz_id",
    "article_id",
    "created_at";
$$;

-- ensure_curiosity_quiz_exists: Atomically create or return existing curiosity quiz
CREATE OR REPLACE FUNCTION "public"."ensure_curiosity_quiz_exists"(
  "p_quiz_id" bigint
)
RETURNS TABLE(
  "curiosity_quiz_id" bigint,
  "quiz_id" bigint,
  "status" "public"."curiosity_quiz_status",
  "created_at" timestamp with time zone
)
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  INSERT INTO "public"."curiosity_quizzes" (
    "quiz_id",
    "status"
  )
  VALUES (
    p_quiz_id,
    'pending'::"public"."curiosity_quiz_status"
  )
  ON CONFLICT ("quiz_id")
  DO UPDATE SET
    "updated_at" = now()
  RETURNING
    "id" AS "curiosity_quiz_id",
    "quiz_id",
    "status",
    "created_at";
$$;

-- Expose RPC functions via API schema
CREATE OR REPLACE FUNCTION "api"."ensure_article_exists"(
  "p_normalized_url" text,
  "p_original_url" text
)
RETURNS TABLE(
  "article_id" bigint,
  "normalized_url" text,
  "original_url" text,
  "status" "public"."article_status",
  "created_at" timestamp with time zone
)
LANGUAGE "sql"
SECURITY DEFINER
AS $$
  SELECT * FROM public.ensure_article_exists(p_normalized_url, p_original_url);
$$;

CREATE OR REPLACE FUNCTION "api"."ensure_quiz_exists"(
  "p_article_id" bigint
)
RETURNS TABLE(
  "quiz_id" bigint,
  "article_id" bigint,
  "created_at" timestamp with time zone
)
LANGUAGE "sql"
SECURITY DEFINER
AS $$
  SELECT * FROM public.ensure_quiz_exists(p_article_id);
$$;

CREATE OR REPLACE FUNCTION "api"."ensure_curiosity_quiz_exists"(
  "p_quiz_id" bigint
)
RETURNS TABLE(
  "curiosity_quiz_id" bigint,
  "quiz_id" bigint,
  "status" "public"."curiosity_quiz_status",
  "created_at" timestamp with time zone
)
LANGUAGE "sql"
SECURITY DEFINER
AS $$
  SELECT * FROM public.ensure_curiosity_quiz_exists(p_quiz_id);
$$;

-- Grant permissions to service_role
GRANT EXECUTE ON FUNCTION "public"."ensure_article_exists"(text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."ensure_quiz_exists"(bigint) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."ensure_curiosity_quiz_exists"(bigint) TO "service_role";
GRANT EXECUTE ON FUNCTION "api"."ensure_article_exists"(text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "api"."ensure_quiz_exists"(bigint) TO "service_role";
GRANT EXECUTE ON FUNCTION "api"."ensure_curiosity_quiz_exists"(bigint) TO "service_role";
