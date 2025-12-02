-- Migration: Redesign schema with Curiosity + Scaffold quizzes
-- Date: 2025-12-02
-- Description: Fresh start - drop old tables and create new schema

-- Drop old tables and types (fresh start)
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.hook_questions CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.quizzes CASCADE;
DROP TABLE IF EXISTS public.articles CASCADE;

DROP TYPE IF EXISTS quiz_status CASCADE;
DROP TYPE IF EXISTS hook_status CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;
DROP TYPE IF EXISTS article_status CASCADE;
DROP TYPE IF EXISTS content_medium CASCADE;

-- Create new enum types
CREATE TYPE content_medium AS ENUM ('markdown', 'pdf', 'html', 'unknown');

CREATE TYPE article_status AS ENUM (
  'pending',
  'scraping',
  'ready',
  'stale',
  'failed',
  'skip_by_admin',
  'skip_by_failure'
);

CREATE TYPE session_status AS ENUM (
  'pending',
  'ready',
  'errored',
  'skip_by_admin',
  'skip_by_failure'
);

CREATE TYPE curiosity_quiz_status AS ENUM (
  'pending',
  'processing',
  'ready',
  'failed',
  'skip_by_admin',
  'skip_by_failure'
);

CREATE TYPE scaffold_quiz_status AS ENUM (
  'pending',
  'processing',
  'ready',
  'failed',
  'skip_by_admin',
  'skip_by_failure'
);

-- Table 1: articles
CREATE TABLE public.articles (
  id BIGSERIAL PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  
  status article_status NOT NULL DEFAULT 'pending',
  storage_path TEXT,
  content_hash TEXT,
  last_scraped_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}',
  storage_metadata JSONB DEFAULT '{}',
  content_medium content_medium DEFAULT 'html',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_articles_normalized_url ON public.articles(normalized_url);
CREATE INDEX idx_articles_status ON public.articles(status);

-- Table 2: quizzes (container only)
CREATE TABLE public.quizzes (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  
  -- Future personalization (nullable for now)
  user_id BIGINT,
  variant TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One shared quiz per article (for now)
CREATE UNIQUE INDEX one_shared_quiz_per_article 
  ON public.quizzes(article_id) 
  WHERE user_id IS NULL;

CREATE INDEX idx_quizzes_article_id ON public.quizzes(article_id);

-- Table 3: curiosity_quizzes
CREATE TABLE public.curiosity_quizzes (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE UNIQUE,
  status curiosity_quiz_status NOT NULL DEFAULT 'pending',
  
  -- Questions data (JSONB)
  questions JSONB,
  pedagogy JSONB,
  
  -- Metadata
  model_version TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_curiosity_quizzes_status ON public.curiosity_quizzes(status);
CREATE INDEX idx_curiosity_quizzes_quiz_id ON public.curiosity_quizzes(quiz_id);

-- Table 4: scaffold_quizzes (created on-demand)
CREATE TABLE public.scaffold_quizzes (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE UNIQUE,
  status scaffold_quiz_status NOT NULL DEFAULT 'pending',
  
  -- Questions data (JSONB)
  questions JSONB,
  reading_plan JSONB,
  
  -- Metadata
  model_version TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scaffold_quizzes_status ON public.scaffold_quizzes(status);
CREATE INDEX idx_scaffold_quizzes_quiz_id ON public.scaffold_quizzes(quiz_id);

-- Table 5: sessions
CREATE TABLE public.sessions (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  user_email TEXT NOT NULL,
  article_url TEXT NOT NULL,
  
  quiz_id BIGINT REFERENCES public.quizzes(id) ON DELETE SET NULL,
  status session_status NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_email, article_url)
);

CREATE INDEX idx_sessions_quiz_id ON public.sessions(quiz_id);
CREATE INDEX idx_sessions_token ON public.sessions(session_token);
CREATE INDEX idx_sessions_email_url ON public.sessions(user_email, article_url);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quizzes_updated_at BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_curiosity_quizzes_updated_at BEFORE UPDATE ON public.curiosity_quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scaffold_quizzes_updated_at BEFORE UPDATE ON public.scaffold_quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RPC function: claim_next_curiosity_quiz (atomic lock)
CREATE OR REPLACE FUNCTION public.claim_next_curiosity_quiz()
RETURNS TABLE (
  curiosity_quiz_id BIGINT,
  quiz_id BIGINT,
  article_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
BEGIN
  -- Atomically claim and lock the next pending curiosity quiz
  UPDATE public.curiosity_quizzes cq
  SET status = 'processing'
  WHERE cq.id = (
    SELECT cq2.id
    FROM public.curiosity_quizzes cq2
    WHERE cq2.status = 'pending'
    ORDER BY cq2.updated_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING cq.id, cq.quiz_id
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

-- RPC function: claim_next_scaffold_quiz (atomic lock)
CREATE OR REPLACE FUNCTION public.claim_next_scaffold_quiz()
RETURNS TABLE (
  scaffold_quiz_id BIGINT,
  quiz_id BIGINT,
  article_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_id BIGINT;
  claimed_quiz_id BIGINT;
  claimed_article_id BIGINT;
BEGIN
  -- Atomically claim and lock the next pending scaffold quiz
  UPDATE public.scaffold_quizzes sq
  SET status = 'processing'
  WHERE sq.id = (
    SELECT sq2.id
    FROM public.scaffold_quizzes sq2
    WHERE sq2.status = 'pending'
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

-- Grant permissions (adjust role as needed)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Create hardened API schema (expose only necessary views)
CREATE SCHEMA IF NOT EXISTS api;

-- API View: articles
CREATE OR REPLACE VIEW api.articles AS
SELECT * FROM public.articles;

-- API View: quizzes
CREATE OR REPLACE VIEW api.quizzes AS
SELECT * FROM public.quizzes;

-- API View: curiosity_quizzes
CREATE OR REPLACE VIEW api.curiosity_quizzes AS
SELECT * FROM public.curiosity_quizzes;

-- API View: scaffold_quizzes
CREATE OR REPLACE VIEW api.scaffold_quizzes AS
SELECT * FROM public.scaffold_quizzes;

-- API View: sessions
CREATE OR REPLACE VIEW api.sessions AS
SELECT * FROM public.sessions;

-- API wrapper for RPC functions
CREATE OR REPLACE FUNCTION api.claim_next_curiosity_quiz()
RETURNS TABLE (
  curiosity_quiz_id BIGINT,
  quiz_id BIGINT,
  article_id BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.claim_next_curiosity_quiz();
$$;

CREATE OR REPLACE FUNCTION api.claim_next_scaffold_quiz()
RETURNS TABLE (
  scaffold_quiz_id BIGINT,
  quiz_id BIGINT,
  article_id BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.claim_next_scaffold_quiz();
$$;

-- Grant permissions on api schema
GRANT USAGE ON SCHEMA api TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA api TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
