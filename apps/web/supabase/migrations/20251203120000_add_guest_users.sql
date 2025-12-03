-- Migration: Add users table and bind sessions/quizzes to guest profiles
-- Date: 2025-12-03
-- Description: Introduce persistent guest identities and enforce session-token bindings via user_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_method TEXT NOT NULL DEFAULT 'guest',
  email TEXT UNIQUE,
  display_name TEXT,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (auth_method IN ('guest', 'email', 'oauth', 'admin'))
);

-- Reuse shared updated_at trigger
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Rebuild api view before altering sessions
DROP VIEW IF EXISTS api.sessions;

-- Add user_id to sessions (nullable during backfill)
ALTER TABLE public.sessions
  ADD COLUMN user_id UUID REFERENCES public.users(id);

-- Seed users from existing session emails
WITH distinct_emails AS (
  SELECT DISTINCT user_email FROM public.sessions WHERE user_email IS NOT NULL
)
INSERT INTO public.users (id, auth_method, email, metadata)
SELECT gen_random_uuid(), 'guest', de.user_email,
       jsonb_build_object('seeded_from', 'session_migration')
FROM distinct_emails de
ON CONFLICT (email) DO NOTHING;

-- Link sessions to the new users
UPDATE public.sessions s
SET user_id = u.id
FROM public.users u
WHERE u.email = s.user_email;

-- Make user_id required
ALTER TABLE public.sessions
  ALTER COLUMN user_id SET NOT NULL;

-- Replace unique constraint to operate on user_id
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_user_email_article_url_key;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_user_id_article_url_key UNIQUE (user_id, article_url);

-- Recreate hardened view now that schema changed
CREATE OR REPLACE VIEW api.sessions AS
SELECT * FROM public.sessions;

GRANT SELECT, INSERT, UPDATE, DELETE ON api.sessions TO service_role;

-- Rebuild quizzes.user_id as a UUID foreign key
DROP VIEW IF EXISTS api.quizzes;
DROP INDEX IF EXISTS one_shared_quiz_per_article;

ALTER TABLE public.quizzes
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.quizzes
  ADD COLUMN user_id UUID REFERENCES public.users(id);

CREATE UNIQUE INDEX one_shared_quiz_per_article
  ON public.quizzes(article_id)
  WHERE user_id IS NULL;

CREATE OR REPLACE VIEW api.quizzes AS
SELECT * FROM public.quizzes;

GRANT SELECT, INSERT, UPDATE, DELETE ON api.quizzes TO service_role;

-- Grant privileges on the new table
GRANT ALL ON public.users TO service_role;

-- Expose users via api schema (optional view for future use)
CREATE OR REPLACE VIEW api.users AS
SELECT * FROM public.users;

GRANT SELECT, INSERT, UPDATE, DELETE ON api.users TO service_role;
