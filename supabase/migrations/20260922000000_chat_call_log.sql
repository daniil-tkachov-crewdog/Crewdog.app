-- Chat call log — one row per /api/chat request, written by the Express server.
--
-- Why
-- ---
-- Token usage was only ever recorded from the browser (app_token_usage, written
-- by the client after a reply lands). That leaves the server blind: a caller
-- holding a valid token can hit /api/chat directly, spend OpenAI credit, and
-- never write a usage row. When the OpenAI bill and the in-app numbers
-- disagree, there is nothing to reconcile against. This table is that record —
-- written server-side, before the response is sent, whatever the outcome.
--
-- Writes
-- ------
-- Only the Express server writes here, with the service-role key, which
-- bypasses RLS. No insert policy and no anon grant: there is no public write
-- path, so rows cannot be forged.
--
-- Privacy
-- -------
-- Same rule as app_page_views: the raw IP never reaches the database. The
-- server truncates it to a network prefix ("81.2.69.x") first — enough to spot
-- one abusive network, not enough to be an address.
--
-- Retention
-- ---------
-- None. The volume is one row per chat turn, and this is exactly the history
-- an audit needs; it can be trimmed by hand if it ever grows.

create table if not exists public.app_chat_calls (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),

  -- The authenticated caller. /api/chat rejects anonymous requests, so this is
  -- set on every row the server writes.
  user_id     uuid references auth.users (id) on delete set null,

  -- Truncated network prefix, never a full address. See the note above.
  ip_prefix   text,
  user_agent  text,
  origin      text,

  model       text,
  agent       boolean not null default false,

  -- How many calls this one turn made to OpenAI: the chat request, every
  -- tool-loop hop, and the job-search pipeline's own requests. This is the
  -- number that reconciles against the request count on the OpenAI dashboard.
  requests    int not null default 0,

  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens  bigint not null default 0,
  cached_tokens bigint not null default 0,

  -- HTTP status the caller got back: 200, 401, 429, 500.
  status      int,
  duration_ms int,
  error       text
);

create index if not exists app_chat_calls_occurred_at_idx
  on public.app_chat_calls (occurred_at desc, id desc);

create index if not exists app_chat_calls_user_idx
  on public.app_chat_calls (user_id, occurred_at desc);

alter table public.app_chat_calls enable row level security;
-- No policies on purpose: service_role bypasses RLS for the inserts, and this
-- log is read by the operator out of band. Anything else sees nothing.
