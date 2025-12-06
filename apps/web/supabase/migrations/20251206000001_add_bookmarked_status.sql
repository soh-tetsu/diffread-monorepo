-- Migration: Add bookmarked status to session_status enum
-- Date: 2025-12-06
-- Description: Add 'bookmarked' value to session_status enum for queue functionality
-- Note: This must be in a separate migration because ALTER TYPE ADD VALUE cannot run in a transaction block

-- Add 'bookmarked' to session_status enum
-- This will be placed before 'pending' in the enum order
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'bookmarked' BEFORE 'pending';

-- Add comment for documentation
COMMENT ON TYPE session_status IS 
  'Session lifecycle: bookmarked (waiting in queue) → pending (being generated) → ready (quiz available) → errored (failed)';
