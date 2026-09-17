-- Re-scope consume_ai_units to the calling user.
--
-- The first version took p_user and the caps as arguments, so it had to be
-- restricted to service_role — which meant deploying a service-role key. This
-- version derives the user from auth.uid() instead, so it is safe to grant to
-- `authenticated` and the server can call it with the signed-in user's own
-- token plus the anon key it already has. No new secrets anywhere.
--
-- The caps are still arguments, but they are only used for the allow/block
-- decision inside a single call and are never persisted, so a user calling this
-- directly with inflated caps changes nothing: the gate that matters is the
-- server's own call, made with the caps for that user's real plan. The only
-- thing a direct caller can do to their own row is spend more of their own
-- allowance — they cannot lower `units`, and cannot roll a window early.

drop function if exists public.consume_ai_units(uuid, bigint, bigint, bigint);

create or replace function public.consume_ai_units(
  p_units    bigint,
  p_cap_5h   bigint,
  p_cap_week bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_now       timestamptz := now();
  v_used_5h   bigint;
  v_used_week bigint;
  v_end_5h    timestamptz;
  v_end_week  timestamptz;
  v_exceeded  text := null;
begin
  if v_user is null then
    raise exception 'consume_ai_units requires an authenticated caller';
  end if;

  -- Never let a caller charge themselves a negative amount.
  p_units := greatest(0, coalesce(p_units, 0));

  insert into public.app_usage_windows (user_id, window_kind, window_start, window_end, units)
  values
    (v_user, '5h',   v_now, v_now + interval '5 hours', 0),
    (v_user, 'week', v_now, v_now + interval '7 days',  0)
  on conflict (user_id, window_kind) do nothing;

  -- Roll only genuinely expired windows.
  update public.app_usage_windows
     set units        = 0,
         window_start = v_now,
         window_end   = case window_kind
                          when '5h' then v_now + interval '5 hours'
                          else v_now + interval '7 days'
                        end
   where user_id = v_user
     and window_end <= v_now;

  select coalesce(max(units) filter (where window_kind = '5h'), 0),
         coalesce(max(units) filter (where window_kind = 'week'), 0),
         max(window_end) filter (where window_kind = '5h'),
         max(window_end) filter (where window_kind = 'week')
    into v_used_5h, v_used_week, v_end_5h, v_end_week
    from (
      select * from public.app_usage_windows
       where user_id = v_user
       for update
    ) w;

  if v_used_5h >= p_cap_5h then
    v_exceeded := '5h';
  elsif v_used_week >= p_cap_week then
    v_exceeded := 'week';
  end if;

  if v_exceeded is null and p_units > 0 then
    update public.app_usage_windows
       set units = units + p_units
     where user_id = v_user;
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

revoke all on function public.consume_ai_units(bigint, bigint, bigint) from public, anon;
grant execute on function public.consume_ai_units(bigint, bigint, bigint) to authenticated;
