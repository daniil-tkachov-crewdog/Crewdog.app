-- Pro mode skills: the search disciplines, loaded on demand instead of always.
--
-- Pro shipped as one system prompt carrying everything it might ever need — the
-- 368-title job catalogue, the employer directory and all four search
-- disciplines — on every single call, whether the user asked for a job, a flat,
-- or said hello. Thirty thousand characters of context to answer "hi".
--
-- This is the same move Claude's own skills make. The system prompt keeps only
-- the names of the skills and one line each on when to reach for them; the
-- bodies live here and arrive through a load_skill tool call at the moment the
-- model decides it needs one. Nothing is lost, it just stops being resident.
--
-- Rows are written by hand in the admin panel, so this ships empty.

create table if not exists public.app_pro_skills (
  id               uuid primary key default gen_random_uuid(),
  -- What the model passes to load_skill. Slugged from the display name in the
  -- panel rather than typed, because a space in here is a tool call that fails.
  slug             text not null unique,
  name             text not null,
  -- The single line the core prompt shows: when to reach for this skill. This
  -- is the only part of a skill that is always in context, so it stays short.
  call_instruction text not null default '',
  -- The skill itself. This is the bulk, and the whole point of the table.
  prompt           text not null default '',
  -- A disabled skill is not offered to the model at all, which makes it
  -- possible to test one discipline in isolation without deleting the others.
  enabled          boolean not null default true,
  -- Slugs this skill rides along with. The job-title and employer catalogue is
  -- no use to the model on its own: it is reference material for a search, so
  -- it is attached to the searches that need it rather than requested
  -- separately and forgotten.
  auto_with        text[] not null default '{}',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Same stance as app_settings. The server reads this as the calling user with
-- the anon key and their bearer token, so signed-in read is required; writing
-- is the admin's alone.
alter table public.app_pro_skills enable row level security;

drop policy if exists app_pro_skills_select on public.app_pro_skills;
create policy app_pro_skills_select
  on public.app_pro_skills for select
  to authenticated
  using (true);

drop policy if exists app_pro_skills_admin_write on public.app_pro_skills;
create policy app_pro_skills_admin_write
  on public.app_pro_skills for all
  to authenticated
  using      (lower(coalesce(auth.jwt() ->> 'email', '')) = 'crewdog.app@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'crewdog.app@gmail.com');

create index if not exists app_pro_skills_order_idx
  on public.app_pro_skills (sort_order, name);
