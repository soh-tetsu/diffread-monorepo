-- Worker locking functions to prevent race conditions
-- These RPC functions use FOR UPDATE SKIP LOCKED for atomic job claiming

-- Claim next pending hook job
-- Returns quiz data and hook_id for the claimed job, or NULL if no jobs available
CREATE OR REPLACE FUNCTION api.claim_next_hook_job()
RETURNS TABLE (
  quiz_id bigint,
  article_id bigint,
  quiz_status quiz_status,
  hook_id bigint
)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_hook_id bigint;
  claimed_quiz_id bigint;
BEGIN
  -- Atomically claim and lock the next pending hook job
  UPDATE public.hook_questions h
  SET status = 'processing'
  WHERE id = (
    SELECT h2.id
    FROM public.hook_questions h2
    WHERE h2.status = 'pending'
    ORDER BY h2.updated_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING h.id, h.quiz_id
  INTO claimed_hook_id, claimed_quiz_id;

  -- If no job was claimed, return empty set
  IF claimed_hook_id IS NULL THEN
    RETURN;
  END IF;

  -- Return the quiz data joined with the claimed hook
  RETURN QUERY
  SELECT
    q.id,
    q.article_id,
    q.status,
    claimed_hook_id
  FROM public.quizzes q
  WHERE q.id = claimed_quiz_id;
END;
$$;

-- Claim next pending instruction job
-- Atomically transitions quiz from 'pending' to 'processing'
CREATE OR REPLACE FUNCTION api.claim_next_instruction_job()
RETURNS TABLE (
  id bigint,
  quiz_id uuid,
  article_id bigint,
  status quiz_status,
  model_used text,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.quizzes
  SET status = 'processing'
  WHERE id = (
    SELECT q.id
    FROM public.quizzes q
    WHERE q.status = 'pending'
    ORDER BY q.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    public.quizzes.id,
    public.quizzes.quiz_id,
    public.quizzes.article_id,
    public.quizzes.status,
    public.quizzes.model_used,
    public.quizzes.created_at;
END;
$$;

-- Grant execute permissions to service_role
GRANT EXECUTE ON FUNCTION api.claim_next_hook_job() TO service_role;
GRANT EXECUTE ON FUNCTION api.claim_next_instruction_job() TO service_role;
