-- Pro mode: a second chat path that talks to the model directly.
--
-- Normal mode routes a message through four function-tools, each of which is
-- its own sub-agent doing its own web search. Pro mode drops all of that: one
-- system prompt, the model's own built-in search, one call. The cards survive
-- the change because the reply is forced through OpenAI Structured Outputs —
-- the schema is handed to the API with strict: true, so the answer comes back
-- in exactly the shape src/types/chatResults.ts already renders.
--
-- Each setting is its own column rather than a nested jsonb blob because the
-- two modes are configured independently in the admin panel, and a shared row
-- that moves both at once is the bug this is meant to avoid.

alter table public.app_settings
  -- Pro's own system prompt. Nothing from the Normal tab reaches this mode.
  add column if not exists pro_system_prompt text    not null default '',
  -- The Structured Outputs schema, kept as text rather than jsonb so the
  -- admin's own formatting and key order survive the round-trip.
  --
  -- Deliberately seeded EMPTY. Empty means "use the built-in schema in
  -- proSchema.js", which is also what an unparseable edit falls back to, so
  -- the default lives in exactly one place and cannot drift from the code that
  -- reads the results. The panel's "Reset to default" button writes a copy in
  -- here only once someone wants to edit it.
  add column if not exists pro_json_schema   text    not null default '',
  -- Pro's own API settings, deliberately duplicated rather than shared.
  add column if not exists pro_chat_model    text    not null default 'gpt-4o',
  -- On by default: with no agents of its own, Pro mode IS the web search.
  add column if not exists pro_web_search    boolean not null default true,
  add column if not exists pro_file_search   boolean not null default false;

-- Which path a turn took, so a disappointing answer is attributable to a mode.
-- Null for rows written before this migration.
alter table public.app_chat_calls
  add column if not exists mode text;
