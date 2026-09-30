# CP2 + document import migration delta / rollback

These **new additive migrations are now applied**. Their source files, as well as previously applied CP1/authoring files, are immutable. No db push/reset/repair or historical data drop. Read the exact SQL files for every statement:

1. `20260930151008_speaking_private_pipeline.sql`
2. `20260930173505_document_exam_import.sql`

Production registry: `20260930194254_speaking_private_pipeline` then `20260930194302_document_exam_import`, applied after compatible production API/native health verification on 2026-10-01 Bangkok. Supabase assigns the hosted timestamp; do not repair history to match source filenames. Future fixes require a new migration.

## Schema delta

No columns or constraints on existing courses, profiles, enrollments, lesson access, learning_attempts or lesson_assets are altered. learning_attempts remains lightweight. There is no data backfill or automatic activation/grade promotion. Fresh preflight: courses2, lessons24, profiles2, enrollments4, access26, attempts3, assets36; official question/version/submission/grade entities0.

New private tables in `account_internal`:

| Table | Columns and constraints |
|---|---|
| speaking_settings | id boolean PK/check true; enabled false; verified_at; enabled requires verified_at |
| speaking_recordings | UUID id PK; attempt_id + question_version_id composite FK to submission_answers; owner_id FK profiles; request_id and UNIQUE(owner_id,request_id); raw SHA256/1..8MiB/MIME allowlist, created_at/upload_deadline/confirmed raw timestamp/object id; conversion status and validated MP3 SHA/1..3MiB/duration <=360.15; Drive status/id; uploaded_at/expires_at; cleanup status/cleaned_at; retry_count/error_code/next_attempt_at/lease_id/lease_until |
| speaking_events | bigint identity PK; recording_id FK recordings; event/actor/created_at/details; append-only |
| assignment_context_versions | UUID PK; lesson FK; title1..200/content1..50000; source_identifier; created_by FK profiles; created_at; immutable |
| assignment_question_contexts | question_version_id PK/FK question versions; context_version_id FK context versions; immutable, matching lesson and draft-only insert |
| assignment_definition_contexts | composite PK(assignment_version_id,context_version_id), both FKs; immutable, matching lesson and draft-only insert |
| document_exam_imports | request UUID PK; actor FK profiles/lesson FK; payload_hash; source_kind document/manual; SHA required only for document; filename; definition FK; response; created_at; immutable request/response ledger |

Recording checks require conversion completed iff validated fields present, Drive completed iff uploaded_at/expires_at present, expires_at exactly successful uploaded_at +7 days with a converted identified object, cleanup completed iff cleaned_at present, and no cleanup before expiry exists. Final raw/object identity, conversion identity, Drive ID, archival timestamps and cleanup completion are immutable.

Indexes: speaking_attempt_idx, speaking_work_idx (pending archive), speaking_expiry_idx (pending cleanup), speaking_event_recording_idx, question_context_context_idx. PK/UNIQUE indexes are created implicitly. No new index on old learning_attempts.

Triggers: speaking_identity, speaking_event_immutable; context_versions_immutable, question_context_immutable, definition_context_immutable, document_import_immutable; question_context_insert_guard, definition_context_insert_guard; derived_question_context on the existing source metadata table copies the immutable parent context into a derived draft version. Old trigger definitions stay unchanged.

## RLS / RPC matrix

All seven new private tables: RLS enabled, no client policies; revoke table ALL from PUBLIC/anon/authenticated. No direct client access including Admin; use guarded commands. Existing table grants/policies remain. Private bucket `speaking-private`, public=false, 8MiB, MIME allowlist. Two additional Storage policies only:

| Operation | anonymous | student A | student B | Admin | worker |
|---|---|---|---|---|---|
| INSERT raw | denied | own live reservation, draft+entitled+deadline+gate | own only | no student upload | service role |
| UPDATE/DELETE Storage | denied | denied | denied | denied | guarded worker |
| GET raw | denied | own entitled recording before expiry | cannot get A | denied | service role |
| GET MP3 | denied | own bound completed recording before expiry | cannot get A | bound completed submitted recording | service role |
| sign/list recording paths | denied | denied | denied | denied | not used for playback |
| parser/import | denied | denied | denied | approved Admin only | not applicable |
| keys/draft grade | denied | denied | denied | existing authorized grading | worker never grades |

Storage policies: `speaking_insert_reserved` and `speaking_read_authorized`. Read is restricted using actual hosted `storage.allow_any_operation` names object.get_authenticated and object.get_authenticated_info, excluding sign/list. No public bucket or long-lived signed URLs.

| Function | Security / permission |
|---|---|
| public.recording_command | INVOKER wrapper; authenticated EXECUTE; routes to guarded internal command |
| account_internal.recording_command | DEFINER, search_path='', validates auth.uid/owner/access/deadline/immutable attempt+question and Admin submitted playback |
| account_internal.speaking_object_allowed | DEFINER, search_path='', authenticated EXECUTE only; explicitly checks Auth/owner/Admin/access/state/expiry/exact path |
| public.recording_worker | INVOKER wrapper; EXECUTE only service_role |
| account_internal.recording_worker | DEFINER, search_path='', EXECUTE only service_role, explicit current role check, bounded payload, lease/stale checks and fixed operations |
| speaking_immutable, speaking_event, speaking_enabled, speaking_check_answer | INVOKER, search_path='', EXECUTE revoked from client roles; used within privileged guarded dispatcher/trigger |
| public.document_exam_import | INVOKER wrapper; authenticated EXECUTE |
| account_internal.document_exam_import | DEFINER, search_path='', approved Admin required, bounded payload, atomic version creation/order/provenance/idempotence |
| account_internal.assignment_context_command | DEFINER, search_path='', authenticated EXECUTE; original dispatcher performs explicit role/action checks before context augmentation |
| context_membership_guard, inherit_question_context | INVOKER, search_path='', client EXECUTE revoked; triggers enforce immutable lesson/version membership |

Replaced existing definitions (new migration, not edited old migration): internal assignment_command (Speaking reference/start/enable/publish/grading/regrade guards only), assignment_question_projection (context reference), assignment_read (contexts once, published-only learner result), public assignment_command (INVOKER routes through guarded context wrapper). Existing implicit INVOKER status for read/projection stays. No frontend permission checks are treated as authority. Explicit REVOKE removes default PUBLIC EXECUTE on new privileged/helpers, narrowly grants authenticated/service_role as listed. Service role schema usage added only for account_internal.

## Recovery evidence before migration

Existing user-approved local full backup: `.cache/backups/assignment-before-20260930.json`; SHA256 `3d34e12f952fd43aedd823ac76ad7ff4adc35e92e5ffb218e693bfa7f528d104`; original snapshot 2026-09-30 18:30:42 Bangkok. Seven requested tables plus audit_logs12, readable and ignored/untracked. It is a pre-CP1 data snapshot, not a new full production snapshot.

Fresh **schema recovery supplement** captured 2026-09-30T18:43:56.491408Z (2026-10-01 01:43:56 Bangkok): `.cache/backups/speaking-document-schema-before-20261001.json`; SHA256 `a791ed0243d6570d0e5c1b11371a311550c7cb651d6460232db6c5899b1f0dce`; four replaced function DDL/owners/ACL, existing Storage policies, current aggregate record counts. JSON read-back and ignore checks passed. No table row values exported into this supplement; original full data backup retained. No media/Auth/Google/Vault secrets are included. The attempted fresh full-row export was rejected by automatic approval review for external disclosure risk; this safer supplement contains only metadata/counts. Official entities are currently empty and these migrations do not mutate existing data.

## Rollout and rollback

Deploy compatible disabled loader/API -> verify hosted parser/Admin native runtime -> apply only the two new migrations sequentially -> inspect registry/grants/policies/search_path -> synthetic rollback-only schema/RPC smoke -> verify Admin/student regression. Keep speaking_settings=false, no real course activation and no scheduler until credential checkpoint and real synthetic Storage/Drive/cleanup smoke pass.

Rollback: gate off new Speaking starts, suspend new archival jobs, preserve readonly playback/history and required expiry cleanup. Disable document-import UI if its RPC has a defect. Restore old function definitions from the local supplement only if no new data depends on context/recording behavior; otherwise forward-fix through a new additive migration. Never drop/reset/delete existing learners/attempts/versions/grades/audit. No automatic media deletion or public grants to recover a failed archive. Production synthetic fixtures live only inside a rolled-back transaction; no auth.users mutation or real student submissions as fixtures.

Local verification: full133 tests, lint/build/validate, synthetic real MP3 and private Drive mock, PostgreSQL A/B/anon/Admin/worker, retention/retry/race/history, PDF/DOCX/extraction/idempotence/context, browser390/768/1366. Exact CI source698ccb5: Actions36764537430/36764537552 SUCCESS, Linux native runtime179,988,843 bytes and real MP3 PASS.

## Hosted verification and remaining gate

PR25 merged311c7f06b7c361f4f65bcecdc12e499495131059. Production Vercel68Fw1GnKxYeLJE2w8bHNuoEu5yQX READY. Real approved Admin native health converted/probed/decoded synthetic MP3 in232ms **before** migration. Actual authenticated PDF10 and DOCX10 parser calls returned ten editable questions, preserved Hanzi/pinyin/Vietnamese and the supplied keys. No preview was committed as a real exam.

The rollback-only production SQL smoke passed anonymous RPC denial, two nonadmin authenticated contexts, worker/private-table/authoring/grade/publish denial, Admin atomic document import/replay conflict/preview/publish, immutable shared contexts and derived question versions, failure atomicity, private bucket and disabled gate. Both nonadmin UUIDs intentionally have no profiles: this proves the nonadmin permission boundary, **not** full approved/enrolled student A/B owner isolation or real Storage HTTP upload/playback. Those remain in the credential-dependent synthetic E2E gate. No auth.users mutation or real student fixture.

After rollback: courses2, lessons24, profiles2, enrollments4, access26, attempts3, assets36, audit12; official questions/definitions/submissions/imports/contexts/recordings/events and synthetic courses/lessons0. All seven new private tables have RLS enabled and no client policies/privileges. Hosted Storage has only the original lesson-private SELECT plus the two intended Speaking INSERT/SELECT policies; all new definers have empty search_path and explicit role/identity checks. Supabase default privileges also grant service_role EXECUTE on public INVOKER wrappers; nonworker internal definers do not grant service_role EXECUTE. This does not create a client bypass.

Seven affected client modules/CSS match the exact Git source on Vercel and Pages. Backup/server/secret paths404 on both hosts; anonymous recording health and exam-parser POST401. Security advisor adds only intentional private no-policy INFO; the pre-existing Auth leaked-password-protection warning remains outside this rollout, with no Auth change.

Evidence is local and ignored: `.cache/cp2-production-verification.json`, `.cache/cp2-release-verification.json`, `.cache/cp2-production-smoke.sql`. Speaking gate remains false. Real owner JWT isolation, Storage -> MP3 -> Drive -> cleanup/history smoke and scheduler activation are **pending**, not production PASS. No Drive credential or scheduler/Vault secret was configured.
