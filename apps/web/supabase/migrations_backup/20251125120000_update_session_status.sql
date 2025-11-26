do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'session_status'::regtype
      and enumlabel = 'active'
  ) then
    alter type session_status rename value 'active' to 'ready';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sessions'
      and column_name = 'session_token'
      and data_type != 'text'
  ) then
    alter table public.sessions
      alter column session_token type text using session_token::text;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sessions'
      and column_name = 'session_token'
      and column_default is not null
  ) then
    alter table public.sessions
      alter column session_token drop default;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'sessions_session_token_idx'
  ) then
    drop index public.sessions_session_token_idx;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_session_token_key'
  ) then
    alter table public.sessions
      add constraint sessions_session_token_key unique (session_token);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'session_status'::regtype
      and enumlabel = 'skip_by_admin'
  ) then
    alter type session_status add value 'skip_by_admin';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'session_status'::regtype
      and enumlabel = 'skip_by_failure'
  ) then
    alter type session_status add value 'skip_by_failure';
  end if;
end
$$;
