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

`help.html`, `assets/js/lesson.js` (shared lesson logic), `assets/img/` (logo), `index.html`, `register.html`, `login.html`, `reset.html`, `curriculum.html`, `my-learning.html`, `about.html`, `admin.html`, `lesson-1.html` through `lesson-9.html`, `assets/`, `supabase/schema.sql`, `SECURITY-REVIEW.md`, and `tools/Audit-AnaAcademy.ps1`.

## Status

Platform includes 9 lessons. The final lesson covers MAC addressing; the lesson files and `supabase/schema.sql` include all nine lessons.


## Update 2026-10-17
- Password show/hide button now sits under the password field (login, register, reset).
- Home page: the animated network drawing is now a faint watermark behind the hero text.
- Admin dashboard: "مشاركة رابط لوحة الإدارة" button (admins only). **Run once in Supabase → SQL Editor:** `supabase/migrations/20261017000100_admin_share_links.sql`.
  Links are read-only, aggregate-only (no student names/emails), expire after 40 days, and can be revoked from the dashboard.

## Update 2026-10-20 — الحقل التطبيقي + عدّاد الزيارات العامة
- **الحقل التطبيقي** في كل درس (`assets/js/lab.js`): زر في أعلى الدرس يفتح نافذة بخانتين: «الشرح» المبسّط و«المحاكاة» (أجهزة وسويتش وراوتر وكابلات وعناوين وPing). **إجباري**: زر «مكتمل» يبقى مقفلًا حتى يضغط الطالب «فهمت الشرح» وينجز مهمة المحاكاة. حالة الإنجاز تُحفظ في متصفح الطالب (localStorage)، والدرس المكتمل مسبقًا لا يُقفل.
- **الزيارات العامة**: بطاقات جديدة في لوحة الإدارة (الإجمالي، اليوم، 7 أيام، زوار فريدون). **نفّذ مرة واحدة في Supabase → SQL Editor:** `supabase/migrations/20261020000100_public_visits.sql` (نفّذه بعد بقية الملفات لأنه يحدّث `admin_stats` و`share_stats`). نفس الكود مضمَّن في `schema.sql`.
- رفع الملفات: ارفع كل المحتويات (خصوصًا `assets/js/lab.js` و`assets/js/lesson.js` و`assets/js/app.js` و`assets/css/style.css` و`admin.html` و`index.html` وصفحات الدروس).

## Update 2026-11-01 — comprehension checks and review
- The practical field in each lesson now requires a successful, lesson-specific simulator mission **and** a correct answer to its comprehension question before completion is unlocked. Existing local lab completion flags use a new version key, so learners complete the revised activity once.
- Lesson 6 states that its grouping simulator illustrates isolation but does not create a real VRF or VXLAN tunnel.
- Simulator devices can be selected, connected, and moved using the keyboard; packet motion shortens for users who request reduced motion.
- `tools/Audit-AnaAcademy.ps1` checks lesson and question coverage, completion wiring, keyboard/dialog accessibility, reduced motion, sanitizer safeguards, RLS source artifacts, private-key markers, and deployment headers. It is a **static** review and does not attack the site or connect to Supabase. See `SECURITY-REVIEW.md` for scope and findings.
- **Run from the project folder:** `powershell -ExecutionPolicy Bypass -File .\tools\Audit-AnaAcademy.ps1`
