-- Arabic Networking Academy — migration 2/2: least-privilege table grants (defence in depth under RLS)
-- Supabase grants broad table privileges to anon/authenticated by default and relies on RLS alone.
-- This keeps RLS as is and ALSO removes privileges the application never uses.
-- Reversible (see ROLLBACK at the bottom). Apply in a quiet period and test one student login afterwards.

revoke all on public.profiles, public.lessons, public.lesson_progress, public.quiz_results,
              public.lesson_views, public.lesson_section_overrides from anon, authenticated;

-- public reads (titles / lesson text overrides are not private)
grant select on public.lessons, public.lesson_section_overrides to anon, authenticated;

-- profiles: read own row (RLS), edit display_name only
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- progress: read/insert own rows (RLS); the only editable column is completed_at (not user_id/lesson_id/started_at)
grant select, insert on public.lesson_progress to authenticated;
grant update (completed_at) on public.lesson_progress to authenticated;

-- quiz results and views are append-only for students
grant select, insert on public.quiz_results, public.lesson_views to authenticated;

-- lesson text overrides: write grants exist, but the RLS policy "overrides_admin_write" limits them to admins
grant insert, update, delete on public.lesson_section_overrides to authenticated;

-- ROLLBACK (only if something unexpectedly breaks):
--   grant all on public.profiles, public.lessons, public.lesson_progress, public.quiz_results,
--               public.lesson_views, public.lesson_section_overrides to anon, authenticated;
--   (then re-run the revoke update on profiles from schema.sql so role stays protected)
