# Design system — ANA Academy

## Identity
Technical editorial design for an Arabic-first networking academy. The supplied reference informs the midnight-navy interface, network-sphere illustration, cyan/blue navigation signals, and carefully placed orange actions. It does not supply factual course content or user data.

## Design tokens
`assets/css/experience.css` owns the shared CSS variable system: midnight/blue/cyan/orange accents; neutral paper/surface/ink/muted/line colors; success/warning/error roles; Tajawal Arabic and system UI Latin; a fluid type scale; fixed 4–96px spacing; consistent square-to-small radii; subtle shadows; and common button, card, form, badge, alert, and progress states. Light and dark themes use the same hierarchy with separately tuned contrast.

## Interface patterns
- Responsive site header with direct routes to home, curriculum, learning dashboard, about, help, theme and existing account actions.
- Home hero with a custom 3D vector globe, network paths and restrained motion; the main registration/continue action, curriculum action, and four real lesson previews follow the supplied reference composition.
- Course discovery with search, category and level filters; lesson objectives, prerequisites, approximate reading time, status and links derive from the actual nine-lesson catalog.
- One available learning path. It names the existing content and prerequisites rather than implying unbuilt cybersecurity, Linux or ethical-hacking courses exist.
- Lesson pages keep their original explanations, server-graded quizzes and required interactive simulator. A responsive course index, reading progress, text-derived estimated reading time, and copy buttons for existing code samples supplement the lesson.
- Student dashboard figures are calculated from the current authenticated account’s returned rows only. Admin data remains served by admin-only database functions.

## Motion and accessibility
The route animation responds to explicit controls; the diagrams remain legible without motion. Reduced-motion settings are honored. Controls remain keyboard operable, focus is visible, mobile course navigation collapses, and progress/search feedback is announced accessibly. Images below the fold retain lazy loading. The home hero and course photography are credited in `IMAGE-CREDITS.md` and served by the Pexels image CDN.

## Interior pages and mobile
The midnight theme is the default across the site; a visitor's explicit light/dark choice remains saved. Curriculum pages lead with the available path and searchable course library; lesson pages prioritize a calm reading surface and a collapsible mobile contents panel; learning and admin pages keep their existing account-scoped data and tools. About, help, and account pages reuse the same visual language without repeating the homepage hero. At narrow widths, navigation becomes a full-width collapsible list, content columns stack, learning metrics stay compact, and wide data tables scroll within their own frame.

## No new runtime dependencies
The design uses the existing static HTML/CSS/JavaScript structure, original SVG lesson artwork, and existing Supabase client. The homepage 3D globe is a local SVG geometry asset with reduced-motion support; no Three.js, WebGL, or heavy animation library is added.

