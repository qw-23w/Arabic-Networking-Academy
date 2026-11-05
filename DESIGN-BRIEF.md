# ANA Academy — transformation design brief

## Product and audience
A static, Arabic-first educational platform for beginners learning computer networking. The existing site contains one currently published path: the nine-lesson Networking Fundamentals sequence. Every lesson links to its existing explanations, quiz and practical simulator.

## Creative direction
A technical editorial identity closely following the supplied reference composition: midnight navy surfaces, controlled electric blue and cyan, and small orange signals. Arabic is set in Tajawal; Latin acronyms remain isolated in a neutral system UI face. The home hero pairs a real night-Earth photograph with SVG network arcs and a user-controlled packet path. The path is a visual explanation, not a live network monitor. Effects stay lightweight and respect reduced motion.

## Page map and goals

| Page | Main experience | Primary goal |
|---|---|---|
| Home | Learning promise, interactive network globe/topology, real lesson previews, and current path | Register or open a lesson |
| Curriculum | Searchable and filterable catalog of the nine published lessons, estimated reading time/level/objective/prerequisite, and path outline | Select the next lesson |
| Lessons 1–9 | Existing content and quizzes, course navigation, reading progress, estimated reading time, copyable commands where present, and lesson-specific lab | Understand, practise, and check a concept |
| Register / Login / Reset | Existing Supabase Auth flows | Create, use, or recover an account |
| My learning | Authenticated, real saved lesson progress and server-graded quiz history; continue-learning action | Resume or review learning |
| Admin | Existing database-checked aggregate statistics, privacy-limited paginated student list, and lesson activity | Review actual academy activity |
| About / Help | Mission, learning approach, privacy, usage and support information | Understand the academy or resolve an issue |

## Integrity and scope
- No fabricated users, testimonials, ratings, certificates, courses, or backend activity are displayed.
- The only path presented as available is the existing published networking course. Reading times are estimates derived from the actual lesson text at approximately 190 words per minute; they exclude time spent on the quiz and lab. Levels are editorial estimates for orientation.
- Supabase schema, RLS, Auth, existing records, progress, quiz correction, simulator missions, and admin authorization are preserved without a database migration.
- Existing course administration remains limited to features already supported by secure database functions and lesson overrides. The redesign does not add client-side publish permissions.
- The reference image was supplied after the initial brief; this document incorporates it as art direction, not as content to copy literally.

## Design system
The shared CSS-variable system and reusable controls live in `assets/css/experience.css`; usage notes live in `DESIGN.md`.
