-- Workflow 2 ("LinkedIn finder") gets its own enable flag, so the admin can run
-- the job-description workflow and the finder independently. Its prompts and
-- limits live under `finder_*` keys inside the existing agent_config JSON, so no
-- extra columns are needed for those.
--
-- get_public_app_settings() is deliberately left alone: it does not expose
-- agent_enabled either, and chat (the only consumer of these flags) is
-- authenticated, so anon callers never need them.

alter table public.app_settings
  add column if not exists linkedin_finder_enabled boolean not null default false;
