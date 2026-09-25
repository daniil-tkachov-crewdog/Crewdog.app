-- Workflow 3 ("Job finder") gets its own enable flag, so the admin can run the
-- three workflows independently. Unlike the first two this one finds vacancies
-- rather than people: a candidate asks for a data centre job and the pipeline
-- web-searches live adverts.
--
-- Its prompts and limits live under `jobfinder_*` keys inside the existing
-- agent_config JSON, including the two search prompts the admin's
-- "Show recruitment agencies?" switch picks between, so no extra columns are
-- needed for those.
--
-- Defaults to true: unlike the finder, this workflow needs no per-install
-- tuning before it is useful, and its prompts ship ready to run.
--
-- get_public_app_settings() is deliberately left alone: it does not expose
-- agent_enabled or linkedin_finder_enabled either, and chat (the only consumer
-- of these flags) is authenticated, so anon callers never need them.

alter table public.app_settings
  add column if not exists job_finder_enabled boolean not null default true;
