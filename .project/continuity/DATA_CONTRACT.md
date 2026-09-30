# DATA CONTRACT — HÁN NGỮ CÙNG BÁCH HỮU

Tài liệu này là ranh giới kiểm soát dữ liệu. Không điền tên bảng hoặc field nếu chưa xác minh.

## Required trace

Every important data path must be traceable:

SOURCE
→ IDENTITY
→ TRANSFORMATION
→ DESTINATION
→ CONSUMER
→ ACCESS CONTROL
→ VERIFICATION

## Current conceptual domains

| Domain | Current conceptual owner | Must verify |
|---|---|---|
| Lesson manifest | repository canonical manifest | exact file + consumer |
| Lesson content | canonical lesson data / backend for private content | exact source and visibility |
| Student account | Supabase/Auth boundary | exact tables/owner key |
| Lesson entitlement | Supabase/access model | exact policy and relation |
| Progress/submission | persistence layer | exact owner and payload |
| Google Docs profile data | Google Docs + server sync | exact fields and direction |
| Private media | Supabase Private Storage | bucket + policy + signed/authenticated path |
| Public build | build pipeline | exact allowlist |

## Access-state separation

- account exists
- authenticated
- approved
- entitled to lesson
- lesson published/available
- UI displays lesson

A discrepancy can occur at any boundary.

## Source-of-truth rules

1. One canonical owner per concept.
2. No silent key renames.
3. Missing UI data does not prove missing database data.
4. Sync conflict must be diagnosed before overwrite.
5. Preserve stable IDs.
6. Data migrations must have rollback/verification reasoning.

## Google Docs checklist

- source
- destination
- direction
- matching key
- fields allowed
- conflict behavior
- duplicate behavior
- missing record behavior
- retry
- error classification
- last verified sync

## Supabase checklist

- schema inspected
- RLS inspected
- owner key identified
- service/client boundary identified
- representative query verified
- migration impact recorded

## Lesson checklist

- lesson ID
- lessonNo
- level
- visibility
- href/route
- data source
- renderer
- exercise/question shape
- completion/submission
- entitlement check

## Verified current contracts — 2026-09-30

| Domain | Source/identity | Consumer/access | Verification |
|---|---|---|---|
| Account | Auth user → profiles.user_id | own profile or APPROVED ADMIN; write commands, not client role edits | Live policies/functions + PGlite tests |
| Enrollment | enrollments(user_id,course_id), active/access_mode; student_lesson_access(user_id,lesson_id) | can_access_lesson checks approval + enrollment + selected grant or ALL | Live function/policies and tests |
| Lesson | Authoring manifest/data; private lesson_content.id/content at runtime | private loader reads authorized content; flat/wrapped adapter; HSK2 client_view | Live shape/count metadata + 23 mocked browser engine checks |
| Attempt | learning_attempts.id; unique(user_id,lesson_id,client_attempt_id) | self_reported score/max; own or ADMIN read; account_save_attempt retries/version | Live columns/checks/functions/policies; unit/browser tests |
| Docs | profiles full_name/phone/learning_goal + documents base/revision + sync_logs | ADMIN-only server adapter, explicit three-way conflict workflow | Source/tests; earlier live evidence not repeated |
| Media | lesson_assets mapping → lesson-private object | storage RLS entitlement; authenticated download | Live policies/private bucket, browser fixture and deployed exclusion |
| Artifact | main → build-web/protectPublication → dist | Pages static; Vercel API separately | Build/validator/live hashes and Actions |

Current learning_attempts is not a submission answer store: no answers/question version/rubric/start/deadline/publication fields. Current score/max NOT NULL, source only self_reported; direct authenticated INSERT allowed with owner/entitlement check. Keep legacy identity and score semantics.

## Approved upgrade contracts — CP1 local implementation, not deployed

- Question Version: stable question identity + immutable published version/content/scoring/key/options/media/status/actor/time. Pin start-time version/order. Only ADMIN reads keys; learner receives type-specific allowlist. Rollback creates new version.
- Submission: learning_attempts remains sole lightweight attempt history with official discriminator and public score envelope. submission_details owns draft revision, pinned assignment/start/deadline/duration/timeout/status. Server validates HSK/HSKK scope, STUDENT and existing entitlement. Retake new record; submit idempotent.
- Submission Answer: child of attempt, unique question slot/version; owner draft mutation via guarded command, frozen after submit; version reference/snapshot sufficient to reconstruct what student saw.
- Grade: private draft/revisions with raw/max/normalized score and rubric breakdown; published immutable snapshot contains only permitted scores/feedback. Server scoring only for objective types. Regrade explicit/audited, no automatic historical rewrite. Parent readable score remains null before first publish; old published result remains while newer draft is edited.
- Rubric: separate translation/writing/speaking criteria/weights/descriptions, immutable versions pinned to grading; no generic one-size rubric.
- Recording (CP2): per answer/version/owner, upload/processing/provider object metadata, uploaded_at/expires_at (7 days), state, heard actor/time. Private delivery; cleanup retains DB/history/grade/audit and deletes file generations safely.
- Student Status: learning lifecycle belongs to enrollment/course, not a substitute for profile approval/security status. Active grants remain existing entitlement owner.
- Graduation: versioned completion requirements evaluate published official attempts only; completed distinct from ADMIN-confirmed graduated; persist actor/time/audit snapshot.
- Certificate (CP3): DB-safe ID, immutable person/course/graduation/template/output snapshots, issued/reissued/revoked events; public verification projection only after separate privacy approval.

Full model, migration order, consumer list, rollback and gates: ASSIGNMENT_UPGRADE_PLAN.md. No proposed names here should be queried as existing production tables.

Implementation names: assignment_rubric_versions, assignment_question_versions, assignment_versions, assignment_version_questions, lesson_assignments, submission_details, submission_answers, submission_results, submission_grades. Feedback belongs to each versioned submission_grade, not learning_attempts. official_learning_results is the ADMIN rule-evaluation view; source self_reported is excluded. Learners use assignment_command allowlists, not direct detail SELECT. Raw content getter preserves legacy lessons; protected_at never clears after official activation. Exact API/schema/RLS/backup/rollback: docs/assignment-migrations.md. Production execution requires the user's post-backup checkpoint confirmation.
