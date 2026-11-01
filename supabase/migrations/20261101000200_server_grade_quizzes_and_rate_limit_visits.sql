-- Grade quiz submissions on the database and apply a coarse per-IP visit throttle.
-- No existing results are deleted. Existing quiz history remains readable to its owner.

alter table public.quiz_results
  add column if not exists grading_source text not null default 'legacy-client';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quiz_results'::regclass
      and conname = 'quiz_results_grading_source_valid'
  ) then
    alter table public.quiz_results
      add constraint quiz_results_grading_source_valid
      check (grading_source in ('legacy-client', 'server-rpc'));
  end if;
end;
$$;

-- Keep actual answer arrays out of the public GitHub repository. Populate this table
-- privately in Supabase SQL Editor after deployment (see SECURITY-REVIEW.md).
create table if not exists public.quiz_answer_keys (
  lesson_id integer primary key references public.lessons(id) on delete cascade,
  answers integer[] not null check (cardinality(answers) between 1 and 10)
);
alter table public.quiz_answer_keys enable row level security;
revoke all on public.quiz_answer_keys from public, anon, authenticated;

create table if not exists public.page_visit_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 1201)
);
create index if not exists idx_page_visit_rate_limits_window
  on public.page_visit_rate_limits(window_started_at);
alter table public.page_visit_rate_limits enable row level security;
revoke all on public.page_visit_rate_limits from public, anon, authenticated;

create or replace function public.track_visit(p_page text, p_visitor text)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  request_headers jsonb;
  client_ip text;
  rate_key text;
  hour_start timestamptz := date_trunc('hour', now());
  hit_count integer;
begin
  if p_visitor is null or char_length(p_visitor) not between 8 and 64 or p_visitor !~ '^[A-Za-z0-9_-]+$' then
    return;
  end if;
  p_page := left(coalesce(nullif(trim(p_page), ''), 'index.html'), 60);

  -- Keep the existing per-browser duplicate protection.
  if exists (
    select 1 from public.page_visits
    where visitor = p_visitor and visited_at > now() - interval '30 minutes'
  ) then
    return;
  end if;

  -- Supabase/PostgREST supplies the connecting address in this request header.
  -- Store only a one-way digest, never the raw address.
  request_headers := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  client_ip := nullif(trim(split_part(coalesce(request_headers->>'x-forwarded-for', ''), ',', 1)), '');
  if client_ip is not null then
    rate_key := encode(sha256(convert_to('ip:' || lower(client_ip), 'UTF8')), 'hex');
  else
    -- Preserve functionality on local/test deployments that have no proxy header.
    rate_key := encode(sha256(convert_to('visitor:' || p_visitor, 'UTF8')), 'hex');
  end if;

  insert into public.page_visit_rate_limits as limits(ip_hash, window_started_at, request_count)
  values (rate_key, hour_start, 1)
  on conflict (ip_hash) do update
    set window_started_at = excluded.window_started_at,
        request_count = case
          when limits.window_started_at = excluded.window_started_at
            then least(limits.request_count + 1, 1201)
          else 1
        end
  returning request_count into hit_count;

  -- A shared network can generate many legitimate visits; keep this limit generous.
  if hit_count > 1200 then
    return;
  end if;

  -- Retain only recent pseudonymous rate-limit keys. The indexed delete never stores raw IPs.
  delete from public.page_visit_rate_limits
  where window_started_at < now() - interval '24 hours';

  insert into public.page_visits(page, visitor) values (p_page, p_visitor);
end;
$$;
revoke all on function public.track_visit(text, text) from public;
grant execute on function public.track_visit(text, text) to anon, authenticated;

create or replace function public.submit_quiz_answers(p_lesson_id integer, p_answers integer[])
returns table(score integer, total integer)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  answer_key integer[];
  answer_total integer;
  answer_score integer := 0;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lessons
    where id = p_lesson_id and published
  ) then
    raise exception 'lesson unavailable' using errcode = '22023';
  end if;

  select k.answers into answer_key
  from public.quiz_answer_keys k
  where k.lesson_id = p_lesson_id;
  if answer_key is null then
    raise exception 'quiz unavailable' using errcode = '22023';
  end if;
  answer_total := cardinality(answer_key);
  if p_answers is null or cardinality(p_answers) <> answer_total then
    raise exception 'invalid answer count' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_answers) as submitted(answer_index)
    where submitted.answer_index is null or submitted.answer_index < 0 or submitted.answer_index > 3
  ) then
    raise exception 'invalid answer choice' using errcode = '22023';
  end if;

  for i in 1..answer_total loop
    if p_answers[i] = answer_key[i] then
      answer_score := answer_score + 1;
    end if;
  end loop;

  insert into public.quiz_results(user_id, lesson_id, score, total, grading_source)
  values (auth.uid(), p_lesson_id, answer_score, answer_total, 'server-rpc');

  return query select answer_score, answer_total;
end;
$$;
revoke all on function public.submit_quiz_answers(integer, integer[]) from public, anon, authenticated;
grant execute on function public.submit_quiz_answers(integer, integer[]) to authenticated;

-- Quiz rows remain readable under the existing own-row RLS policy; clients can no longer set scores.
revoke all on public.quiz_results from public, anon, authenticated;
grant select on public.quiz_results to authenticated;
drop policy if exists quiz_insert_own on public.quiz_results;

-- Exclude historic client-reported scores from trusted aggregate statistics.
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare published_count integer; result json;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select count(*) into published_count from public.lessons where published;
  select json_build_object(
    'total_registered',(select count(*) from public.profiles),
    'new_today',(select count(*) from public.profiles where created_at>=date_trunc('day',now())),
    'new_7_days',(select count(*) from public.profiles where created_at>=now()-interval '7 days'),
    'new_30_days',(select count(*) from public.profiles where created_at>=now()-interval '30 days'),
    'started_students',(select count(distinct user_id) from public.lesson_progress),
    'completed_one',(select count(distinct user_id) from public.lesson_progress where completed_at is not null),
    'completed_course',(select count(*) from (select lp.user_id from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id and l.published where lp.completed_at is not null group by lp.user_id having count(*)=published_count) t where published_count>0),
    'published_lessons',published_count,
    'avg_quiz_percent',(select round(avg(score::numeric*100/total),1) from public.quiz_results where grading_source='server-rpc'),
    'quiz_attempts',(select count(*) from public.quiz_results where grading_source='server-rpc'),
    'visits_total',(select count(*) from public.page_visits),
    'visits_today',(select count(*) from public.page_visits where visited_at>=date_trunc('day',now())),
    'visits_7_days',(select count(*) from public.page_visits where visited_at>=now()-interval '7 days'),
    'visitors_unique',(select count(distinct visitor) from public.page_visits)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.share_stats(link_token text)
returns json language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare published_count integer; result json;
begin
  if not public._share_ok(link_token) then raise exception 'not authorized' using errcode = '42501'; end if;
  select count(*) into published_count from public.lessons where published;
  select json_build_object(
    'total_registered',(select count(*) from public.profiles),
    'new_today',(select count(*) from public.profiles where created_at>=date_trunc('day',now())),
    'new_7_days',(select count(*) from public.profiles where created_at>=now()-interval '7 days'),
    'new_30_days',(select count(*) from public.profiles where created_at>=now()-interval '30 days'),
    'started_students',(select count(distinct user_id) from public.lesson_progress),
    'completed_one',(select count(distinct user_id) from public.lesson_progress where completed_at is not null),
    'completed_course',(select count(*) from (select lp.user_id from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id and l.published where lp.completed_at is not null group by lp.user_id having count(*)=published_count) t where published_count>0),
    'published_lessons',published_count,
    'avg_quiz_percent',(select round(avg(score::numeric*100/total),1) from public.quiz_results where grading_source='server-rpc'),
    'quiz_attempts',(select count(*) from public.quiz_results where grading_source='server-rpc'),
    'visits_total',(select count(*) from public.page_visits),
    'visits_today',(select count(*) from public.page_visits where visited_at>=date_trunc('day',now())),
    'visits_7_days',(select count(*) from public.page_visits where visited_at>=now()-interval '7 days'),
    'visitors_unique',(select count(distinct visitor) from public.page_visits)
  ) into result;
  return result;
end;
$$;
revoke all on function public.share_stats(text) from public, anon, authenticated;
grant execute on function public.share_stats(text) to anon, authenticated;

create or replace function public.admin_lesson_stats()
returns table(lesson_id integer,title_ar text,views bigint,unique_viewers bigint,completions bigint,avg_quiz_percent numeric)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
    select l.id,l.title_ar,
      (select count(*) from public.lesson_views v where v.lesson_id=l.id),
      (select count(distinct v.user_id) from public.lesson_views v where v.lesson_id=l.id),
      (select count(*) from public.lesson_progress lp where lp.lesson_id=l.id and lp.completed_at is not null),
      (select round(avg(q.score::numeric*100/q.total),1) from public.quiz_results q where q.lesson_id=l.id and q.grading_source='server-rpc')
    from public.lessons l where l.published order by l.id;
end;
$$;
revoke all on function public.admin_lesson_stats() from public, anon, authenticated;
grant execute on function public.admin_lesson_stats() to authenticated;

create or replace function public.admin_list_students(page_size integer default 25,page_offset integer default 0)
returns table(student_name text,account_role text,registered_at timestamptz,lessons_started bigint,lessons_completed bigint,last_activity timestamptz,avg_quiz_percent numeric,total_count bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare ps integer:=least(greatest(coalesce(page_size,25),1),100); po integer:=greatest(coalesce(page_offset,0),0);
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
    select p.display_name,p.role,p.created_at,
      (select count(*) from public.lesson_progress lp where lp.user_id=p.id),
      (select count(*) from public.lesson_progress lp where lp.user_id=p.id and lp.completed_at is not null),
      greatest((select max(lp.started_at) from public.lesson_progress lp where lp.user_id=p.id),
        (select max(lp.completed_at) from public.lesson_progress lp where lp.user_id=p.id),
        (select max(q.created_at) from public.quiz_results q where q.user_id=p.id),
        (select max(v.viewed_at) from public.lesson_views v where v.user_id=p.id)),
      (select round(avg(q.score::numeric*100/q.total),1) from public.quiz_results q where q.user_id=p.id and q.grading_source='server-rpc'),
      count(*) over()
    from public.profiles p order by p.created_at desc,p.id limit ps offset po;
end;
$$;
revoke all on function public.admin_list_students(integer,integer) from public, anon, authenticated;
grant execute on function public.admin_list_students(integer,integer) to authenticated;

create or replace function public.share_lesson_stats(link_token text)
returns table(lesson_id integer,title_ar text,views bigint,unique_viewers bigint,completions bigint,avg_quiz_percent numeric)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public._share_ok(link_token) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
    select l.id,l.title_ar,
      (select count(*) from public.lesson_views v where v.lesson_id=l.id),
      (select count(distinct v.user_id) from public.lesson_views v where v.lesson_id=l.id),
      (select count(*) from public.lesson_progress lp where lp.lesson_id=l.id and lp.completed_at is not null),
      (select round(avg(q.score::numeric*100/q.total),1) from public.quiz_results q where q.lesson_id=l.id and q.grading_source='server-rpc')
    from public.lessons l where l.published order by l.id;
end;
$$;
revoke all on function public.share_lesson_stats(text) from public, anon, authenticated;
grant execute on function public.share_lesson_stats(text) to anon, authenticated;
