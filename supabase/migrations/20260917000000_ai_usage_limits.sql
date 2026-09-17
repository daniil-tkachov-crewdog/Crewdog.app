-- AI usage limits: rolling 5-hour and weekly windows per user.
--
-- Metered in input-equivalent "units" (see usage.js):
--   units = input + 8 x output + 0.1 x cached_input,  1M units = $1.25 on GPT-5.

create table if not exists public.app_usage_windows (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  window_kind  text        not null check (window_kind in ('5h', 'week')),
  window_start timestamptz not null default now(),
  window_end   timestamptz not null,
  units        bigint      not null default 0,
  primary key (user_id, window_kind)
);

alter table public.app_usage_windows enable row level security;

-- Users may read their own counters (the chat UI shows a meter); nothing but
-- the SECURITY DEFINER function below ever writes.
drop policy if exists "read own usage" on public.app_usage_windows;
create policy "read own usage"
  on public.app_usage_windows for select
  to authenticated
  using (auth.uid() = user_id);

-- Admin-configurable caps, read by the server via PostgREST.
alter table public.app_settings
  add column if not exists usage_limits jsonb not null default '{}'::jsonb;

-- consume_ai_units(user, units, cap_5h, cap_week)
--
-- Rolls any expired window, checks both caps, then increments. Doing all three
-- in one statement-level function keeps concurrent chats from racing each other
-- past the cap. p_units = 0 is a read-only pre-flight check.
--
-- Returns:
--   { allowed, exceeded, used_5h, used_week, remaining_5h, remaining_week,
--     resets_5h, resets_week, resets_at }
create or replace function public.consume_ai_units(
  p_user     uuid,
  p_units    bigint,
  p_cap_5h   bigint,
  p_cap_week bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now       timestamptz := now();
  v_used_5h   bigint;
  v_used_week bigint;
  v_end_5h    timestamptz;
  v_end_week  timestamptz;
  v_exceeded  text := null;
begin
  if p_user is null then
    raise exception 'p_user is required';
  end if;

  -- Ensure a row exists for each window, then roll it if it has expired.
  insert into public.app_usage_windows (user_id, window_kind, window_start, window_end, units)
  values
    (p_user, '5h',   v_now, v_now + interval '5 hours', 0),
    (p_user, 'week', v_now, v_now + interval '7 days',  0)
  on conflict (user_id, window_kind) do nothing;

  update public.app_usage_windows
     set units        = 0,
         window_start = v_now,
         window_end   = case window_kind
                          when '5h' then v_now + interval '5 hours'
                          else v_now + interval '7 days'
                        end
   where user_id = p_user
     and window_end <= v_now;

  -- Lock both rows for the duration of the transaction.
  select coalesce(max(units) filter (where window_kind = '5h'), 0),
         coalesce(max(units) filter (where window_kind = 'week'), 0),
         max(window_end) filter (where window_kind = '5h'),
         max(window_end) filter (where window_kind = 'week')
    into v_used_5h, v_used_week, v_end_5h, v_end_week
    from (
      select * from public.app_usage_windows
       where user_id = p_user
       for update
    ) w;

  if v_used_5h >= p_cap_5h then
    v_exceeded := '5h';
  elsif v_used_week >= p_cap_week then
    v_exceeded := 'week';
  end if;

  -- A request that is already over the line is not charged; one that is under
  -- commits in full even if it tips the window over (we cannot know the cost
  -- until OpenAI has answered).
  if v_exceeded is null and p_units > 0 then
    update public.app_usage_windows
       set units = units + p_units
     where user_id = p_user;
    v_used_5h   := v_used_5h + p_units;
    v_used_week := v_used_week + p_units;
  end if;

  return jsonb_build_object(
    'allowed',        v_exceeded is null,
    'exceeded',       v_exceeded,
    'used_5h',        v_used_5h,
    'used_week',      v_used_week,
    'cap_5h',         p_cap_5h,
    'cap_week',       p_cap_week,
    'remaining_5h',   greatest(0, p_cap_5h - v_used_5h),
    'remaining_week', greatest(0, p_cap_week - v_used_week),
    'resets_5h',      v_end_5h,
    'resets_week',    v_end_week,
    'resets_at',      case when v_exceeded = 'week' then v_end_week else v_end_5h end
  );
end;
$$;

-- Only the server (service_role) may call this: it takes p_user and the caps as
-- arguments, so an end user with execute rights could meter someone else or
-- hand themselves an unlimited cap.
revoke all on function public.consume_ai_units(uuid, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.consume_ai_units(uuid, bigint, bigint, bigint) to service_role;
