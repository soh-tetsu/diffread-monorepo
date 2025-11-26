-- Set default for quiz status after enum value is committed
-- This must be in a separate migration because PostgreSQL doesn't allow
-- using a newly added enum value in the same transaction

do $$
begin
  if exists (
    select 1
    from pg_enum
    where enumtypid = 'quiz_status'::regtype
      and enumlabel = 'not_required'
  ) then
    alter table public.quizzes
      alter column status set default 'not_required';
  end if;
end
$$;
