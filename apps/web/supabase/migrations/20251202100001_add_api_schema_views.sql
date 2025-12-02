-- Migration: Add API schema views
-- Date: 2025-12-02
-- Description: Create api schema with views for hardened access

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
