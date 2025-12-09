-- Add retry_count column to articles table for zombie job recovery

ALTER TABLE public.articles 
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.articles.retry_count IS 'Number of times this article scraping has been retried after timeout';
