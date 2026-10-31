# Security and lesson review

## Local review tool

Run `powershell -ExecutionPolicy Bypass -File .\tools\Audit-AnaAcademy.ps1` from the project folder. The script checks the nine lesson IDs and quizzes, the nine lab comprehension questions, the completion gate, keyboard and dialog focus access, reduced motion, basic lesson-HTML sanitization, RLS source artifacts, private-key markers, risky HTML sinks, and deployment-header configuration. It never prints matched secret values.

The script is a static source review. It does not connect to Supabase, probe a running server, or run attacks. A `WARN` requires a human decision; a passing pattern check is not proof that a system is secure.

## Findings and limits

- Supabase RLS policies, an admin-role guard, restricted client grants, and a rollback-based RLS verification SQL file are present in the source. The SQL verification needs a separate test database and was not run here.
- Database-authored lesson HTML removes executable tags and event handlers, blocks unsafe URL schemes, removes `srcset` and tracking `ping`, and rejects CSS URL/import/expression patterns. New-tab links receive `noopener noreferrer`. This filter is defense in depth, not a substitute for a maintained HTML sanitizer.
- Lesson completion is a learning-progress feature, not an authorization boundary. Browser-side state can be edited by the learner.
- Anonymous page-visit limiting is based on a visitor token; it is not an IP-based abuse control.
- Deployment-specific security headers must be set at the actual hosting provider. This project has no provider specified, so no potentially incompatible global CSP was added.
- No active security scan was completed: the official ZAP/Java downloads did not complete in this environment. ZAP's [Baseline Scan](https://www.zaproxy.org/docs/docker/baseline-scan/) is passive; its [Full Scan](https://www.zaproxy.org/docs/docker/full-scan/) performs active attacks. Run an active scan only against the local test deployment with test accounts and data, and keep its scope on the local origin.

## Lesson review scope

Each of the nine practical fields now ends with a question specific to the lesson topic. Students must complete the simulator mission and choose the correct answer before the field is marked complete. The static tool checks that every question has options, an answer index, and explanatory feedback; an instructor should still review factual accuracy and fit against the lesson's intended learning outcome.
