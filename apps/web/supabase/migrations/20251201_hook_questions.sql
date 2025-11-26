-- Hook questions persistence

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hook_status') then
    create type hook_status as enum (
      'pending',
      'ready',
      'failed',
      'skip_by_admin',
      'skip_by_failure'
    );
  end if;
end
$$;

create table if not exists public.hook_questions (
  id bigserial primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  status hook_status not null default 'pending',
  hooks jsonb,
  strategy_prompt text,
  model_version text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hook_questions_quiz_id_key unique (quiz_id)
);

create or replace function public.touch_hook_questions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists hook_questions_set_updated_at on public.hook_questions;
create trigger hook_questions_set_updated_at
before update on public.hook_questions
for each row
execute procedure public.touch_hook_questions_updated_at();
