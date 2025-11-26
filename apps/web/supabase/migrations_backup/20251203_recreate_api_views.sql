-- Recreate api schema views after all table alterations are complete
-- This runs after all other migrations to ensure the views reflect the final schema

-- Sessions view
create or replace view api.sessions as
  select
    id,
    session_token,
    user_email,
    article_url,
    quiz_id,
    status,
    metadata,
    created_at,
    updated_at
  from public.sessions;

-- Quizzes view
create or replace view api.quizzes as
  select
    id,
    quiz_id,
    article_id,
    status,
    model_used,
    created_at
  from public.quizzes;

-- Articles view
create or replace view api.articles as
  select
    id,
    normalized_url,
    original_url,
    content_hash,
    storage_path,
    last_scraped_at,
    status,
    metadata,
    storage_metadata,
    content_medium
  from public.articles;

-- Questions view
create or replace view api.questions as
  select
    id,
    quiz_id,
    question_type,
    content,
    sort_order
  from public.questions;

-- Hook questions view
create or replace view api.hook_questions as
  select
    id,
    quiz_id,
    status,
    hooks,
    strategy_prompt,
    model_version,
    error_message,
    created_at,
    updated_at
  from public.hook_questions;

-- Grant permissions to service_role
grant select, insert, update on all tables in schema api to service_role;

-- Grant permissions to authenticated users (if needed)
-- Uncomment and adjust based on your access control requirements:
-- grant select on api.sessions to authenticated;
-- grant select on api.quizzes to authenticated;
-- grant select on api.articles to authenticated;
-- grant select on api.questions to authenticated;
-- grant select on api.hook_questions to authenticated;
