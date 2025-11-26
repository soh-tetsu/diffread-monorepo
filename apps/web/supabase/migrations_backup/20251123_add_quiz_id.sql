alter table public.quizzes
  add column if not exists quiz_id uuid;

update public.quizzes
set quiz_id = gen_random_uuid()
where quiz_id is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quizzes'
      and column_name = 'quiz_id'
      and is_nullable = 'YES'
  ) then
    alter table public.quizzes
      alter column quiz_id set not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quizzes_quiz_id_key'
  ) then
    alter table public.quizzes
      add constraint quizzes_quiz_id_key unique (quiz_id);
  end if;
end
$$;
