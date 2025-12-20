-- Rename claim_specific_curiosity_quiz to claim_curiosity_quiz_for_generation
-- for consistency with unified naming pattern

-- Rename public function
CREATE OR REPLACE FUNCTION "public"."claim_curiosity_quiz_for_generation"(
  "p_curiosity_quiz_id" bigint
)
RETURNS TABLE(
  "curiosity_quiz_id" bigint,
  "quiz_id" bigint,
  "article_id" bigint,
  "claimed" boolean
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public', 'pg_temp'
AS $$
DECLARE
  v_curiosity_quiz_id bigint;
  v_quiz_id bigint;
  v_article_id bigint;
BEGIN
  -- Try to lock and claim the curiosity quiz for generation
  SELECT cq."id", cq."quiz_id"
  INTO v_curiosity_quiz_id, v_quiz_id
  FROM "public"."curiosity_quizzes" cq
  WHERE cq."id" = p_curiosity_quiz_id
    AND cq."status" IN ('pending', 'failed')
  FOR UPDATE SKIP LOCKED;

  IF v_curiosity_quiz_id IS NOT NULL THEN
    -- Update status to processing
    UPDATE "public"."curiosity_quizzes"
    SET "status" = 'processing'
    WHERE "id" = v_curiosity_quiz_id;

    -- Get article_id from quiz
    SELECT q."article_id"
    INTO v_article_id
    FROM "public"."quizzes" q
    WHERE q."id" = v_quiz_id;

    RETURN QUERY SELECT v_curiosity_quiz_id, v_quiz_id, v_article_id, true;
  ELSE
    RETURN QUERY SELECT NULL::bigint, NULL::bigint, NULL::bigint, false;
  END IF;
END;
$$;

-- Rename API wrapper function
CREATE OR REPLACE FUNCTION "api"."claim_curiosity_quiz_for_generation"(
  "p_curiosity_quiz_id" bigint
)
RETURNS TABLE(
  "curiosity_quiz_id" bigint,
  "quiz_id" bigint,
  "article_id" bigint,
  "claimed" boolean
)
LANGUAGE "sql"
SECURITY DEFINER
AS $$
  SELECT * FROM public.claim_curiosity_quiz_for_generation(p_curiosity_quiz_id);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."claim_curiosity_quiz_for_generation"(bigint) TO "service_role";
GRANT EXECUTE ON FUNCTION "api"."claim_curiosity_quiz_for_generation"(bigint) TO "service_role";

-- Drop old function if it exists
DROP FUNCTION IF EXISTS "api"."claim_specific_curiosity_quiz"(bigint) CASCADE;
DROP FUNCTION IF EXISTS "public"."claim_specific_curiosity_quiz"(bigint) CASCADE;
