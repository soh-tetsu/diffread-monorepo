-- Add error_message column to articles table
ALTER TABLE public.articles
ADD COLUMN error_message TEXT;

COMMENT ON COLUMN public.articles.error_message IS 'Error message from the last failed operation (truncated to 500 chars)';

-- Drop and recreate api.articles view to include error_message
DROP VIEW IF EXISTS api.articles;

CREATE OR REPLACE VIEW api.articles AS
SELECT
  id,
  normalized_url,
  original_url,
  status,
  error_message,
  storage_path,
  content_hash,
  last_scraped_at,
  metadata,
  storage_metadata,
  content_medium,
  created_at,
  updated_at
FROM public.articles;

ALTER VIEW api.articles OWNER TO postgres;

-- Grant permissions (using the same pattern as consolidated schema)
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE api.articles TO service_role;
