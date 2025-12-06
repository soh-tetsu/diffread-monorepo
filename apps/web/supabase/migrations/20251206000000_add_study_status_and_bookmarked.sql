-- Migration: Add study_status column and bookmarked status
-- Date: 2025-12-06
-- Description: Add study progress tracking and bookmark queue functionality

-- Step 1: Drop dependent api.sessions view
DROP VIEW IF EXISTS api.sessions;

-- Step 2: Add new study_status type
CREATE TYPE study_status AS ENUM (
  'not_started',
  'curiosity_in_progress',
  'curiosity_completed',
  'scaffold_in_progress',
  'scaffold_completed',
  'archived'
);

-- Step 3: Add study_status column to sessions table
ALTER TABLE public.sessions 
  ADD COLUMN study_status study_status NOT NULL DEFAULT 'not_started';

-- Step 4: Add index for efficient queue queries
CREATE INDEX idx_sessions_study_status ON public.sessions(study_status);

-- Step 5: Add composite index for queue counting
-- (user_id + study_status for fast queue queries)
CREATE INDEX idx_sessions_user_study ON public.sessions(user_id, study_status) 
  WHERE study_status IN ('not_started', 'curiosity_in_progress');

-- Step 6: Add comment for documentation
COMMENT ON COLUMN public.sessions.study_status IS 
  'Tracks user progress through quiz: not_started → curiosity_in_progress → curiosity_completed → archived';

-- Step 7: Recreate api.sessions view with new column
CREATE OR REPLACE VIEW api.sessions AS
SELECT * FROM public.sessions;

-- Step 8: Regrant permissions on api schema
GRANT SELECT, INSERT, UPDATE, DELETE ON api.sessions TO service_role;
