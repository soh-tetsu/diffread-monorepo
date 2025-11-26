do $$
begin
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
end
$$;

alter table public.articles
  add column if not exists status article_status not null default 'pending';

alter table public.articles
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.articles
set status = case
  when storage_path is not null then 'ready'::article_status
  else 'pending'::article_status
end;
