-- Arabic Networking Academy — merged Supabase SQL
-- Run in Supabase SQL Editor. Review admin emails at the end.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(display_name) between 2 and 60),
 role text not null default 'student' check (role in ('student','admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.lessons (
 id int primary key, title_ar text not null, title_en text not null,
 published boolean not null default false
);
insert into public.lessons(id,title_ar,title_en,published) values
(1,'الشبكات المحلية والواسعة','LANs and WANs',true),
(2,'نموذج OSI','The OSI Model',true),
(3,'عنونة IP','IP Addressing',true),
(4,'التوجيه','Routing',true),
(5,'الشبكات المحلية الافتراضية','VLANs',true),
(6,'VXLAN و VRF','VXLAN and VRF',true),
(7,'بروتوكولات TCP/IP','TCP/IP',true),
(8,'استكشاف الأخطاء والأمن الأساسي','Troubleshooting and Basic Security',true)
on conflict(id) do update set title_ar=excluded.title_ar,title_en=excluded.title_en,published=excluded.published;

create table if not exists public.lesson_progress (
 user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id int not null references public.lessons(id),
 started_at timestamptz not null default now(), completed_at timestamptz,
 primary key(user_id,lesson_id)
);
create table if not exists public.quiz_results (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id int not null references public.lessons(id),
 score int not null check(score >= 0), total int not null check(total > 0),
 created_at timestamptz not null default now(), check(score <= total)
);
create table if not exists public.lesson_views (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 lesson_id int not null references public.lessons(id), viewed_at timestamptz not null default now()
);
create index if not exists idx_profiles_created on public.profiles(created_at);
create index if not exists idx_views_lesson on public.lesson_views(lesson_id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name) values
 (new.id,rpad(left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'User'),60),2,'_'))
 on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.profiles(id,display_name)
select u.id,rpad(left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(split_part(u.email,'@',1),''),'User'),60),2,'_')
from auth.users u where not exists(select 1 from public.profiles p where p.id=u.id)
on conflict(id) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null and (new.role is distinct from old.role or new.id is distinct from old.id) then
  raise exception 'role/id cannot be changed from the client' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles for each row execute function public.guard_profile_role();

do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.quiz_results'::regclass and conname='quiz_results_total_reasonable') then
  alter table public.quiz_results add constraint quiz_results_total_reasonable check(total <= 100) not valid;
 end if;
end $$;

alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_results enable row level security;
alter table public.lesson_views enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using(id=auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
revoke update on public.profiles from anon,authenticated;
grant update(display_name) on public.profiles to authenticated;
drop policy if exists lessons_select_all on public.lessons;
create policy lessons_select_all on public.lessons for select using(true);
drop policy if exists progress_select_own on public.lesson_progress;
create policy progress_select_own on public.lesson_progress for select using(user_id=auth.uid());
drop policy if exists progress_insert_own on public.lesson_progress;
create policy progress_insert_own on public.lesson_progress for insert with check(user_id=auth.uid() and exists(select 1 from public.lessons l where l.id=lesson_id and l.published));
drop policy if exists progress_update_own on public.lesson_progress;
create policy progress_update_own on public.lesson_progress for update using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists quiz_select_own on public.quiz_results;
create policy quiz_select_own on public.quiz_results for select using(user_id=auth.uid());
drop policy if exists quiz_insert_own on public.quiz_results;
create policy quiz_insert_own on public.quiz_results for insert with check(user_id=auth.uid() and exists(select 1 from public.lessons l where l.id=lesson_id and l.published));
drop policy if exists views_select_own on public.lesson_views;
create policy views_select_own on public.lesson_views for select using(user_id=auth.uid());
drop policy if exists views_insert_own on public.lesson_views;
create policy views_insert_own on public.lesson_views for insert with check(user_id=auth.uid() and exists(select 1 from public.lessons l where l.id=lesson_id and l.published));

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
 'quiz_attempts',(select count(*) from quiz_results)) into result;
 return result;
end $$;

create or replace function public.admin_registrations_by_day(days int default 30)
returns table(day date,registrations bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 return query select d::date,count(p.id) from generate_series((current_date-(least(greatest(coalesce(days,30),1),366)-1))::timestamp,current_date::timestamp,interval '1 day') d
 left join profiles p on p.created_at::date=d::date group by d order by d;
end $$;

create or replace function public.admin_lesson_stats()
returns table(lesson_id int,title_ar text,views bigint,unique_viewers bigint,completions bigint,avg_quiz_percent numeric)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 return query select l.id,l.title_ar,
 (select count(*) from lesson_views v where v.lesson_id=l.id),
 (select count(distinct v.user_id) from lesson_views v where v.lesson_id=l.id),
 (select count(*) from lesson_progress lp where lp.lesson_id=l.id and lp.completed_at is not null),
 (select round(avg(q.score::numeric*100/q.total),1) from quiz_results q where q.lesson_id=l.id)
 from lessons l where l.published order by l.id;
end $$;

create or replace function public.admin_list_students(page_size int default 25,page_offset int default 0)
returns table(student_name text,account_role text,registered_at timestamptz,lessons_started bigint,lessons_completed bigint,last_activity timestamptz,avg_quiz_percent numeric,total_count bigint)
language plpgsql stable security definer set search_path=public as $$
declare ps int:=least(greatest(coalesce(page_size,25),1),100); po int:=greatest(coalesce(page_offset,0),0);
begin
 if not public.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 return query select p.display_name,p.role,p.created_at,
 (select count(*) from lesson_progress lp where lp.user_id=p.id),
 (select count(*) from lesson_progress lp where lp.user_id=p.id and lp.completed_at is not null),
 greatest((select max(lp.started_at) from lesson_progress lp where lp.user_id=p.id),
 (select max(lp.completed_at) from lesson_progress lp where lp.user_id=p.id),
 (select max(q.created_at) from quiz_results q where q.user_id=p.id),
 (select max(v.viewed_at) from lesson_views v where v.user_id=p.id)),
 (select round(avg(q.score::numeric*100/q.total),1) from quiz_results q where q.user_id=p.id),
 count(*) over() from profiles p order by p.created_at desc,p.id limit ps offset po;
end $$;

create table if not exists public.lesson_section_overrides(
 lesson_id int not null references public.lessons(id) on delete cascade,
 section_id text not null check(section_id ~ '^[a-z0-9_-]{1,40}$'),
 html text not null check(char_length(html)<=200000),
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),primary key(lesson_id,section_id)
);
alter table public.lesson_section_overrides enable row level security;
drop policy if exists overrides_select_all on public.lesson_section_overrides;
create policy overrides_select_all on public.lesson_section_overrides for select using(true);
drop policy if exists overrides_admin_write on public.lesson_section_overrides;
create policy overrides_admin_write on public.lesson_section_overrides for all using(public.is_admin()) with check(public.is_admin());

create table if not exists public.admin_share_links(
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz
);
alter table public.admin_share_links enable row level security;
revoke all on public.admin_share_links from public,anon,authenticated;
create or replace function public._share_hash(t text) returns text
language sql immutable set search_path=public as $$
 select encode(sha256(convert_to(coalesce(t,''),'utf8')),'hex');
$$;
create or replace function public._share_ok(t text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.admin_share_links where token_hash=public._share_hash(t) and revoked_at is null and expires_at>now());
$$;
revoke all on function public._share_hash(text) from public,anon,authenticated;
revoke all on function public._share_ok(text) from public,anon,authenticated;

-- ✅ تم تعديل المدة الافتراضية إلى 40 يوماً والحد الأقصى إلى 40 يوماً
create or replace function public.admin_create_share_link(valid_days int default 40) returns text
language plpgsql security definer set search_path=public as $$
declare tok text; d int:=least(greatest(coalesce(valid_days,40),1),40);
begin
 if not public.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 tok:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.admin_share_links(token_hash,created_by,expires_at) values(public._share_hash(tok),auth.uid(),now()+make_interval(days=>d));
 return tok;
end $$;
create or replace function public.admin_revoke_share_links() returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 update public.admin_share_links set revoked_at=now() where revoked_at is null;
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
 'quiz_attempts',(select count(*) from quiz_results)) into result;
 return result;
end $$;

-- Only the aggregate share endpoint is available to token holders.
revoke all on function public.admin_stats() from public,anon;
revoke all on function public.admin_registrations_by_day(int) from public,anon;
revoke all on function public.admin_lesson_stats() from public,anon;
revoke all on function public.admin_list_students(int,int) from public,anon;
revoke all on function public.admin_create_share_link(int) from public,anon;
revoke all on function public.admin_revoke_share_links() from public,anon;
revoke all on function public.share_stats(text) from public,anon,authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_registrations_by_day(int) to authenticated;
grant execute on function public.admin_lesson_stats() to authenticated;
grant execute on function public.admin_list_students(int,int) to authenticated;
grant execute on function public.admin_create_share_link(int) to authenticated;
grant execute on function public.admin_revoke_share_links() to authenticated;
grant execute on function public.share_stats(text) to anon,authenticated;

-- Repair placeholder names only when valid metadata exists.
update public.profiles p set display_name=left(trim(u.raw_user_meta_data->>'display_name'),60)
from auth.users u where u.id=p.id and char_length(p.display_name)=2
and char_length(trim(coalesce(u.raw_user_meta_data->>'display_name','')))>2;

-- Assign administrators after they have registered. Run from SQL Editor (not a client session).
update public.profiles set role='admin' where id in
(select id from auth.users where email in ('solimanrashwan29@gmail.com','touhamibader0@gmail.com'));
