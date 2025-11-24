-- Diffread schema bootstrap for Supabase
create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'quiz_status') then
    create type quiz_status as enum (
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
end
$$;

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

create table if not exists public.quizzes (
  id bigserial primary key,
  quiz_id uuid not null default gen_random_uuid(),
  article_id bigint not null references public.articles(id) on delete cascade,
  status quiz_status not null default 'pending',
  model_used text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint quizzes_quiz_id_key unique (quiz_id)
);

create index if not exists quizzes_article_id_idx on public.quizzes(article_id);

create table if not exists public.questions (
  id bigserial primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  question_type question_type not null,
  content jsonb not null,
  sort_order integer not null default 0
);

create index if not exists questions_quiz_id_idx on public.questions(quiz_id);

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
