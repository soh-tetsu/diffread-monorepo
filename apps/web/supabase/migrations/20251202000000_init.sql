-- Diffread consolidated schema
-- Generated from squashing all previous migrations

-- Extensions
create extension if not exists "pgcrypto";

-- Create api schema for hardened Data API access
create schema if not exists api;
grant usage on schema api to service_role;

-- Enum types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'quiz_status') then
    create type quiz_status as enum (
      'not_required',
      'pending',
      'processing',
      'ready',
      'failed',
      'skip_by_admin',
      'skip_by_failure'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type session_status as enum (
      'pending',
      'ready',
      'completed',
      'errored',
      'skip_by_admin',
      'skip_by_failure'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'article_status') then
    create type article_status as enum (
      'pending',
      'scraping',
      'ready',
      'failed',
      'skip_by_admin',
      'skip_by_failure'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'question_type') then
    create type question_type as enum ('mcq', 'true_false');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_medium') then
    create type content_medium as enum ('markdown', 'pdf', 'html', 'unknown');
  end if;

  if not exists (select 1 from pg_type where typname = 'hook_status') then
    create type hook_status as enum (
      'pending',
      'processing',
      'ready',
      'failed',
      'skip_by_admin',
      'skip_by_failure'
    );
  end if;
end
$$;

-- Articles table
create table if not exists public.articles (
  id bigserial primary key,
  normalized_url text not null,
  original_url text not null,
  content_hash text,
  storage_path text,
  last_scraped_at timestamptz,
  status article_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  storage_metadata jsonb not null default '{}'::jsonb,
  content_medium content_medium not null default 'markdown'::content_medium,
  constraint articles_normalized_url_key unique (normalized_url)
);

-- Quizzes table
create table if not exists public.quizzes (
  id bigserial primary key,
  quiz_id uuid not null default gen_random_uuid(),
  article_id bigint not null references public.articles(id) on delete cascade,
  status quiz_status not null default 'not_required',
  model_used text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint quizzes_quiz_id_key unique (quiz_id)
);

create index if not exists quizzes_article_id_idx on public.quizzes(article_id);

-- Questions table
create table if not exists public.questions (
  id bigserial primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  question_type question_type not null,
  content jsonb not null,
  sort_order integer not null default 0
);

create index if not exists questions_quiz_id_idx on public.questions(quiz_id);

-- Hook questions table
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

-- Sessions table
create table if not exists public.sessions (
  id bigserial primary key,
  session_token text not null,
  user_email text not null,
  article_url text not null,
  quiz_id bigint references public.quizzes(id) on delete set null,
  status session_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sessions_user_article_key unique (user_email, article_url),
  constraint sessions_session_token_key unique (session_token)
);

-- Triggers
create or replace function public.touch_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
before update on public.sessions
for each row
execute procedure public.touch_sessions_updated_at();

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

-- API schema views
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

create or replace view api.quizzes as
  select
    id,
    quiz_id,
    article_id,
    status,
    model_used,
    created_at
  from public.quizzes;

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

create or replace view api.questions as
  select
    id,
    quiz_id,
    question_type,
    content,
    sort_order
  from public.questions;

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

-- RPC functions for worker locking
create or replace function api.claim_next_hook_job()
returns table (
  quiz_id bigint,
  article_id bigint,
  quiz_status quiz_status,
  hook_id bigint
)
security definer
set search_path = public, pg_temp
language plpgsql
as $$
declare
  claimed_hook_id bigint;
  claimed_quiz_id bigint;
begin
  -- Atomically claim and lock the next pending hook job
  update public.hook_questions h
  set status = 'processing'
  where h.id = (
    select h2.id
    from public.hook_questions h2
    where h2.status = 'pending'
    order by h2.updated_at asc
    limit 1
    for update skip locked
  )
  returning h.id, h.quiz_id
  into claimed_hook_id, claimed_quiz_id;

  -- If no job was claimed, return empty set
  if claimed_hook_id is null then
    return;
  end if;

  -- Return the quiz data joined with the claimed hook
  return query
  select
    q.id,
    q.article_id,
    q.status,
    claimed_hook_id
  from public.quizzes q
  where q.id = claimed_quiz_id;
end;
$$;

create or replace function api.claim_next_instruction_job()
returns table (
  id bigint,
  quiz_id uuid,
  article_id bigint,
  status quiz_status,
  model_used text,
  created_at timestamptz
)
security definer
set search_path = public, pg_temp
language plpgsql
as $$
begin
  return query
  update public.quizzes
  set status = 'processing'
  where public.quizzes.id = (
    select q.id
    from public.quizzes q
    where q.status = 'pending'
    order by q.created_at asc
    limit 1
    for update skip locked
  )
  returning
    public.quizzes.id,
    public.quizzes.quiz_id,
    public.quizzes.article_id,
    public.quizzes.status,
    public.quizzes.model_used,
    public.quizzes.created_at;
end;
$$;

-- Grants
grant select, insert, update on all tables in schema api to service_role;
grant execute on function api.claim_next_hook_job() to service_role;
grant execute on function api.claim_next_instruction_job() to service_role;
