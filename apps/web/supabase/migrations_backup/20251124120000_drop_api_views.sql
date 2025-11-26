-- Drop api schema views temporarily to allow migrations to alter public tables
-- These will be recreated in 20251203_recreate_api_views.sql after all schema changes

drop view if exists api.sessions cascade;
drop view if exists api.quizzes cascade;
drop view if exists api.articles cascade;
drop view if exists api.questions cascade;
drop view if exists api.hook_questions cascade;
