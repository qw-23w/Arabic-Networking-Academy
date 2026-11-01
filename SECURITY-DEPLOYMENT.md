# Security update deployment

## Existing Supabase project

1. In the Supabase SQL Editor, run migrations in order:
   - `supabase/migrations/20261101000100_harden_share_analytics.sql`
   - `supabase/migrations/20261101000200_server_grade_quizzes_and_rate_limit_visits.sql`
2. Run the separate private quiz-key SQL supplied to the site owner. **Do not put those answer arrays in the public GitHub repository.** The public migration creates a locked table but deliberately does not seed its values.
3. Upload the updated website files to the GitHub Pages repository. The quiz UI calls the new RPC, so coordinate the SQL update and page deployment; results cannot be saved while the deployed page and database are on different versions.
4. After creating two test student accounts and one admin account, run `supabase/tests/rls_verification.sql` in SQL Editor. It rolls back its test transaction.

The latest visit counter uses Supabase's forwarded-address header when present. It stores a SHA-256 digest for a short-lived rate limit and never writes the raw address. If the header is absent, it falls back to the client visitor token, which is easier to change.

## New Supabase project

Use `supabase/schema.sql` for the baseline schema, then privately seed all nine quiz answer arrays in SQL Editor. Do not publish the key seed SQL alongside the static site.

## Limits

The static site repository cannot set verified HTTP response headers for its host. Review the actual hosting response headers separately. The IP throttle is a coarse application limit, not a WAF, and the quiz is not a proctored assessment.
