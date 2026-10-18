-- Arabic Networking Academy — migration 1/2: additive integrity + paginated admin student list
-- Safe to re-run. Does NOT delete or rewrite existing data. Review before applying (Supabase > SQL Editor).

-- 1) Backfill: make sure every auth user has a profile row (accounts created before the trigger existed
--    would otherwise be unable to save progress because of the foreign keys). Additive only.
insert into public.profiles (id, display_name)
select u.id,
       rpad(left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1)), 60), 2, '_')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2) Defence in depth: a role can only be changed from the SQL Editor / service role (no JWT user),
--    never by a signed-in client, even if a grant or policy is later loosened by mistake.
create or replace function public.guard_profile_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.id is distinct from old.id) then
    raise exception 'role/id cannot be changed from the client' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- 3) Quiz sanity: reject absurd totals on NEW rows (NOT VALID = existing rows are not scanned or rejected).
--    NOTE: the database cannot know the real answers, so a determined student can still submit a
--    forged score for themselves; it only ever affects their own record and the aggregate average.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_results_total_reasonable') then
    alter table public.quiz_results add constraint quiz_results_total_reasonable check (total <= 100) not valid;
  end if;
end $$;

-- 4) Paginated student list for the admin dashboard.
--    Shows display name + activity only. NO email addresses. Admin-only, checked inside the database.
--    One row per profile; every metric is an independent sub-select, so joins cannot double-count.
create or replace function public.admin_list_students(page_size int default 25, page_offset int default 0)
returns table (student_name text, account_role text, registered_at timestamptz,
               lessons_started bigint, lessons_completed bigint, last_activity timestamptz,
               avg_quiz_percent numeric, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  ps int := least(greatest(coalesce(page_size, 25), 1), 100);
  po int := greatest(coalesce(page_offset, 0), 0);
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select p.display_name, p.role, p.created_at,
      (select count(*) from lesson_progress lp where lp.user_id = p.id),
      (select count(*) from lesson_progress lp where lp.user_id = p.id and lp.completed_at is not null),
      greatest(
        (select max(lp.started_at)   from lesson_progress lp where lp.user_id = p.id),
        (select max(lp.completed_at) from lesson_progress lp where lp.user_id = p.id),
        (select max(q.created_at)    from quiz_results   q  where q.user_id  = p.id),
        (select max(v.viewed_at)     from lesson_views   v  where v.user_id  = p.id)),
      (select round(avg(q.score::numeric * 100 / q.total), 1) from quiz_results q where q.user_id = p.id),
      count(*) over ()
    from profiles p
    order by p.created_at desc, p.id
    limit ps offset po;
end $$;

revoke all on function public.admin_list_students(int, int) from public, anon;
grant execute on function public.admin_list_students(int, int) to authenticated;
