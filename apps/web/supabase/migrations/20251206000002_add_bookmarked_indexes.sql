-- Migration: Add indexes for bookmarked status
-- Date: 2025-12-06
-- Description: Add indexes that use the 'bookmarked' enum value
-- Note: This must be in a separate migration after the enum value is added
--       because PostgreSQL requires a new transaction to use new enum values

-- Add index for finding oldest bookmarked sessions
-- (user_id + created_at for queue processing)
CREATE INDEX IF NOT EXISTS idx_sessions_bookmarked ON public.sessions(user_id, created_at) 
  WHERE status = 'bookmarked';
