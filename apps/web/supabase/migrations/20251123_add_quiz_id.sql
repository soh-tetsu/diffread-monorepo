alter table public.quizzes
  add column if not exists quiz_id uuid;

update public.quizzes
set quiz_id = gen_random_uuid()
where quiz_id is null;

alter table public.quizzes
  alter column quiz_id set not null;

alter table public.quizzes
  add constraint quizzes_quiz_id_key unique (quiz_id);
