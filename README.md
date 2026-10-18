# أكاديمية الشبكات العربية — Arabic Networking Academy

Free, open-source Arabic networking course site. Static HTML/CSS/JS front end + Supabase (Auth + Postgres) back end. No build step.

## Setup (about 10 minutes)

1. **Supabase project:** create a free project at supabase.com.
2. **Database:** Dashboard → SQL Editor → paste all of `supabase/schema.sql` → Run.
3. **Keys:** Dashboard → Project Settings → API. Copy the Project URL and the `anon` public key into `assets/js/config.js`.
4. **Auth settings:** Authentication → URL Configuration → set *Site URL* to your deployed site, and add `https://YOUR-SITE/login.html` and `https://YOUR-SITE/reset.html` to *Redirect URLs*. Authentication → Providers → Email: keep "Confirm email" on (recommended). The site handles the pending-verification state.
5. **Make yourself admin:** register on the site, then run once in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
   ```
   The "لوحة الإدارة" link then appears for you only.
6. **Deploy:** upload the folder to Cloudflare Pages, Netlify or GitHub Pages (all free). For local testing run `python3 -m http.server` in this folder and open http://localhost:8000.

## How the statistics stay honest

- Registered accounts = rows in `profiles`, created by a database trigger when Supabase Auth creates a user. Logins and page refreshes never create rows; opening the registration page creates nothing.
- Admin numbers come from `admin_stats()`, `admin_registrations_by_day()`, `admin_lesson_stats()`. These are `SECURITY DEFINER` functions that raise an error unless `is_admin()` is true, checked in the database from the signed-in user's `profiles.role`. Hiding the link is only cosmetic.
- Students cannot change their own `role` (column-level grant allows only `display_name`). Row Level Security lets each student see only their own rows. Dashboard statistics are aggregates; the paginated student list shows display name and activity only — never emails.
- "Lesson opens" are logged for signed-in accounts once per browser session. For public page views, add a separate service such as Cloudflare Web Analytics.
- Course completion = completed every currently published lesson (`lessons.published`).

## Repair pass 2026-10-16 — what to apply
1. **Upload the new site files** (everything changed is static: `assets/`, lesson pages, `admin.html`, auth pages, `my-learning.html`).
2. **SQL, in this order, in Supabase → SQL Editor** (both files are re-runnable and delete no data):
   - `supabase/migrations/20261016000100_admin_students_and_integrity.sql` — profile backfill, role-change guard trigger, quiz `total <= 100` check, `admin_list_students()` (paginated, admin-only, no emails). The same code is appended to `schema.sql`.
   - `supabase/migrations/20261016000200_tighten_table_grants.sql` — optional but recommended least-privilege grants (rollback is written at the bottom). After applying: log in as a student, open a lesson, mark it complete, take a quiz; then open `admin.html` as admin.
3. **Verify authorization** by pasting `supabase/tests/rls_verification.sql` into the SQL Editor. It runs in a transaction that is rolled back; every NOTICE line must start with `PASS`.
4. **Check the admin role** (run once, read the result):
   ```sql
   select u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
   ```
   If your admin account is missing, set it (SQL Editor only; clients cannot do this):
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
   ```
5. Email confirmation is **unchanged**. The site handles both modes; see the Authentication → Providers → Email page in the dashboard if you want to change it.

Local UI tests (no network needed, mock backend): `python3 tests/ui_tests.py <path-to-site>` and `python3 tests/gfx.py`. They check interface logic only — not Supabase itself.

## Features added
- Logo (`assets/img`), help page with the contact email (`SUPPORT_EMAIL` in `config.js`), dark mode toggle in the nav (saved in the browser).
- Admins see an "✎ تعديل هذا القسم" button above each lesson section. Edits are stored in `lesson_section_overrides`, sanitized, and shown to everyone. "استعادة الأصل" deletes the override. **Re-run `supabase/schema.sql`** (it is safe to re-run) to create this table.

## Adding lessons

1. Copy `lesson-1.html` to `lesson-N.html`, change `LESSON_ID`, the sections (keep each `<section id="...">` under `.lesson`) and the `QUESTIONS` array. Progress, quiz and admin editing come from `assets/js/lesson.js`.
2. In `assets/js/app.js` add `href: "lesson-N.html", published: true` to that lesson.
3. In SQL: `update public.lessons set published = true where id = N;` (until then, progress writes for that lesson are blocked by policy).

## Files

`help.html`, `assets/js/lesson.js` (shared lesson logic), `assets/img/` (logo), `index.html`, `register.html`, `login.html`, `reset.html`, `curriculum.html`, `my-learning.html`, `about.html`, `admin.html`, `lesson-1.html`, `lesson-2.html`, `lesson-3.html`, `lesson-4.html`, `lesson-5.html`, `lesson-6.html`, `lesson-7.html`, `lesson-8.html`, `assets/`, `supabase/schema.sql`.

## Status

Platform complete. All 8 lessons are written in full (lesson 3 = IP addressing, lesson 4 = routing, lesson 5 = VLANs, lesson 6 = VXLAN and VRF, lesson 7 = TCP/IP protocols, lesson 8 = troubleshooting and basic security). **After deploying, re-run `supabase/schema.sql` once** so lesson 8 is marked published in the database; until then progress and quiz writes for lesson 8 are blocked by policy.


## Update 2026-10-17
- Password show/hide button now sits under the password field (login, register, reset).
- Home page: the animated network drawing is now a faint watermark behind the hero text.
- Admin dashboard: "مشاركة رابط لوحة الإدارة" button (admins only). **Run once in Supabase → SQL Editor:** `supabase/migrations/20261017000100_admin_share_links.sql`.
  Links are read-only, aggregate-only (no student names/emails), expire after 40 days, and can be revoked from the dashboard.
