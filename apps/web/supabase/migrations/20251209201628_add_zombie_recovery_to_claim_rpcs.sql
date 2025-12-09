-- Add zombie job recovery to all claim RPC functions
-- Automatically retry timed-out jobs (processing > 3 minutes) once
-- Mark as failed if already retried

-- ============================================================================
-- 1. Update claim_specific_curiosity_quiz
-- ============================================================================

DROP FUNCTION IF EXISTS api.claim_specific_curiosity_quiz(bigint);
DROP FUNCTION IF EXISTS public.claim_specific_curiosity_quiz(bigint);

CREATE OR REPLACE FUNCTION "public"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) 
RETURNS TABLE("curiosity_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint, "claimed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
  is_timeout_retry BOOLEAN;
BEGIN
  -- First, mark timed-out jobs with retry_count >= 1 as failed
  UPDATE public.curiosity_quizzes
  SET 
    status = 'failed',
    error_message = 'Timed out after 3 minutes (retry limit reached)'
  WHERE id = p_curiosity_quiz_id
    AND status = 'processing'
    AND updated_at < NOW() - INTERVAL '3 minutes'
    AND retry_count >= 1;

  -- Atomically claim and lock the specific curiosity quiz
  -- Claim if: pending, failed, OR timed-out with retry_count < 1
  UPDATE public.curiosity_quizzes cq
  SET 
    status = 'processing',
    retry_count = CASE 
      WHEN cq.status = 'processing' AND cq.updated_at < NOW() - INTERVAL '3 minutes' 
      THEN cq.retry_count + 1 
      ELSE cq.retry_count 
    END
  WHERE cq.id = p_curiosity_quiz_id
    AND cq.id = (
      SELECT id
      FROM public.curiosity_quizzes
      WHERE id = p_curiosity_quiz_id
        AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' 
              AND updated_at < NOW() - INTERVAL '3 minutes' 
              AND retry_count < 1)
        )
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

CREATE OR REPLACE FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) 
RETURNS TABLE("curiosity_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint, "claimed" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM public.claim_specific_curiosity_quiz(p_curiosity_quiz_id);
$$;

ALTER FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "api"."claim_specific_curiosity_quiz"("p_curiosity_quiz_id" bigint) TO "service_role";

-- ============================================================================
-- 2. Update claim_article_for_scraping
-- ============================================================================

DROP FUNCTION IF EXISTS api.claim_article_for_scraping(bigint);

CREATE OR REPLACE FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) 
RETURNS TABLE("article_id" bigint, "normalized_url" "text", "original_url" "text", "claimed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_article_id BIGINT;
  claimed_normalized_url TEXT;
  claimed_original_url TEXT;
BEGIN
  -- First, mark timed-out articles with retry_count >= 1 as failed
  UPDATE public.articles
  SET 
    status = 'failed',
    error_message = 'Scraping timed out after 3 minutes (retry limit reached)'
  WHERE id = p_article_id
    AND status = 'scraping'
    AND updated_at < NOW() - INTERVAL '3 minutes'
    AND retry_count >= 1;

  -- Atomically claim and lock the article for scraping
  -- Claim if: pending, stale, failed, OR timed-out with retry_count < 1
  UPDATE public.articles a
  SET 
    status = 'scraping',
    updated_at = NOW(),
    retry_count = CASE 
      WHEN a.status = 'scraping' AND a.updated_at < NOW() - INTERVAL '3 minutes' 
      THEN a.retry_count + 1 
      ELSE a.retry_count 
    END
  WHERE a.id = p_article_id
    AND a.id = (
      SELECT id
      FROM public.articles
      WHERE id = p_article_id
        AND (
          status IN ('pending', 'stale', 'failed')
          OR (status = 'scraping' 
              AND updated_at < NOW() - INTERVAL '3 minutes' 
              AND retry_count < 1)
        )
      FOR UPDATE SKIP LOCKED
    )
  RETURNING a.id, a.normalized_url, a.original_url
  INTO claimed_article_id, claimed_normalized_url, claimed_original_url;

  -- If article was claimed, return success
  IF claimed_article_id IS NOT NULL THEN
    RETURN QUERY SELECT claimed_article_id, claimed_normalized_url, claimed_original_url, TRUE;
  ELSE
    -- Article is already being scraped or in terminal state
    -- Return article info but with claimed = FALSE
    SELECT a.id, a.normalized_url, a.original_url
    INTO claimed_article_id, claimed_normalized_url, claimed_original_url
    FROM public.articles a
    WHERE a.id = p_article_id;
    
    RETURN QUERY SELECT claimed_article_id, claimed_normalized_url, claimed_original_url, FALSE;
  END IF;
END;
$$;

ALTER FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) OWNER TO "postgres";
COMMENT ON FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) IS 'Atomically claims an article for scraping by setting status to scraping. Returns claimed=true if successful, false if already being scraped.';
GRANT EXECUTE ON FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) TO "service_role";

-- ============================================================================
-- 3. Update claim_next_scaffold_quiz
-- ============================================================================

DROP FUNCTION IF EXISTS api.claim_next_scaffold_quiz();
DROP FUNCTION IF EXISTS public.claim_next_scaffold_quiz();

CREATE OR REPLACE FUNCTION "public"."claim_next_scaffold_quiz"() 
RETURNS TABLE("scaffold_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
BEGIN
  -- First, mark all timed-out scaffold quizzes with retry_count >= 1 as failed
  UPDATE public.scaffold_quizzes
  SET 
    status = 'failed',
    error_message = 'Timed out after 3 minutes (retry limit reached)'
  WHERE status = 'processing'
    AND updated_at < NOW() - INTERVAL '3 minutes'
    AND retry_count >= 1;

  -- Atomically claim and lock the next scaffold quiz
  -- Claim if: pending, OR timed-out with retry_count < 1
  UPDATE public.scaffold_quizzes sq
  SET 
    status = 'processing',
    retry_count = CASE 
      WHEN sq.status = 'processing' AND sq.updated_at < NOW() - INTERVAL '3 minutes' 
      THEN sq.retry_count + 1 
      ELSE sq.retry_count 
    END
  WHERE sq.id = (
    SELECT sq2.id
    FROM public.scaffold_quizzes sq2
    WHERE sq2.status = 'pending'
       OR (sq2.status = 'processing' 
           AND sq2.updated_at < NOW() - INTERVAL '3 minutes' 
           AND sq2.retry_count < 1)
    ORDER BY sq2.updated_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING sq.id, sq.quiz_id
  INTO claimed_id, claimed_quiz_id;

  -- If no job was claimed, return empty
  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  -- Get article_id from quiz
  SELECT q.article_id INTO claimed_article_id
  FROM public.quizzes q
  WHERE q.id = claimed_quiz_id;

  -- Return claimed job info
  RETURN QUERY SELECT claimed_id, claimed_quiz_id, claimed_article_id;
END;
$$;

ALTER FUNCTION "public"."claim_next_scaffold_quiz"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "api"."claim_next_scaffold_quiz"() 
RETURNS TABLE("scaffold_quiz_id" bigint, "quiz_id" bigint, "article_id" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM public.claim_next_scaffold_quiz();
$$;

ALTER FUNCTION "api"."claim_next_scaffold_quiz"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "api"."claim_next_scaffold_quiz"() TO "service_role";
