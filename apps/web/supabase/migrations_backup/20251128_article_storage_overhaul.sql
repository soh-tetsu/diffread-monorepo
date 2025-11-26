-- Rename raw_text -> storage_path so we reference Supabase Storage objects
-- Only rename if the old column exists
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'articles'
      and column_name = 'raw_text'
  ) then
    alter table public.articles
      rename column raw_text to storage_path;
  end if;
end
$$;

-- Ensure storage_path column stores only the object path (text)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'articles'
      and column_name = 'storage_path'
      and data_type != 'text'
  ) then
    alter table public.articles
      alter column storage_path type text using storage_path::text;
  end if;
end
$$;

-- Add storage metadata for size/fingerprint/bucket bookkeeping
alter table public.articles
  add column if not exists storage_metadata jsonb not null default '{}'::jsonb;

-- Track what medium the primary storage_path represents
do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_medium') then
    create type content_medium as enum ('markdown', 'pdf', 'html', 'unknown');
  end if;
end
$$;

alter table public.articles
  add column if not exists content_medium content_medium not null default 'markdown'::content_medium;
