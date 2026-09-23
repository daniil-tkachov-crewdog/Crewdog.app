-- Record what each AI agent workflow was actually asked for and what it found.
--
-- The `agent` boolean only says a workflow ran. When an answer disappoints there
-- is no way to tell a criterion the model silently dropped from one the search
-- genuinely could not fill, so store the criteria and the per-stage counts.
-- Counts only, never the profiles themselves — this is for diagnosing the
-- pipeline, not a store of anyone's data.

alter table public.app_chat_calls
  add column if not exists agent_calls jsonb;
