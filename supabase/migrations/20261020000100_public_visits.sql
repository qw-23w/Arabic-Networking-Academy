-- Arabic Networking Academy — migration 4: public visit counter (عدّاد الزيارات العامة)
-- Safe to re-run. Adds one table + track_visit(), and extends admin_stats() / share_stats() with visit numbers.
-- Run this AFTER the other migrations (it replaces admin_stats and share_stats with versions that include visits).

-- Anonymous: a random browser id + page name + time. No IP, no email, no account link.
create table if not exists public.page_visits(
 id bigint generated always as identity primary key,
 page text not null check(char_length(page)<=60),
 visitor text not null check(char_length(visitor) between 8 and 64),
 visited_at timestamptz not null default now()
);
create index if not exists idx_visits_time on public.page_visits(visited_at);
create index if not exists idx_visits_visitor on public.page_visits(visitor,visited_at);
alter table public.page_visits enable row level security;
revoke all on public.page_visits from public,anon,authenticated;
create or replace function public.track_visit(p_page text,p_visitor text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_visitor is null or char_length(p_visitor) not between 8 and 64 or p_visitor !~ '^[A-Za-z0-9_-]+$' then return; end if;
 p_page:=left(coalesce(nullif(trim(p_page),''),'index.html'),60);
 if exists(select 1 from public.page_visits where visitor=p_visitor and visited_at>now()-interval '30 minutes') then return; end if;
 insert into public.page_visits(page,visitor) values(p_page,p_visitor);
end $$;
revoke all on function public.track_visit(text,text) from public;
grant execute on function public.track_visit(text,text) to anon,authenticated;

create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path=public as $$
declare published_count int; result json;
begin
 if not public.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into published_count from lessons where published;
 select json_build_object(
 'total_registered',(select count(*) from profiles),
 'new_today',(select count(*) from profiles where created_at>=date_trunc('day',now())),
 'new_7_days',(select count(*) from profiles where created_at>=now()-interval '7 days'),
 'new_30_days',(select count(*) from profiles where created_at>=now()-interval '30 days'),
 'started_students',(select count(distinct user_id) from lesson_progress),
 'completed_one',(select count(distinct user_id) from lesson_progress where completed_at is not null),
 'completed_course',(select count(*) from (select lp.user_id from lesson_progress lp join lessons l on l.id=lp.lesson_id and l.published where lp.completed_at is not null group by lp.user_id having count(*)=published_count) t where published_count>0),
 'published_lessons',published_count,
 'avg_quiz_percent',(select round(avg(score::numeric*100/total),1) from quiz_results),
 'quiz_attempts',(select count(*) from quiz_results),
 'visits_total',(select count(*) from page_visits),
 'visits_today',(select count(*) from page_visits where visited_at>=date_trunc('day',now())),
 'visits_7_days',(select count(*) from page_visits where visited_at>=now()-interval '7 days'),
 'visitors_unique',(select count(distinct visitor) from page_visits)) into result;
 return result;
end $$;

create or replace function public.share_stats(link_token text) returns json
language plpgsql stable security definer set search_path=public as $$
declare published_count int; result json;
begin
 if not public._share_ok(link_token) then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into published_count from lessons where published;
 select json_build_object(
 'total_registered',(select count(*) from profiles),
 'new_today',(select count(*) from profiles where created_at>=date_trunc('day',now())),
 'new_7_days',(select count(*) from profiles where created_at>=now()-interval '7 days'),
 'new_30_days',(select count(*) from profiles where created_at>=now()-interval '30 days'),
 'started_students',(select count(distinct user_id) from lesson_progress),
 'completed_one',(select count(distinct user_id) from lesson_progress where completed_at is not null),
 'completed_course',(select count(*) from (select lp.user_id from lesson_progress lp join lessons l on l.id=lp.lesson_id and l.published where lp.completed_at is not null group by lp.user_id having count(*)=published_count) t where published_count>0),
 'published_lessons',published_count,
 'avg_quiz_percent',(select round(avg(score::numeric*100/total),1) from quiz_results),
 'quiz_attempts',(select count(*) from quiz_results),
 'visits_total',(select count(*) from page_visits),
 'visits_today',(select count(*) from page_visits where visited_at>=date_trunc('day',now())),
 'visits_7_days',(select count(*) from page_visits where visited_at>=now()-interval '7 days'),
 'visitors_unique',(select count(distinct visitor) from page_visits)) into result;
 return result;
end $$;

revoke all on function public.admin_stats() from public,anon;
grant execute on function public.admin_stats() to authenticated;
revoke all on function public.share_stats(text) from public,anon,authenticated;
grant execute on function public.share_stats(text) to anon,authenticated;
