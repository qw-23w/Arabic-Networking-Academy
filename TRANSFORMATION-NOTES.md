# Product transformation notes

## Preserved
- Static HTML/CSS/JS delivery and relative links compatible with GitHub Pages.
- Supabase Auth, account registration/sign-in/reset, user profiles, session persistence, RLS, lesson views and saved progress.
- Server-side answer correction through `submit_quiz_answers`; no answer keys are sent to the browser by this redesign.
- Nine lesson files, their Arabic/English explanations, quizzes, section overrides, and lesson-specific network lab/completion requirements.
- Existing admin-only aggregate RPCs, paginated privacy-limited student activity, and share links.
- Existing route names and schema. No database migration was added.

## New frontend experience
- A premium navy/cyan/orange identity with the reference's split hero, real night-Earth and server photography, a dependency-free SVG network overlay, course strip, learning path and statistics/contact band.
- Searchable, topic-filtered and level-filtered catalog for the nine published lessons. Objective, prerequisites, estimated reading duration and progress are shown; reading time is derived from existing text at approximately 190 words per minute and excludes quiz/lab time.
- A single documented Fundamentals learning path, built from available content only.
- Dashboard resume action and summary statistics computed from the authenticated account’s progress and latest ten quiz attempts.
- Responsive collapsible mobile lesson index, scroll-based reading progress, computed reading-time estimate, and copy controls for existing code blocks.
- Homepage featured lessons link directly to their existing lesson files.
- Home and course photos use Pexels CDN images; source pages and credits are listed in `IMAGE-CREDITS.md`.

## Verification and deployment
Serve the folder over HTTP (for example `python -m http.server 8000`) and open `index.html` through `http://localhost:8000/`. For production, upload the files to GitHub Pages with the repository’s existing `_config.yml`; it excludes the `supabase/`, `tools/` and review documents from the public site. Supabase features require the existing project URL, public anon key, and configured Auth redirects in `assets/js/config.js` and Supabase. Those values and backend setup were not changed here.

The local browser can verify public routes, responsive layout, curriculum filtering, SVG controls and static lesson enhancements. Registration, authenticated persistence, quiz submission, RLS and admin RPCs require the owner’s live Supabase project and credentials; no production account or database write was used for this review.
