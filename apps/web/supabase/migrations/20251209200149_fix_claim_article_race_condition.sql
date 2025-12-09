-- Fix race condition in claim_article_for_scraping by adding row-level locking
-- This prevents multiple workers from claiming the same article simultaneously

-- Drop existing function
DROP FUNCTION IF EXISTS api.claim_article_for_scraping(bigint);

-- Recreate function with FOR UPDATE SKIP LOCKED
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
  -- Atomically claim and lock the article for scraping
  -- Only claim if status is 'pending', 'stale', or 'failed'
  -- Use FOR UPDATE SKIP LOCKED to prevent race conditions
  UPDATE public.articles a
  SET 
    status = 'scraping',
    updated_at = NOW()
  WHERE a.id = p_article_id
    AND a.id = (
      SELECT id
      FROM public.articles
      WHERE id = p_article_id
        AND status IN ('pending', 'stale', 'failed')
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

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION "api"."claim_article_for_scraping"("p_article_id" bigint) TO "service_role";
