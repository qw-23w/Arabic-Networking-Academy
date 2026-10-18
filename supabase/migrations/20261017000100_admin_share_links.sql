-- Arabic Networking Academy — migration 3: read-only shareable admin dashboard link
-- Safe to re-run. Adds one table and a few functions; deletes nothing.
-- Only admins can create/revoke links (checked inside the database). A link holder gets AGGREGATE stats only
-- (no student names, no emails) and cannot create links.

create table if not exists public.admin_share_links (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
alter table public.admin_share_links enable row level security;   -- no policies: clients cannot touch it directly
revoke all on public.admin_share_links from public, anon, authenticated;

create or replace function public._share_hash(t text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(t,''), 'utf8')), 'hex');
$$;
revoke all on function public._share_hash(text) from public, anon, authenticated;

create or replace function public._share_ok(t text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_share_links
                 where token_hash = public._share_hash(t) and revoked_at is null and expires_at > now());
$$;
revoke all on function public._share_ok(text) from public, anon, authenticated;

-- Admin only: returns the plain token ONCE (only its hash is stored).
create or replace function public.admin_create_share_link(valid_days int default 40)
returns text language plpgsql security definer set search_path = public as $$
declare tok text; d int := least(greatest(coalesce(valid_days,40),1),40);
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.admin_share_links (token_hash, created_by, expires_at)
  values (public._share_hash(tok), auth.uid(), now() + make_interval(days => d));
  return tok;
end $$;

create or replace function public.admin_revoke_share_links()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.admin_share_links set revoked_at = now() where revoked_at is null;
end $$;

-- Token-based, read-only, aggregate-only views (callable by anyone holding a valid token)
create or replace function public.share_stats(link_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare published_count int; result json;
begin
  if not public._share_ok(link_token) then raise exception 'not authorized' using errcode = '42501'; end if;
  select count(*) into published_count from lessons where published;
  select json_build_object(
    'total_registered',   (select count(*) from profiles),
    'new_today',          (select count(*) from profiles where created_at >= date_trunc('day', now())),
    'new_7_days',         (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'new_30_days',        (select count(*) from profiles where created_at >= now() - interval '30 days'),
    'started_students',   (select count(distinct user_id) from lesson_progress),
    'completed_one',      (select count(distinct user_id) from lesson_progress where completed_at is not null),
    'completed_course',   (select count(*) from (
                              select user_id from lesson_progress lp
                              join lessons l on l.id = lp.lesson_id and l.published
                              where lp.completed_at is not null
                              group by user_id having count(*) = published_count
                            ) t where published_count > 0),
    'published_lessons',  published_count,
    'avg_quiz_percent',   (select round(avg(score::numeric * 100 / total), 1) from quiz_results),
    'quiz_attempts',      (select count(*) from quiz_results)
  ) into result;
  return result;
end $$;

create or replace function public.share_registrations_by_day(link_token text, days int default 30)
returns table (day date, registrations bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._share_ok(link_token) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
    select d::date, count(p.id)
    from generate_series((current_date - (greatest(days,1) - 1))::timestamp, current_date::timestamp, interval '1 day') d
    left join profiles p on p.created_at::date = d::date
    group by d order by d;
end $$;

create or replace function public.share_lesson_stats(link_token text)
returns table (lesson_id int, title_ar text, views bigint, unique_viewers bigint, completions bigint, avg_quiz_percent numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._share_ok(link_token) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
    select l.id, l.title_ar,
      (select count(*) from lesson_views v where v.lesson_id = l.id),
      (select count(distinct v.user_id) from lesson_views v where v.lesson_id = l.id),
      (select count(*) from lesson_progress lp where lp.lesson_id = l.id and lp.completed_at is not null),
      (select round(avg(q.score::numeric * 100 / q.total), 1) from quiz_results q where q.lesson_id = l.id)
    from lessons l where l.published order by l.id;
end $$;

revoke all on function public.admin_create_share_link(int), public.admin_revoke_share_links(),
  public.share_stats(text), public.share_registrations_by_day(text, int), public.share_lesson_stats(text) from public, anon, authenticated;
grant execute on function public.admin_create_share_link(int), public.admin_revoke_share_links() to authenticated;
grant execute on function public.share_stats(text), public.share_registrations_by_day(text, int), public.share_lesson_stats(text) to anon, authenticated;
