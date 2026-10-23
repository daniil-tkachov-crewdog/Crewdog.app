-- The user's CV and the profile it fills in.
--
-- Until now the account page's "Profile information" was two inline-edit cards
-- whose save handlers were TODO comments: nothing about the person reached the
-- database, so every chat and every search started from zero and the CV had to
-- be re-attached to the composer each time.
--
-- Two tables, both keyed on the auth user, because they answer two different
-- questions. user_cvs is the document: which file, under what name, uploaded
-- when. user_profiles is what we learned from it, and what the user then
-- corrected by hand — the thing the rest of the app will read.
--
-- user_id is the primary key rather than a plain column in both. That is what
-- makes "latest CV only" structural instead of a convention: an upload is an
-- upsert, so there is exactly one CV and one profile per account and no history
-- rows quietly pile up.

-- The uploaded document. The PDF bytes themselves live in the private `cvs`
-- storage bucket created at the bottom of this file; file_path points at them.
create table if not exists public.user_cvs (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  -- Object path inside the `cvs` bucket: <user_id>/cv.pdf. Always derived from
  -- the user id, never from the filename, so an upload cannot escape its folder.
  file_path      text        not null,
  -- The name the file had on the user's machine, shown back to them as
  -- confirmation of what we hold.
  file_name      text        not null,
  -- The name cv_reader read off the CV, kept even after the user edits the
  -- profile's full_name, so what the document claims stays visible.
  extracted_name text,
  uploaded_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- The profile. Every column defaults to '' rather than null: the form binds
-- straight to these, and an empty string is what "not filled in yet" means to
-- both the form and the fill-only-empty-fields merge in cvReader.js.
create table if not exists public.user_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null default '',
  email       text        not null default '',
  phone       text        not null default '',
  location    text        not null default '',
  -- Taken verbatim when the CV has a summary section; written by the model from
  -- the experience when it does not.
  summary     text        not null default '',
  -- The three most recent roles, newest first. Titles only.
  job_title_1 text        not null default '',
  job_title_2 text        not null default '',
  job_title_3 text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Both tables are the user's own data and nobody else's, so unlike app_settings
-- and app_pro_skills (signed-in read, admin write) these are owner-scoped on
-- every verb. The server reads and writes them with the anon key and the
-- caller's bearer token, so auth.uid() is the user and these policies are the
-- whole of the access control — no service-role key, no new secret.
alter table public.user_cvs enable row level security;

drop policy if exists user_cvs_owner on public.user_cvs;
create policy user_cvs_owner
  on public.user_cvs for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_owner on public.user_profiles;
create policy user_profiles_owner
  on public.user_profiles for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Private bucket: a CV is a home address and a phone number, so nothing here is
-- served without a signed URL or the owner's own token.
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

-- Same owner rule, enforced on the object path. The first folder of the object
-- name is the user id, so a user can only reach objects under their own prefix.
drop policy if exists cvs_owner_read on storage.objects;
create policy cvs_owner_read
  on storage.objects for select
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cvs_owner_insert on storage.objects;
create policy cvs_owner_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Update is what makes a re-upload work: the path is fixed at <user_id>/cv.pdf,
-- so the second CV overwrites the first rather than adding to it.
drop policy if exists cvs_owner_update on storage.objects;
create policy cvs_owner_update
  on storage.objects for update
  to authenticated
  using      (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cvs_owner_delete on storage.objects;
create policy cvs_owner_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
