-- Migration: Add claim_article_for_scraping RPC function
-- Purpose: Atomic lock for article scraping to prevent concurrent scraping of same article
-- Date: 2025-12-07

-- RPC function: claim_article_for_scraping (atomic lock)
-- This prevents multiple workers from scraping the same article simultaneously
CREATE OR REPLACE FUNCTION api.claim_article_for_scraping(p_article_id BIGINT)
RETURNS TABLE (
  article_id BIGINT,
  normalized_url TEXT,
  original_url TEXT,
  claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_article_id BIGINT;
  claimed_normalized_url TEXT;
  claimed_original_url TEXT;
BEGIN
  -- Atomically claim and lock the article for scraping
  -- Only claim if status is 'pending', 'stale', or 'failed'
  UPDATE public.articles a
  SET 
    status = 'scraping',
    updated_at = NOW()
  WHERE a.id = p_article_id
    AND a.status IN ('pending', 'stale', 'failed')
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

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION api.claim_article_for_scraping(BIGINT) TO service_role;

COMMENT ON FUNCTION api.claim_article_for_scraping IS 
  'Atomically claims an article for scraping by setting status to scraping. Returns claimed=true if successful, false if already being scraped.';
