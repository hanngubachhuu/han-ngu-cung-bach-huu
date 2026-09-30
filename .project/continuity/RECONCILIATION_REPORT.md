# Repository reconciliation — 2026-09-30

Status: BASELINE RECONCILED WITH EXPLICIT LIMITS. Assignment implementation awaits checkpoint CP1; it is not complete.

## Evidence and scope

- Source inspected: main, `91b58c97a2461e0a7c71dc0a0d09e109af452601`; clean before this documentation pass.
- Read project continuity skill and all eight requested continuity files before changes. This pass changes documentation only.
- Live Supabase `dmeqxdznzobbarvkmxyg`: ACTIVE_HEALTHY, reported PostgreSQL 17.6.1.166. Read tables, migration history, policies, key columns/constraints, access/save-attempt function definitions and storage bucket metadata.
- User refinement: automatic grading only for HSK/HSKK pathway assignments submitted by authenticated student accounts. Open speaking/writing/translation remain manual; no AI grading. Unrelated practice tools are outside this upgrade.

## Repository map

| Area | Actual source | Responsibility |
|---|---|---|
| Account/admin | scripts/render-account-pages.mjs; study/account-ui.mjs; study/account-service.mjs | Generated pages, profile, enrollment, permissions |
| Auth | study/auth.mjs; Supabase Auth | Existing shared session and identity |
| Lessons | data/lesson-manifest.js; data/lesson-registry.js; data/lessons/ | Authoring identities/content and public review |
| HSK1 | hsk1-lesson-engine.js | Local answers, timer, self-assessment and history |
| HSK2 | baiN_index.html; scripts/sync-lesson-pages.mjs | Generated legacy engines extracted during private build |
| Private content | scripts/private-publication.mjs; private-lesson-loader.js; study/private-lesson-data.mjs | Public/private split, authorized loading, shape adapter |
| Existing results | study/attempt-sync.mjs; learning_attempts; account_save_attempt | Account-scoped self-reported scores, not official grades |
| Study tools | study/; api/study.js; server/study-service.mjs | Dictionary/reading/characters, outside assignment scope |
| Google Docs | api/account.js; server/document-service.mjs; server/document-sync.mjs; server/google-docs-adapter.mjs | ADMIN-only profile editing |
| DB | supabase/migrations/; live Postgres | Profiles, entitlements, content, history, private storage policies |
| Deploy | scripts/build-web.mjs; .github/workflows/deploy.yml; vercel.json | main → dist → Pages; Vercel app/Node APIs |

## Live database and access trace

Observed counts (time-specific): 24 private lessons, 36 asset mappings, 26 access rows, 2 profiles, 4 enrollments, 3 attempts. Courses: hsk1/hsk2. All attempts are self_reported. No question-version, submission-detail, rubric, recording, graduation or certificate tables found in inspected public/account_internal inventory.

Signup creates STUDENT/PENDING. ADMIN requires APPROVED profile role, not user metadata. account_internal.can_access_lesson checks identity, approval, active enrollment, ALL mode or active lesson grant; ADMIN has the existing bypass. Content/assets/storage policies use that function. Login and UI visibility are not entitlements.

learning_attempts columns: id, user_id, lesson_id, client_attempt_id, score, max_score, source, version, submitted_at. Scores NOT NULL; source constrained to self_reported. Authenticated has SELECT/INSERT. INSERT checks owner and entitlement. Save RPC accepts browser points, serializes retries with advisory lock and updates self-marks by optimistic version. Official grading must not reuse this unchanged. Owners/ADMIN read attempts; no draft/published distinction. Private draft grade fields on these readable rows would leak. Existing scores cannot establish graduation eligibility.

courses.level is globally UNIQUE; lesson_content(level,lesson_no) is UNIQUE. HSKK cannot be inserted using fabricated HSK levels. Proposed course program discriminator and course-scoped uniqueness must preserve IDs/enrollment keys and pass CP1.

Storage: lesson-private private; study-lexicon public open dictionary data. Neither is a student recording pipeline. Three account_internal staging/backup tables have RLS disabled, but actual ACL checks: anon SELECT=false; authenticated SELECT=false and INSERT/UPDATE/DELETE=false. The inventory tool's generic full-exposure claim is contradicted by checked grants. Defense-in-depth RLS is a separate proposal; no automatic alteration.

## Lesson compatibility

| Representative | Verified shape/behavior |
|---|---|
| HSK1 bài 1 | Authoring schemaVersion 5, 24 questions, 45-minute local timer, public sample |
| HSK1 bài 4 | Live flat content, schemaVersion 5, 25 questions, exerciseSections |
| HSK1 bài 5 | Authoring schemaVersion 5; live flat content, 25 questions/sections; authoring limit 55 minutes |
| HSK2 bài 5 | Wrapped canonical content plus client_view; 68 canonical questions; legacy engine; 90 minutes |
| HSK2 bài 8 | SchemaVersion 5, 70 canonical questions; MCQ/reorder/multi_fill/listening/self_check/retell; 75 minutes |
| HSKK | hskk.html → baithinoihsk1.html; local teacher grading/export and data/schema/hskk-task.schema.json; no live HSKK course/submission adapter |

R.SCHEMA_VERSION=1, lesson-schema.js version 2 and payload schemaVersion 5 coexist. Search finds no consumer enforcing the registry constant. Live HSK2 bài 4 is schemaVersion 2; some live payloads omit version; flat/wrapped shapes coexist. Use existing adapter. Do not change constants as a pretend migration or normalize every lesson. Import must compare actual client_view against canonical questions and preserve stable IDs.

Source manifest privacy flags are incomplete alone. Build protects every lessonNo > 3, rewrites dist manifest and removes private authoring sources/audio/revision data. The source discrepancy is explained by this build contract, not a demonstrated dist leak.

Current payloads include answer keys and engines reveal them/self-mark. Official flow requires private question versions and allowlisted learner projections, including closure of raw lesson_content SELECT/legacy RPC bypasses when a lesson is enabled. Hiding answer UI is insufficient.

HSK1 timer decrements setInterval state and resumes saved timeLeftSec: closed-tab time is not deducted. This local-practice limitation is not an official deadline. New attempts need server started_at/deadline and enforcement at save/submit/expiry. Local autosave is not a server draft or immutable submission snapshot.

## Google Docs and audio

Current server adapter refreshes owner OAuth, checks owner identity, edits only full_name/phone/learning_goal, merges base/website/Google, checks profile/sync versions and Google requiredRevisionId, and logs DB commands. Docs does not own role/enrollment/grades. Source and automated tests verified; authenticated live Google operations were not repeated. Earlier WORK_STATE records live connection/readback success.

No Drive recording upload adapter, MP3 worker, recording lifecycle or seven-day cleanup found. Existing Docs connection does not prove Drive scopes/folder readiness. Keep existing connection; request Drive authorization only at storage checkpoint, never tokens pasted into chat.

## Architecture truth table

| Claim | Status | Evidence |
|---|---|---|
| HTML/CSS/JS, Node 24, esbuild | VERIFIED | package.json; node v24.19.0/npm 11.17.0 |
| main source; gh-pages artifact | VERIFIED | workflow/live Actions |
| Vercel/API + Supabase private lessons | VERIFIED within checked paths | live policies/functions, loader, HTTP samples |
| Private rollout still unmerged pilot | STALE | SECURITY_ARCHITECTURE pilot paragraph vs live 24 lessons/main release |
| Registry constant defines all schemas | CONTRADICTED | actual v2/v5/flat/wrapped contracts |
| No students yet; 24 access rows | STALE | older docs/deployment vs aggregate counts |
| All live migrations exactly mirrored locally | CONTRADICTED | 33 live entries vs 14 files, timestamp differences/publication repairs |
| Browser score eligible for certificate | CONTRADICTED | self_reported constraint, client points, docs/architecture |
| Google connection implies audio readiness | NOT IMPLEMENTED in inspected code | missing recording/MP3/retention |

Never blindly db push/reset/repair history. Unit DB fixtures intentionally select migration subsets; passing them is not a full hosted restore test.

## Verification

- npm test: 51/51 pass, including PGlite roles/RLS/ownership, version/retry and Google conflict cases.
- npm run lint: pass.
- npm run build: pass; 24 protected routes, 23 staged content snapshots, 33 private asset candidates outside dist.
- npm run validate:study: pass after completed build; 46 syntax checks plus corpus/assets/public-private assertions.
- check-private-browser.mjs: pass, 23 authenticated engines, guest/revoked denial, account-scoped storage and score sync. Providers mocked; no production student writes.
- check-account-browser.mjs: pass, account flows and responsive layouts. Providers mocked; no real mail.
- Live read-only 2026-09-30 14:26 Asia/Bangkok: account-service.mjs and attempt-sync.mjs hashes match committed bytes on Vercel/Pages; sampled HSK1/HSK2 bài 5 sources and audio URL return 404; unauthenticated Vercel account API 401, Pages API 404.
- GitHub Deploy website 36677311811 for inspected main SHA SUCCESS; Pages 36677385402 SUCCESS. Evidence: .cache/assignment-reconciliation-live.json (ignored, no secrets).
- Live DB policies/ACL/functions read. No new live student accounts or production write-based RLS probes; local role tests are not live student E2E.

Verification limitations/mistakes: validator initially ran while build was assembling dist and failed visibility assertion; rerun after build exit 0 passed, no source fix. Shell network initially sandbox-blocked; approved read-only run passed. Supabase reviewer temporarily failed due to quota; after user asked continuation the same reviewed query succeeded. No bypass. GitHub connector rejected a workflow collection URL; approved public GitHub API read returned evidence. No new live authenticated UI, microphone/device, conversion, Drive retention, certificate or Safari evidence is claimed. Supabase changelog and security docs checked; no upgrade was performed.

## Protected areas and next action

Preserve identities, grants/enrollments, three legacy attempts, content/assets, owner OAuth/SMTP, navigation and unrelated tools. No application code, DB schema/data/RLS, source visibility or deployment changed.

Review ASSIGNMENT_UPGRADE_PLAN.md CP1: extend current attempt/course model, privately version questions/rubrics/grades and add authenticated HSK/HSKK submission commands. Ask approval before R3/R4 implementation. CP2 audio architecture and CP3 public certificate verification remain separate later approvals.
