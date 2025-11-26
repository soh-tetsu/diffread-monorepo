-- Align quiz/instruction workflow statuses

alter type quiz_status add value if not exists 'not_required';

alter table public.quizzes
  alter column status set default 'not_required';

-- Allow hook workflows to represent in-progress states if needed later.
alter type hook_status add value if not exists 'processing';

-- Ensure every quiz has a hook row so the worker can detect pending hooks.
insert into public.hook_questions (quiz_id, status)
select q.id, 'pending'
from public.quizzes q
where not exists (
  select 1 from public.hook_questions h where h.quiz_id = q.id
)
on conflict do nothing;
