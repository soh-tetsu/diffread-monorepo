-- Rename raw_text -> storage_path so we reference Supabase Storage objects
alter table public.articles
  rename column raw_text to storage_path;

-- Ensure the renamed column stores only the object path (text)
alter table public.articles
  alter column storage_path type text
    using storage_path::text;

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
