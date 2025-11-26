-- Align quiz/instruction workflow statuses
-- Add new enum value (cannot use in same transaction)
alter type quiz_status add value if not exists 'not_required';

-- Allow hook workflows to represent in-progress states if needed later.
-- Only add if the type exists (it's created in a later migration)
do $$
begin
  if exists (select 1 from pg_type where typname = 'hook_status') then
    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'hook_status'::regtype
        and enumlabel = 'processing'
    ) then
      alter type hook_status add value 'processing';
    end if;
  end if;
end
$$;

-- Ensure every quiz has a hook row so the worker can detect pending hooks.
-- Only insert if the table exists (it's created in a later migration)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'hook_questions'
  ) then
    insert into public.hook_questions (quiz_id, status)
    select q.id, 'pending'
    from public.quizzes q
    where not exists (
      select 1 from public.hook_questions h where h.quiz_id = q.id
    )
    on conflict do nothing;
  end if;
end
$$;
