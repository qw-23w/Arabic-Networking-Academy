-- Arabic Networking Academy — RLS / authorization verification (run in Supabase SQL Editor)
-- Everything runs inside ONE transaction that is rolled back at the end: no data is changed.
-- Requires at least two students, one admin, and all nine private quiz answer-key rows.
-- Each line of output should say PASS. Any FAIL means the policies are not protecting what they should.
-- (Written without access to a live database: run it yourself and read the NOTICE output.)

begin;

create temp table _ids as
  select (select id from public.profiles where role = 'student' order by created_at limit 1) as student,
         (select id from public.profiles where role = 'student' order by created_at desc limit 1) as other_student,
         (select id from public.profiles where role = 'admin'   order by created_at limit 1) as admin;
grant select on _ids to authenticated;

do $$ declare n int; begin
  select count(*) into n from public.quiz_answer_keys;
  raise notice '% private quiz answer keys configured (expected 9)', case when n = 9 then 'PASS:' else 'FAIL:' end;
end $$;

-- ===== as an ordinary student =====
select set_config('request.jwt.claims', json_build_object('sub', (select student from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$ declare n int; begin
  begin update public.profiles set role = 'admin' where id = (select student from _ids);
        raise notice 'FAIL: student changed own role'; exception when others then raise notice 'PASS: student cannot set role (%)', sqlstate; end;
  begin perform public.admin_stats(); raise notice 'FAIL: student called admin_stats';
        exception when sqlstate '42501' then raise notice 'PASS: admin_stats denied to student'; end;
  begin perform * from public.admin_list_students(5, 0); raise notice 'FAIL: student called admin_list_students';
        exception when sqlstate '42501' then raise notice 'PASS: admin_list_students denied to student'; end;
  select count(*) into n from public.profiles where id <> (select student from _ids);
  raise notice '% students see %', case when n = 0 then 'PASS:' else 'FAIL:' end, n || ' foreign profile rows (expected 0)';
  select count(*) into n from public.lesson_progress where user_id <> (select student from _ids);
  raise notice '% %', case when n = 0 then 'PASS:' else 'FAIL:' end, n || ' foreign progress rows visible (expected 0)';
  select count(*) into n from public.quiz_results where user_id <> (select student from _ids);
  raise notice '% %', case when n = 0 then 'PASS:' else 'FAIL:' end, n || ' foreign quiz rows visible (expected 0)';
  if has_table_privilege(current_user, 'public.quiz_results', 'INSERT') then
    raise notice 'FAIL: student can insert a client-supplied quiz score';
  else
    raise notice 'PASS: direct quiz-result insert privilege is revoked';
  end if;
  if has_table_privilege(current_user, 'public.quiz_answer_keys', 'SELECT') then
    raise notice 'FAIL: student can read private quiz answer keys';
  else
    raise notice 'PASS: private quiz answer keys are not readable by students';
  end if;
  if has_table_privilege(current_user, 'public.page_visit_rate_limits', 'SELECT') then
    raise notice 'FAIL: student can read pseudonymous rate-limit records';
  else
    raise notice 'PASS: rate-limit records are not readable by students';
  end if;
  if has_function_privilege(current_user, 'public.submit_quiz_answers(integer,integer[])', 'EXECUTE') then
    raise notice 'PASS: authenticated student can submit answers to the grading RPC';
  else
    raise notice 'FAIL: authenticated student cannot execute the grading RPC';
  end if;
  begin
    perform * from public.submit_quiz_answers(1, array[0]);
    raise notice 'FAIL: grading RPC accepted an incomplete answer set';
  exception when sqlstate '22023' then
    raise notice 'PASS: grading RPC rejected an incomplete answer set';
  end;
  begin
    perform * from public.submit_quiz_answers(1, array[4,0,0,0,0,0]);
    raise notice 'FAIL: grading RPC accepted an out-of-range option';
  exception when sqlstate '22023' then
    raise notice 'PASS: grading RPC rejected an out-of-range option';
  end;
  if (select other_student from _ids) = (select student from _ids) then
    raise notice 'SKIP: only one student exists; create a second student to test cross-user writes';
  else
    begin insert into public.lesson_progress (user_id, lesson_id) values ((select other_student from _ids), 1);
          raise notice 'FAIL: wrote progress for another user';
    exception when others then raise notice 'PASS: cannot write progress for another user (%)', sqlstate; end;
  end if;
  begin insert into public.lesson_section_overrides (lesson_id, section_id, html) values (1, 'intro', '<p>x</p>');
        raise notice 'FAIL: student wrote a lesson override'; exception when others then raise notice 'PASS: student cannot edit lesson content (%)', sqlstate; end;
end $$;

-- ===== as the administrator =====
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select admin from _ids), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare s json; n int; begin
  s := public.admin_stats();
  raise notice 'PASS: admin_stats works for admin: total_registered=%', s->>'total_registered';
  select count(*) into n from public.admin_list_students(5, 0);
  raise notice 'PASS: admin_list_students returned % rows', n;
  begin update public.profiles set role = 'student' where id = (select admin from _ids);
        raise notice 'FAIL: client session changed a role'; exception when others then raise notice 'PASS: even admin session cannot change roles from the client (%)', sqlstate; end;
end $$;

reset role;
rollback;
