-- Lusha contact lookup: an enable flag and a shared cache.
--
-- Lusha bills per revealed datapoint, so the expensive mistake is not a failed
-- lookup, it is a repeated one. Every answer is cached here keyed on the
-- normalized profile URL and shared across users: the second person to open the
-- same card pays nothing, and neither does the first person after a reload.

alter table public.app_settings
  add column if not exists lusha_enabled boolean not null default false;

create table if not exists public.app_contact_lookups (
  -- Normalized by normalizeUrl() in linkedinFinder.js, so the same person found
  -- under a locale subdomain or with tracking params is one row, not three.
  linkedin_url      text primary key,
  phones            jsonb,
  emails            jsonb,
  -- One stamp per datapoint, because the two are bought separately. A phone
  -- reveal must not leave an unqueried email looking like "checked, none
  -- found" — and a confirmed-empty result must still count as checked, or a
  -- profile Lusha has nothing for gets billed on every click.
  phone_checked_at  timestamptz,
  email_checked_at  timestamptz,
  updated_at        timestamptz not null default now()
);

-- RLS on with no policies at all: this table holds other people's phone
-- numbers and email addresses, and nothing in the browser has any business
-- reading it. The server reaches it with SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS; PostgREST under the anon or an authenticated user's key sees
-- zero rows. Adding a policy here would publish the cache to every signed-in
-- user, which is a different product than the one asked for.
alter table public.app_contact_lookups enable row level security;
