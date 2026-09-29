-- Workflow 4 ("Accommodation Finder") gets its own enable flag, so the admin
-- can run the four workflows independently. Workflows 1 and 2 find people and
-- workflow 3 finds vacancies; this one finds somewhere to live, for a user
-- relocating for data centre work.
--
-- Its prompts and limits live under `accom_*` keys inside the existing
-- agent_config JSON, including the two search prompts the admin's
-- "Search for places to buy?" switch picks between, so no extra columns are
-- needed for those.
--
-- Defaults to true, like the job finder: the prompts ship ready to run and need
-- no per-install tuning before the workflow is useful.
--
-- get_public_app_settings() is deliberately left alone: it does not expose the
-- other three flags either, and chat (the only consumer of these flags) is
-- authenticated, so anon callers never need them.

alter table public.app_settings
  add column if not exists accommodation_finder_enabled boolean not null default true;
