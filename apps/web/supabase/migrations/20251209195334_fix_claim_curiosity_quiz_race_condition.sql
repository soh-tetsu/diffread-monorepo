-- Fix race condition in claim_specific_curiosity_quiz by adding row-level locking
-- This prevents multiple workers from claiming the same quiz simultaneously

-- Drop existing functions
DROP FUNCTION IF EXISTS api.claim_specific_curiosity_quiz(bigint);
DROP FUNCTION IF EXISTS public.claim_specific_curiosity_quiz(bigint);

-- Recreate public function with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) 
RETURNS TABLE("curiosity_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint, "claimed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
BEGIN
  -- Atomically claim and lock the specific curiosity quiz if it's pending or failed
  -- Use FOR UPDATE SKIP LOCKED to prevent race conditions
  UPDATE public.curiosity_quizzes cq
  SET status = 'processing'
  WHERE cq.id = p_curiosity_quiz_id
    AND cq.id = (
      SELECT id
      FROM public.curiosity_quizzes
      WHERE id = p_curiosity_quiz_id
        AND status IN ('pending', 'failed')
      FOR UPDATE SKIP LOCKED
    )
  RETURNING cq.id, cq.quiz_id
  INTO claimed_id, claimed_quiz_id;

  -- If no job was claimed, return the quiz info but with claimed=false
  IF claimed_id IS NULL THEN
    SELECT cq.id, cq.quiz_id
    INTO claimed_id, claimed_quiz_id
    FROM public.curiosity_quizzes cq
    WHERE cq.id = p_curiosity_quiz_id;

    IF claimed_id IS NULL THEN
      RETURN;
    END IF;

    SELECT q.article_id INTO claimed_article_id
    FROM public.quizzes q
    WHERE q.id = claimed_quiz_id;

    RETURN QUERY SELECT claimed_id, claimed_quiz_id, claimed_article_id, FALSE;
    RETURN;
  END IF;

  SELECT q.article_id INTO claimed_article_id
  FROM public.quizzes q
  WHERE q.id = claimed_quiz_id;

  RETURN QUERY SELECT claimed_id, claimed_quiz_id, claimed_article_id, TRUE;
END;
$$;

ALTER FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) OWNER TO "postgres";

-- Recreate API schema wrapper
CREATE OR REPLACE FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) 
RETURNS TABLE("curiosity_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint, "claimed" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM public.claim_specific_curiosity_quiz(p_curiosity_quiz_id);
$$;

ALTER FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) OWNER TO "postgres";

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) TO "service_role";
