-- Web traffic log — one row per page view, read by the admin "Web Traffic" tab.
--
-- Privacy
-- -------
-- No raw IP address is ever stored. The capture layer (traffic.js) truncates it
-- to a network prefix before it reaches this table — IPv4 keeps three octets
-- ("81.2.69.x"), IPv6 keeps the /48 ("2a00:1450:4009:x"). That is enough to tell
-- two visitors apart at city granularity and to spot an abusive network, but it
-- is not the identifier a raw IP is. `visitor_id` is likewise a one-way hash of
-- (ip + user-agent) salted with the current UTC date, so it groups a single
-- person's page views within a day and stops being linkable the next day.
--
-- Writes
-- ------
-- Only the Express server writes here, using the service-role key, which
-- bypasses RLS. There is deliberately no insert policy and no anon grant, so
-- there is no public write path that could be used to forge traffic rows.
-- Reads go exclusively through the two admin_* functions at the bottom, gated
-- on the same admin email as public.admin_list_users.
--
-- Retention
-- ---------
-- 90 days. pg_cron is not enabled on this project, so the purge is not
-- scheduled: the server calls purge_old_page_views() opportunistically on a
-- small fraction of inserts (see traffic.js).

create table if not exists public.app_page_views (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),

  -- Daily-salted hash of (ip + user-agent). Groups one visitor's views.
  visitor_id  text not null,
  -- Set only when the visitor was signed in at the time of the view.
  user_id     uuid references auth.users (id) on delete set null,

  path        text not null,
  referrer    text,

  -- Truncated network prefix, never a full address. See the note above.
  ip_prefix   text,
  country     text,
  region      text,
  city        text,

  device_type text,   -- desktop | mobile | tablet | bot | unknown
  browser     text,
  os          text,
  user_agent  text,
  is_bot      boolean not null default false
);

-- The admin table reads newest-first, almost always with bots excluded, so the
-- partial index carries the common case and the plain one covers "show bots".
create index if not exists app_page_views_occurred_at_idx
  on public.app_page_views (occurred_at desc, id desc);

create index if not exists app_page_views_human_idx
  on public.app_page_views (occurred_at desc, id desc)
  where is_bot = false;

create index if not exists app_page_views_visitor_idx
  on public.app_page_views (visitor_id);

alter table public.app_page_views enable row level security;
-- No policies on purpose: service_role bypasses RLS for the inserts, and admins
-- read through the security-definer functions below. Anything else sees nothing.


-- ---------------------------------------------------------------------------
-- Reads (admin only)
-- ---------------------------------------------------------------------------

-- Shared range parser. 'all' (or anything unrecognised) means no lower bound.
create or replace function public.page_view_range_start(p_range text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case lower(coalesce(p_range, '7d'))
    when '24h' then now() - interval '24 hours'
    when '7d'  then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    when '90d' then now() - interval '90 days'
    else null
  end;
$$;

drop function if exists public.admin_list_page_views(int, timestamptz, bigint, boolean, text, text);

create or replace function public.admin_list_page_views(
  p_limit        int         default 50,
  p_before_at    timestamptz default null,  -- keyset cursor: last row's occurred_at
  p_before_id    bigint      default null,  -- keyset cursor: last row's id
  p_include_bots boolean     default false,
  p_search       text        default null,  -- path / city / country / ip_prefix / email
  p_range        text        default '7d'
) returns table (
  id          bigint,
  occurred_at timestamptz,
  visitor_id  text,
  user_id     uuid,
  email       text,
  path        text,
  referrer    text,
  ip_prefix   text,
  country     text,
  region      text,
  city        text,
  device_type text,
  browser     text,
  os          text,
  user_agent  text,
  is_bot      boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from  timestamptz := public.page_view_range_start(p_range);
  v_limit int         := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_q     text        := nullif(btrim(coalesce(p_search, '')), '');
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'crewdog.app@gmail.com' then
    raise exception 'not authorised';
  end if;

  return query
  select
    v.id, v.occurred_at, v.visitor_id, v.user_id, u.email,
    v.path, v.referrer, v.ip_prefix, v.country, v.region, v.city,
    v.device_type, v.browser, v.os, v.user_agent, v.is_bot
  from public.app_page_views v
  left join public.app_users u on u.user_id = v.user_id
  where (v_from is null or v.occurred_at >= v_from)
    and (p_include_bots or v.is_bot = false)
    -- Keyset, not OFFSET: the log grows under the reader, and (occurred_at, id)
    -- is unique-ordered so a page never repeats or skips a row.
    and (
      p_before_at is null
      or v.occurred_at < p_before_at
      or (v.occurred_at = p_before_at and v.id < coalesce(p_before_id, 0))
    )
    and (
      v_q is null
      or v.path      ilike '%' || v_q || '%'
      or v.city      ilike '%' || v_q || '%'
      or v.country   ilike '%' || v_q || '%'
      or v.ip_prefix ilike '%' || v_q || '%'
      or v.referrer  ilike '%' || v_q || '%'
      or u.email     ilike '%' || v_q || '%'
    )
  order by v.occurred_at desc, v.id desc
  limit v_limit;
end;
$$;

-- Summary strip above the table: totals plus the leading pages and countries.
create or replace function public.admin_page_view_stats(
  p_range        text    default '7d',
  p_include_bots boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.page_view_range_start(p_range);
  v_out  jsonb;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'crewdog.app@gmail.com' then
    raise exception 'not authorised';
  end if;

  with scoped as (
    select *
    from public.app_page_views v
    where (v_from is null or v.occurred_at >= v_from)
      and (p_include_bots or v.is_bot = false)
  )
  select jsonb_build_object(
    'views',           (select count(*) from scoped),
    'visitors',        (select count(distinct visitor_id) from scoped),
    'signed_in_views', (select count(*) from scoped where user_id is not null),
    'bot_views',       (select count(*) from public.app_page_views v
                         where (v_from is null or v.occurred_at >= v_from)
                           and v.is_bot),
    'top_pages',       coalesce((
        select jsonb_agg(t) from (
          select path as label, count(*) as views
          from scoped group by path order by count(*) desc, path limit 5
        ) t), '[]'::jsonb),
    'top_countries',   coalesce((
        select jsonb_agg(t) from (
          select coalesce(country, '??') as label, count(*) as views
          from scoped group by 1 order by count(*) desc, 1 limit 5
        ) t), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------

create or replace function public.purge_old_page_views()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.app_page_views
  where occurred_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants — admins read, service_role purges, nobody else gets in.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_list_page_views(int, timestamptz, bigint, boolean, text, text) from public, anon;
revoke all on function public.admin_page_view_stats(text, boolean) from public, anon;
revoke all on function public.purge_old_page_views() from public, anon, authenticated;

grant execute on function public.admin_list_page_views(int, timestamptz, bigint, boolean, text, text) to authenticated;
grant execute on function public.admin_page_view_stats(text, boolean) to authenticated;
grant execute on function public.purge_old_page_views() to service_role;
