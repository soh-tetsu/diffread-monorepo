-- Add pedagogy column, drop strategy_prompt, and add ready_pedagogy status

-- Add new status to hook_status enum
do $$
begin
  -- Add ready_pedagogy status if it doesn't exist
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'ready_pedagogy'
    and enumtypid = (select oid from pg_type where typname = 'hook_status')
  ) then
    alter type hook_status add value 'ready_pedagogy';
  end if;
end
$$;

-- Drop the API view first (it depends on strategy_prompt column)
drop view if exists api.hook_questions;

-- Drop strategy_prompt column (no longer used)
alter table public.hook_questions drop column if exists strategy_prompt;

-- Add pedagogy column to store V2 pedagogy data
alter table public.hook_questions add column if not exists pedagogy jsonb;

-- Recreate API view with new pedagogy column and without strategy_prompt
create or replace view api.hook_questions as
  select
    id,
    quiz_id,
    status,
    hooks,
    pedagogy,
    model_version,
    error_message,
    created_at,
    updated_at
  from public.hook_questions;

-- Ensure service_role has access
grant select, insert, update on all tables in schema api to service_role;
