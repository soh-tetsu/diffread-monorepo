-- Drop unused claim_next_* RPC functions
-- We now use specific quiz claiming (claim_specific_curiosity_quiz) for session-driven processing
-- Scaffold quiz also doesn't need global queue claiming

DROP FUNCTION IF EXISTS api.claim_next_curiosity_quiz();
DROP FUNCTION IF EXISTS public.claim_next_curiosity_quiz();

DROP FUNCTION IF EXISTS api.claim_next_scaffold_quiz();
DROP FUNCTION IF EXISTS public.claim_next_scaffold_quiz();
