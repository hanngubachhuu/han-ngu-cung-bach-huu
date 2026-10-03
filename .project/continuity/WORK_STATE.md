# WORK STATE — HÁN NGỮ CÙNG BÁCH HỮU

## Full hosted submission and completion-screen fix — 2026-10-04

- Real BachHuu test `cb7fa9fa-362c-432d-9aca-7ad9035f36da` received and submitted **27/27** at `2026-10-03T18:29:14.901826Z`, including Q26/Q27. Human feedback explicitly confirms clear audio, working microphone and automatic advancement. Result revision 1 is draft, not published by the agent.
- The human screenshot exposes a remaining completion UI defect: after successful automatic submission the timed CBT shell and microphone monitor remain active. The new renderer releases microphone tracks, analyser/context, audio, timer, online listener and journal after server-confirmed submission, then automatically replaces the exam workspace with a submission confirmation and links to account submission history/HSKK. Pending/failed uploads keep the exam recovery flow. Reopening a submitted exam does not record or submit again; unavailable result lookup cannot hide a successful receipt.
- Regression reproduced RED against the old build (microphone track still live), then PASS at 390/768/1366 px: all 27 delayed prompt clips start from zero, 27 recordings, one submission, every microphone track ended, exam shell/skin removed, history link present, submitted recovery without another submission, and safe result-fetch failure. Targeted 24 engine/media/microphone tests PASS; lint PASS. Full 238-test suite and both CI workflows already PASS for general makeup commit `2db4b1a`; exact completion-fix CI/rollout are pending.
- Admin now displays **Đã nhận trên hệ thống** independently of the secondary grading/publication state. Draft attempts remain **Đang làm**. This changes presentation, not submission or score state.
- General Admin makeup migration applied as production `20261003183857 / assignment_admin_makeup`. Before/after row hashes, counts, Storage policies, original source/authoring, enrollments/access, both session histories, submissions/results/grades all match exactly. Speaking remains false; cron jobs zero. Application rollout remains pending the completion-fix CI.
- Clarification: the original recovered attempt was submitted 27/27 at `17:52:08.881719Z`; the human Admin subsequently published its result at `18:06:16.972882Z`. That human publication supersedes the earlier snapshot saying its result was still private. The agent did not publish, grade or alter that result.

Next: deploy the exact tested completion-fix application after CI, verify hosted Admin receipt/makeup controls and real recording playback, and obtain fresh real-Student privacy/completion evidence. Preserve all original source/history, no more test attempts, no automatic result publication, Speaking/scheduler off.

## Hosted makeup recovery and general Admin authority — 2026-10-04

- VERIFIED: the original blocking production trigger rejected Q26/Q27 binding after the original deadline (`SUBMISSION_LOCKED`) although both real new recordings had already reached private Storage. Forward hotfix `f0b62dd` passed both CI workflows and was applied as `20261003175113 / hskk_makeup_history_guard`; the real Student tab retried the same references and successfully submitted.
- VERIFIED hosted receipt: old attempt `ba99f979-a21e-4555-86ac-7fda9d8802e3` is **submitted, 27/27**, actual late receipt `2026-10-03T17:52:08.881719Z`. Frozen 25 accepted answers match exactly. Original source, pinned version, session and deadlines were preserved. Only Q26/Q27 were supplemented. Result revision 1 remains private, pending teacher review. The real Admin screen shows both recordings and the actual makeup receipt; screenshot `test-results/hskk/makeup-hosted-received.png` is local evidence. Do not label this as a new full on-time E2E test.
- Latest direct human instruction: Admin may authorize makeup for **any exam or lesson**. Shared support covers every official submission, all supported written formats and speaking, on its original pinned version. A four-hour immutable Admin window freezes only server-missing answers and preserves received answers and prior published result/grade rows. Completing makeup creates a separate unpublished grading revision and accurate receipt; it never republishes a result or backdates an original submission. Timed HSKK retains its pinned response timing and private prompt authorization.
- Implementation under validation: `20261003173842_assignment_admin_makeup.sql`, shared Admin submission control and Student missing-only recovery. Generic private tables are inaccessible directly; original Storage policy function OID is retained, authorized recovery writes stay narrowly scoped, Student replay/enumeration remain denied. Generic production migration and rollout are **PENDING**, not hosted PASS.
- Local evidence: final 238/238 tests, lint, full build and validators PASS, including the Student-history-link addition; all seven targeted recovery tests pass. Exact-commit CI is pending. New recovery browser regression passes at 390/768/1366 px with same-request reload/retry and one submission, plus existing assignment/HSKK recovery browser checks. These are synthetic/local evidence.
- One separate real full test is ACTIVE: BachHuu confirmed starting; attempt `cb7fa9fa-362c-432d-9aca-7ad9035f36da`, started `2026-10-03T18:10:39.313634Z`, deadline `18:29:07.086634Z`; latest observed 24/27, draft. Keep application `32b6fd9` during the real test; do not interrupt the Student tab or create another attempt. Speaking false; scheduler zero.

Exact next action: finish final generic makeup checks/CI, wait for the real normal test to finish, then apply the tested forward generic migration and deploy the exact tested application. Verify real Admin control and hosted privacy. Inspect the actual full-test submission and private Admin playback; do not publish grades or enable Speaking/scheduler. Preserve untracked docs/speaking-pilot-preflight.md.

## Active H71002 hosted E2E checkpoint — 2026-10-03

- Latest human decision: permit a separately Admin-opened, bounded makeup window for server-missing questions; if retained audio is absent, allow a new recording ONLY for those missing questions. This supersedes the earlier blanket no-rerecord/history-write restriction for that narrowly audited recovery. Keep original session/timeline/deadlines and all already accepted answer/recording rows unchanged; append recovery records, bind only missing answers, record actual late submission timestamp, and never pretend it was an on-time original submission. The one NEW full E2E test remains separate and not yet started.
- Current verified rollout (2026-10-04 local): application `32b6fd9`, both CI workflows PASS, 234/234 local tests plus lint/build/validators and three-width browser regressions PASS. Production deployment `dpl_J2Sa5Jy9jQtE3ALVSDGxSRGiUm9g` READY; six live assets match the build. Migrations applied as `20261003171309` controlled-test and `20261003171323` missing-question makeup. Storage policies and all old row hashes remain unchanged; Speaking false, cron zero.
- Real Admin opened old-attempt makeup window `90d2f4b5-a0e8-4eea-b2c5-3945da590c90` exactly Q26/Q27, preserving 25 accepted answers; expiry `2026-10-03T21:17:30.438481Z` (04:17 October 4 Vietnam). Real Admin also authorized the single separate new full-test preflight `cb7fa9fa-362c-432d-9aca-7ad9035f36da`. Only immutable opening/audit rows and one preflight were added; original attempt is still draft 25/27, no new actual session or recording created.
- Next human action: BachHuu opens the old attempt with `makeup=1`, reuses retained bytes or records only Q26/Q27, and legitimately submits. Verify actual server receipt and private Admin playback; stop on any failure. Then verify the separate normal full hosted test; neither checkpoint is PASS from synthetic evidence. Details and exact link in docs/hskk-h71002-checkpoint.md. Student action requested asynchronously; no JWT needed.

- User accepts the CBT interface at application commit 31cbbc5 / documentation eb5ac48; no redesign in this phase.
- The user explicitly selects BachHuu and authorizes one NEW controlled test attempt. The old draft attempt ba99f979-a21e-4555-86ac-7fda9d8802e3 remains historical evidence, with 25 uploaded/bound recordings and expired deadline. Its original timing and received answers stay immutable; only the separately audited, explicitly authorized missing-question makeup may fill Q26/Q27 and submit at the actual late receipt time.
- Verified live baseline: one HSKK preflight/session, active published H71002 version 0b3d1a53-c3d0-4d5c-a55f-3fa60ed4ccb4, authoring revision 159, Speaking false, cron zero. The current unique(owner_id,assignment_version_id) preflight slot prevents a second attempt for BachHuu.
- Required smallest prerequisite: an approved Admin may authorize one separately audited controlled H71002 test preflight for an already entitled Student, preserving the existing version and every historic row. Keep the normal Student access/preflight/countdown path; do not create session/recording/submission rows directly.
- Dependencies/verification: guarded session load, Admin authorization, current published version and existing entitlement, serialized/idempotent one-test authorization, immutable history, no future prompt or Student playback exposure; targeted SQL/API tests, full 226+ tests, browser regressions, lint/build/validators/CI before deployment/migration. Scoped row hashes/counts/functions/constraints are saved in ignored test-results/hskk/real-e2e-before-controlled-attempt.json before any mutation.
- Next: implement/verify the controlled test authorization, then use the real Student browser and human microphone for one complete hosted attempt; STOP and report the exact step if it fails. No synthetic fixture may prove hosted E2E. Grade workspace may be inspected; do not publish test results or enable Speaking/scheduler.

## Snapshot

- Status: ACTIVE
- Last updated: 2026-09-28
- Current phase: REPOSITORY RECONCILIATION REQUIRED
- Current task: Phiên làm việc tiếp theo phải thực hiện một lần Repository Reconciliation đầy đủ trước khi sửa application.
- Continuity confidence: MEDIUM

## Repository baseline at installation

- Repository: hanngubachhuu/han-ngu-cung-bach-huu
- Source branch: main
- Latest source commit inspected before continuity install: f0ae3823fbda08d7c0c4bd189ed7e0d8044162ae
- Root structure observed: static HTML pages, data/, study/, server/, api/, supabase/, scripts/, tests/, admin/, audio/, sources/, and documentation/config files.
- package.json observed: Node 24.x, ESM, esbuild; build/test/lint/validate/browser-test scripts.
- Architecture docs observed: main is source, gh-pages is artifact; Vercel + Supabase are part of the current application/backend architecture.
- Current lesson/data files observed: data/lesson-manifest.js and data/lesson-registry.js.

## Last verified success

- What works: Repository is reachable and current main branch can be inspected. The continuity layer has been prepared for installation.
- Verification: GitHub repository metadata, root listing, recent commit history, package.json, ARCHITECTURE.md, SECURITY_ARCHITECTURE.md, vercel.json, lesson registry and manifest inspected.
- Evidence: commit f0ae3823fbda08d7c0c4bd189ed7e0d8044162ae and current main artifacts.

## Current unfinished state

- Symptom: continuity state has not yet been reconciled end-to-end with runtime/database/deployment evidence.
- Expected: WORK_STATE should describe the actual current architecture, lesson access model, public/private build, Supabase schema/RLS, Google Docs sync path, and deployment state.
- Actual: several high-level facts are known, but exact runtime contracts remain partially unverified.
- Scope: repository baseline only.

## Signals that MUST be resolved in reconciliation

1. lesson-registry.js reports SCHEMA_VERSION = 1 while its content preparation/validation follows the newer content structure. Determine the actual canonical schema contract and migration boundary.
2. Security architecture says lessons from bài 4 onward are private. The observed manifest gives hsk1_bai4 a student visibility flag, but hsk1_bai5... also have data paths without the same flag. Determine whether visibility is controlled elsewhere and inspect the produced public artifact before calling this a bug.
3. Some architecture/security documentation contains older pilot/deployment statements that may be stale relative to the latest merged commits. Classify each as VERIFIED, STALE, or CONTRADICTED.
4. Current Supabase schema and RLS must be inspected rather than inferred.
5. Current Google Docs sync implementation and actual error/verification path must be inspected rather than inferred.
6. Current deployment status must be checked from workflow/deployment evidence.

## Exact next action

1. File/system: repository + deployment + Supabase-related project structure.
2. Action: Execute .project/continuity/RECONCILIATION_PLAN.md from start to finish. Produce .project/continuity/RECONCILIATION_REPORT.md and update this file with verified facts, conflicts and one safe next action.
3. Expected: a verified baseline with evidence and no unresolved ambiguity about the current working architecture.
4. Stop condition: if any R3/R4 boundary remains contradictory, stop broad changes and leave a precise discrepancy-focused next action.

## Files protected during reconciliation

- application source code
- lesson content
- Supabase data/schema/RLS
- private/public asset boundaries
- approved UI/navigation/footer structure
- deployment configuration

Continuity documents may be updated. Product behavior should not.

## Known failed attempts

- None in this continuity installation.
- Historical debugging paths exist in prior conversations but are not safe to classify without current artifact verification.

## Handoff

A new session should continue by:

> Read this WORK_STATE, read SKILL.md and RECONCILIATION_PLAN.md, then perform Repository Reconciliation before changing any application code. Use evidence from current repository/runtime/deployment/database where available. Update the report and this state file. Do not ask Bách to restate the project history.

## Resume checksum

- Current task: Repository Reconciliation
- Next action: execute RECONCILIATION_PLAN.md
- Critical files: ARCHITECTURE.md, CODE_RULES.md, SECURITY_ARCHITECTURE.md, package.json, data/lesson-manifest.js, data/lesson-registry.js, workflow files, supabase/
- Critical constraint: reconcile first; remediate later; never invent schema/access rules

## Checkpoint 2026-09-30 — incident email confirmation

This checkpoint supersedes only the incident/runtime portions of the bootstrap above. Full repository reconciliation remains REQUIRED before unrelated or broad application changes. The small auth fix was already in progress when the newly installed continuity files were discovered on origin/main; no lesson/schema/RLS changes were made in this checkpoint.

- Current task: finish release PR #21, then verify deployed account modules against the merged Git commit on Vercel and Pages.
- Source fix: 13631fb1b9d7de996d3b869fce5a45414102e923; branch fix/email-confirmation-recovery. Includes inline confirmation guidance, persistent 60-second resend cooldown, safe expired callback messages, automated tests, and Vietnamese email template.
- VERIFIED V3: Supabase confirmation template subject/body saved and reloaded on 2026-09-30. Exact subject: Xác nhận tài khoản | Hán Ngữ Cùng Bách Hữu. ConfirmationURL provider placeholder preserved. Local proof: test-results/confirmation-template-saved.png (ignored).
- VERIFIED V3: incident account email confirmed; last_sign_in_at 2026-09-28 13:26:45Z. Do not repeat the earlier user-approved manual confirmation or disable confirmation globally. No private student identifiers stored here.
- VERIFIED V4 before PR21: production admin UI confirms ADMIN and Google connection to the configured owner. This proves current connection, not every sync scenario or refresh-token durability.
- VERIFIED V2: 51 tests pass; lint, build, validate:study and scripts/check-account-browser.mjs pass. Browser tests are isolated mocks, send no real emails. Mobile confirmation panel inspected at 390px with no horizontal overflow.
- Mail delivery: earlier provider/Gmail Sent evidence showed dispatch, not Inbox receipt. Root cause of missing recipient mail remains UNKNOWN; Vietnamese copy and recovery guidance reduce friction, not a delivery guarantee.
- Known failed test attempts: mocked auth error omitted error_code; fixed mock to match provider. Navigating only hash did not reload page; test now navigates via about:blank to emulate incoming email navigation. No application workaround added for these test defects.
- Tool environment: bundled Git requires GIT_EXEC_PATH pointing to dependencies/native/git/mingw64/bin for HTTPS helper; push requires network escalation. Local browser tests use BROWSER_EXECUTABLE pointing to installed Chrome because the Playwright browser binary is absent.
- Protected: existing lessons, canonical data, grants, role rules, Google field mapping, SMTP credentials, private build exclusions.
- Exact next action: inspect PR21 CI; merge only passing source; verify live hashes and Google admin status after deployment. Then finish RECONCILIATION_PLAN.md as a read-only audit and classify remaining schema/visibility/documentation uncertainties. Do not call the entire reconciliation complete from these scoped checks.

## Release verified 2026-09-30 13:14 Asia/Bangkok

- PR #21 merged: c9908cf1d84483132149e61b6fbab76207de889d. Final PR CI run 36676877902 SUCCESS; production deploy workflow 36677068229 SUCCESS.
- V4: account-ui.mjs, account-core.mjs, account.css match the merged commit byte hashes on both Vercel and Pages. Sample private lesson source/audio URLs return 404 on both hosts. Evidence: .cache/email-recovery-release-verification.json (local ignored report).
- V4: expired confirmation callback on live Pages displays Vietnamese guidance and resend controls. Screenshot: test-results/confirmation-live.png. Supabase Vietnamese template persisted after reload.
- V3: read-only transaction with the incident student's authenticated role/sub sees exactly hsk2_bai5_jiu and hsk2_bai6_zenme. Transaction rolled back, no grants modified.
- V4: production ADMIN and owner Google connection verified after reload of the new deployment. Existing owner Doc preview reads all three mapped fields successfully; no writes needed or performed in this check.
- Local checkout recovered after bundled Git failed unlink operations during branch switch: reset index to fetched origin/main and restored only the three known overwritten/missing tracked files from HEAD. Clean git status verified, no user work discarded.
- Incident recovery release COMPLETE; no further owner setup needed for this release. Deliverability root cause remains UNKNOWN and a fresh external-recipient Inbox test is not yet evidenced.
- Exact next action: perform the remaining full read-only RECONCILIATION_PLAN.md audit before new broad features. Classify registry schema-version and manifest visibility discrepancies using build/runtime evidence, inspect current DB policies, and replace bootstrap report with verified facts. Preserve deployed auth, grants, content and sync mapping. Do not repeat manual confirmation, SMTP setup, OAuth setup, or already-passing tests without a new reason.

## Checkpoint 2026-09-30 — assignment platform reconciliation (supersedes bootstrap task)

- Status: AWAITING USER ARCHITECTURE APPROVAL CP1. Phase 1 baseline completed with explicit limits, phases 2–10 not implemented.
- User request: complete assignment/grading/question versions/speaking/student management/graduation/certificate upgrade. New restriction: auto-grade only HSK/HSKK pathway assignments submitted by student accounts; open answers remain manual, no AI grading.
- Baseline: main 91b58c97a2461e0a7c71dc0a0d09e109af452601. Full report: RECONCILIATION_REPORT.md. Reviewable architecture delta/migration/rollback/checkpoints: ASSIGNMENT_UPGRADE_PLAN.md.
- Live verified: tables/policies/core functions/constraints/storage. 24 lessons, 36 assets, 26 grants, 2 profiles, 4 enrollments, 3 self_reported attempts. HSKK not enrolled in DB; current course/lesson uniqueness is HSK-only. No official versions/grades/recording/certificate entities.
- Important: existing account_save_attempt and direct INSERT are self-reported; official rows need a separate protected command contract in the SAME attempt history. Current authorized lesson payload contains keys, so official mode needs learner projection and raw-content access closure, not merely hidden UI.
- V1: 51/51 tests; lint/build/validate pass. V2: account responsive and 23 private lesson engine browser checks pass with mocked providers. V4 scoped: deployed account/attempt modules match Git bytes on both hosts; private source/audio samples 404; Vercel unauth account API 401. Live DB write-based RLS and new feature E2E not performed.
- Source-manifest privacy discrepancy explained by private-publication build; schema version constants are not one canonical runtime schema. Live shapes v2/v5/flat/wrapped must stay compatible. Migration history has 33 live entries vs 14 local files; no blind db push/reset/repair.
- Changes this checkpoint: continuity documentation only (report, plan, state, contract, decisions, bugs and handoff). No application code, migration, production data/RLS, OAuth, storage or deployment mutation.
- Failed checks: validator started before build completion; rerun after successful build passed. Initial network EACCES resolved through approved read-only escalation. Supabase reviewer quota failure resolved after user continuation/reviewed retry. apply_patch rejected replacement with delete+add same path atomically; no partial edit; ordinary file write succeeded.
- Protected: existing IDs/enrollments/grants, historical scores, lesson content, owner SMTP/Docs OAuth, public/private learning assets, unrelated practice tools. Public repo remains public; new confidential keys must not be committed there.
- Exact next action: obtain CP1 decision on ASSIGNMENT_UPGRADE_PLAN.md. If approved, recheck working tree/live preconditions, reconcile needed migration dependencies, implement incremental course/attempt/question-version/RLS foundation with local PostgreSQL tests before deployment. Stop before CP2 audio infrastructure/credentials or CP3 public verification; CP1 does not authorize either.

## Checkpoint 1 APPROVED — 2026-09-30 refinement

User explicitly approved CP1 implementation with three binding constraints: learning_attempts remains lightweight history/progress; submission/detail/answers/version references/grading/feedback/rubrics are linked entities. Preserve self_reported byte-for-byte and never use it for completion/graduation/certificates. Used question versions and submitted answers immutable; unpublished grades and keys private; explicit audited regrade only. HSK/HSKK reuse existing enrollment. Before production migration present exact migration files, schema/RLS delta, backfill, existing-data impact, rollback and test plan. Do not change previously applied migrations or delete current data. Local implementation/testing is now authorized; no need to request CP1 again. CP2/CP3 remain unapproved.

## Post-backup migration checkpoint — 2026-09-30 18:34 Asia/Bangkok

- Status: LOCAL FOUNDATION IMPLEMENTED; BACKUP+RESTORE VERIFIED; WAITING FOR EXPLICIT POST-BACKUP MIGRATION CONFIRMATION. User now explicitly requires stopping after backup, before production migration. This supersedes any earlier broad permission to migrate. No production DDL/data/RLS/storage or deployment mutation this milestone.
- Branch: feat/official-assignment-foundation, baseline 91b58c97. 3 NEW migrations: 20260930074239 model, 20260930074240 commands, 20260930074242 legacy boundary. Old production migrations untouched. Exact package: docs/assignment-migrations.md.
- Local model: lightweight learning_attempts + 9 linked tables, existing enrollment HSK/HSKK; private keys/draft grades; immutable versions/submission/publications; audited explicit regrade; server timers/objective score; manual rubrics; preview/publish/enable; student/admin UI. Speaking activation blocked pending CP2. Full editor/import/lifecycle/graduation/certificates remain unfinished.
- V1: 72 tests pass; lint/build/validate pass (rerun after final local edits before handoff). V2: assignment student/admin browser including offline recovery/publication/regrade + 390/768/1366px; account responsive and 23 legacy private engines pass with mocked providers. No hosted new-feature E2E/physical-device claim.
- Production preflight read-only: 2 profiles,4 enrollments,26 grants,24 lessons,3 legacy attempts; original history hash 70baf5db371f37eea4b88b5154a2b200. No NULL course IDs or uniqueness collision. New tables absent.
- User explicitly authorized local sensitive backup at .cache/backups/assignment-before-20260930.json, no Git/push and no secrets. Snapshot 18:30:42; file created18:31:21. Seven requested tables complete +audit_logs12 to retain ledger. counts courses2/lessons24/profiles2/enrollments4/grants26/attempts3/assets36/audit12.
- V1 data restore: script check-assignment-restore.mjs restored actual backup into local PostgreSQL WASM; all table rows preserved after 3 migrations, enrollment scope preserved, direct content read denied, legacy getter compatible, activation0. Integrity validator confirms JSON/relations/0 secret candidates/Git ignored+untracked. SHA256 3d34e12f952fd43aedd823ac76ad7ff4adc35e92e5ffb218e693bfa7f528d104. Reports only under ignored .cache/backups. This is a targeted data/schema backup, not full Auth/storage/Google recovery; no credentials or media files exported.
- Initial full-table export was rejected by automatic review for absent payload/destination permission. User explicitly approved exact destination/data; subsequent reviewed export succeeded. JSON parser initially matched wrapper prose; required newline delimiter fixed it; no malformed backup written and no production modifications. Shared INSERT trigger needed nested table-specific IF to avoid nonexistent record field resolution; fixed/tested. All failed approaches recorded, not open runtime defects.
- Exact next action: present docs/assignment-migrations.md plus backup counts/schema/RLS/backfill/rollback, then STOP awaiting explicit checkpoint confirmation. Do not apply migrations or deploy/activate a pilot before that reply. After confirmation recheck fresh preflight+backup validity, ship compatible RPC loader to BOTH hosts first, apply only the 3 new migrations sequentially and verify postflight/advisors; preserve history and keep activation opt-in. Do not blindly push/reset/repair the 33-vs-14 migration history. CP2/CP3 remain separate.

## Editor release VERIFIED 30/09/2026 20:14 Bangkok — current checkpoint

- PR #23 merged: fcc22f24ec86292cca2282aa032c2d422bb35600. CI 36719544169 SUCCESS; deploy 36719986636 SUCCESS; Pages 36720096488 SUCCESS.
- V4: loader/account service/student/Admin/editor bytes match source 58e46af3055db3136432bdbf07d8d748d08f352b on Vercel and Pages. Live signed-in Admin bank renders the new cross-page selection/order section through real API. No questions imported or lessons activated.
- Source SQL checksums match actual statements in production migration registry for all three entries. Original data hashes unchanged and fixtures gone. Evidence remains local ignored, no backup/PII committed.
- Editor milestone released: version edit/copy, cross-page selection/replacement/order, old definition reuse as new draft, ambiguity validation and controls locked during saves. Model/browser/76 tests/lint/build/validate/CI pass. Archive/provenance import is still not implemented; do not call full Phase4 complete.
- Exact next action: implement private provenance-aware import with dry-run validation and atomic/idempotent Admin write, plus archive metadata preserving used versions; review additive schema delta before applying further DDL. Three production migrations are immutable. Then pilot import only trusted canonical content, preview/publish/enable explicitly. CP2/CP3 and offline deadline sweeper remain pending; no Auth/Drive permission expansion silently.

## Production rollout VERIFIED 30/09/2026 — supersedes waiting gates

- Foundation PR #22 merged as 72f5520d81808bc965a330e8d0f8b86d073adf3c. CI and both-host release hashes pass before DDL.
- Three migrations applied sequentially; production registry versions: 20260930124349 model, 20260930124401 commands, 20260930124415 legacy boundary. Local files kept unchanged. No db push/reset/history repair.
- V3 production smoke PASS for DB roles/claims, ownership/private keys/draft grades/DML/RPC guards, synthetic draft/save/submit/version snapshot, manual rubric/preview/publish/regrade/audit, official eligibility excludes self_reported, legacy getter/forgery. All fixture rows and audits rolled back. No Auth mutation.
- Eight original tables retain exact counts and full old-column hashes. Official questions/submissions/activations remain 0. Course default HSK only. Evidence: ignored .cache/assignment-production-verification.json and assignment-gateway-smoke.json. Backup remains ignored/local.
- V4: anonymous REST denial 401/42501, Auth gateway 200; signed-in Admin account/dashboard/bank/Google status and legacy HSK1 content load verified in live Chrome after DDL. Existing signed-in session verified; no new password login or real student JWT submit. Student production DB wrapper/context test plus isolated browser UI flow; do not label this full two-account REST E2E.
- Security advisors: no new assignment finding; existing source-cache RLS/no-policy INFO and leaked-password protection WARN unchanged.
- Phase continuation: editor edit/copy creates versions, cross-page selection/order and definition restore as new draft implemented. No new DDL for editor. 76 tests and browser editor flow PASS; finish release/deployed verification before marking V4. No real content imported/activated.
- Remaining: provenance import/archive, background deadline sweeper, CP2 speaking/Drive cleanup, CP3 lifecycle/graduation/certificates/public verification. Those are not completed by foundation/editor release. Do not enable speaking or infer missing course content.
- Protected: three applied SQL files, original records/IDs/Auth, private answer key/result boundaries, HSK/HSKK shared enrollments; self_reported cannot determine official completion.
- Exact next action: release editor with CI and both-host hashes, then implement provenance-aware atomic private import before pilot activation. Keep legacy lesson content private and do not export backup into Git.

## Production rollout AUTHORIZED — historical authorization

User explicitly authorizes the three reported migrations in order and minimum production data/security/assignment/legacy/regression smoke tests, then phase continuation if PASS. Hosted discovery: only dmeqxdznzobbarvkmxyg project and no branches. User explicitly waives creating staging. Keep backup ignored/local, no production reset/drop/Auth changes. Deploy compatible loader to both hosts before migration3 closes raw access. Fresh read-only preflight 2026-09-30 19:26 Bangkok: courses2/lessons24, future uniqueness conflict0/null course0/missing course0/level mismatch0, self_reported3 and unchanged history hash70baf5db371f37eea4b88b5154a2b200. No new official entities yet. Smoke fixtures must be synthetic and transaction-rollback isolated; never overwrite current learner submissions or import sensitive backup into staging. Stop at a real failure, do not broaden features until fixed and validated.

## Distractor/import/archive checkpoint — current work 2026-09-30

- Direct user: foundation/editor accepted; do not re-audit PASS phases without actual regression. Complete actual generation first, then provenance import/archive, test/release before Speaking/MP3/Drive. Technical decisions autonomous; stop only at actual data/security/RLS/architecture/business problems. No new staging.
- Branch feat/assignment-distractor-import from main fcc22f2. Actual rule generator and new Admin import/archive flow implemented; private additive migration 20260930133835 (not the three already-applied files). Exact delta/rollout/rollback and limits: docs/assignment-authoring.md.
- Generator has four controlled MCQ contexts, 135 target contexts; semantic uniqueness/final-key validation runs on client AND DB, including omitted metadata through old RPC. Unsupported/freeform generation refuses rather than fabricates. Final choices saved in a new version; old question/submission/key/result rows unchanged.
- Import JSON only, source/identifier/revision/item, real DB actor/time, source lineage, atomic preview/commit, unchanged base-version check, request/content replay protection. Archive append-only/version-specific, reason/revision/audit, new membership guarded, old published definitions and pinned submissions preserved.
- Local scoped DB/generator/import/browser PASS, full suite93 PASS before adding exact smoke test (next CI94 expected), lint/build/validate PASS. Focused production smoke itself local10 tests PASS, all fixture rows/audits rolled back. Actual new production DDL not yet applied at this entry. Preflight new entities: questions0/definitions0/metadata absent; no existing source backfill needed.
- Exact next action: CI on immutable commit, apply only the new additive DDL with old Admin API compatibility, focused rollback-only production smoke/ACL/RLS/search_path verification, merge/deploy and real Admin UI/both-host byte verification. Record production registry timestamp separately, never repair migration history. Preserve local ignored backup and all existing data/Auth/grants.
- Remaining after this milestone: CP2 Speaking/MP3/Drive (prepare concrete plan before permission/credential expansion), background deadline sweeper, CP3 lifecycle/graduation/certificates/public verification. These are not completed by import/archive.

## Distractor/import/archive release VERIFIED — current checkpoint

- PR24 merged a8c15a3cb0efb9b8a739831ab63da2f3609ddb8f, source3b5bff9. CI36729758153 SUCCESS (94 tests + focused authoring browser); Deploy36730845712 and Pages36731040044 SUCCESS. Six changed/new modules byte-match Git on both hosts.
- New migration production registry20260930143823 assignment_authoring_provenance_archive, sourceMD5fe9d493e8849f26f005c484a8bbd07f6 matches local CLI-created20260930133835. This file is NOW APPLIED: immutable; fixes require a new migration. The older three applied SQL files remained unchanged.
- V3 scoped production smoke all3 PASS: new role/RPC/private metadata boundary, preview/atomic import/replay/source/final generator, archive/history/student projection. All synthetic rows/audits rolled back, no Auth mutation. Postflight questions/sources/requests/events/fixture course+lesson0. Private ACL/RLS/helper EXECUTE and all search_paths verified. Advisors private no-policy INFO intentional deny-direct-access; no new warning/error.
- V4 real Admin: new authoring bank and import history API loaded, generator number17 produced18/16/27 wrong choices with reasons. No actual question saved/imported or assignment enabled. No claim of two real student JWT browser sessions; role-context tests + isolated browsers are documented.
- User's two requested feature phases complete in the four safe generator contexts and JSON source-aware import/archive. Exact limits and evidence docs/assignment-authoring.md, local ignored .cache/assignment-authoring-production.json and assignment-authoring-release.json. Backup remains local ignored/untracked.
- Exact next action: CP2 approval for concrete docs/assignment-speaking-cp2.md before audio storage/Drive/server credential/scheduler expansion. This is the original project's explicit storage/Drive/security architecture checkpoint, not a repeat foundation audit or new staging requirement. No audio infrastructure mutation performed. After approval implement/local-test recording pipeline then present exact additive migration and rollback before production audio DDL. CP3 remains separate.

## CP2 approval and PDF/DOCX scope — 2026-10-01 (supersedes earlier approval gate)

- User explicitly approved CP2 private Storage/recorder/real MP3/server-only private Drive/7-day cleanup/Admin playback. No new staging or repeat audit of previously passing foundation/editor. Drive credentials are absent: stop before real OAuth/Drive credential use, explain type/scope/secret storage/user steps. Never enable Speaking on real courses before synthetic production end-to-end smoke. No Auth mutation or real student data fixtures.
- Latest attached brief adds simple Admin PDF/DOCX/manual exam import. No JSON/question IDs/provenance/rubric configuration in the new workflow; parser -> review/edit -> atomic draft save -> existing preview/publish. Shared passages/hints immutable separate entities; no AI/OCR guessing or overwrite of historical versions.
- Branch feat/speaking-private-pipeline from shipped PR24. Local implementation complete through mock/disabled pipeline: exact two **unapplied** migrations 20260930151008_speaking_private_pipeline and 20260930173505_document_exam_import. Applied migrations untouched. Existing Auth/enrollment and lightweight attempt history retained. New private tables7; no old data backfill/column changes. Exact delta/rollback: docs/assignment-cp2-migrations.md.
- VERIFIED LOCAL: 133/133 full tests; lint/build/validate and canonical validation. Real FFmpeg/FFprobe 8.1.3 conversion/probe/full decode, synthetic six-minute Opus -> MP3: raw3,031,030 bytes, output2,880,621 bytes,360 seconds,5,873ms on this Windows machine. Old npm binary packages were removed after actual installed versions proved outdated. Pinned monthly archive hashes, private server bundle, restricted decoder env (no secrets). Linux/native hosted health still needs CI/deployment proof.
- VERIFIED LOCAL: PostgreSQL anon/A/B/Admin/service-role and Storage operation boundary, exact question/attempt binding, no draft/key leaks, immutable submissions/media/context, retry/idempotence/Drive failure retention/cleanup race/history. Document import Admin-only/atomic/replay/private key/default manual rubric/shared context pin/inheritance/manual provenance. Actual Drive is mock-only.
- VERIFIED LOCAL Chromium: 390/768/1366 import PDF10/DOCX10, edit/delete/order/manual add/refresh/confirm; real MediaRecorder with synthetic mic, preview/re-record/save, locked Admin MP3 playback, permission denial and unsupported browser. Foundation/Admin generator/JSON import regression, account and 23 private lesson engines pass. iPhone/Safari not proven.
- Read-only production reconciliation: courses2/content24/profiles2/enrollments4/access26/attempts3/assets36; official entities0, new schema absent; pg_cron/pg_net/Vault installed. Actual hosted Storage operation names and grants checked. No new scheduler, credential, bucket or production DDL yet at this entry.
- Recovery: original full backup unchanged/readable/ignored with known SHA256. Fresh local ignored schema supplement captured2026-09-30T18:43:56Z contains four replaced RPC definitions/ACL/owner, Storage policies and current counts; no row values/secrets. Full-row re-export was rejected by automatic approval review for external disclosure risk; use safe schema supplement with existing backup, not indirect extraction. Paths/hashes/exclusions in migration doc.
- Failed checks resolved: default test concurrency overloaded PDF worker deadline; bounded test concurrency2, runtime deadline unchanged. New advanced-panel placement initially hid nested generator/JSON test interactions; preserve user's open question panel across bank reload and expand outer advanced import in regression script. PDFjs task.destroy API corrected. Git/Vercel native runtime not considered production-ready merely from npm audit.
- Exact next action: commit/push with CI133 + Linux native validation + browser gates; deploy compatible disabled API/loader and verify actual parser/Admin runtime, then apply only new additive migrations and rollback-only synthetic smoke as authorized. Stop on actual regression or unsafe native runtime. Keep Speaking gate false and Drive/scheduler production pending owner credential checkpoint. CP3 lifecycle/graduation/certificate/public verification is not implemented.

## CP2 infrastructure + document import production checkpoint VERIFIED — 2026-10-01

- PR25 merged311c7f06b7c361f4f65bcecdc12e499495131059, exact implementation source698ccb551dc86138c1a72b38a3de11d2e323c0a6. CI36764537430/36764537552 SUCCESS:133 tests, lint/build/validate/canonical and browser gates. Linux native8.1.3 runtime179,988,843 bytes and actual MP3 passed. Packaging correction in698ccb5 is verified in the Git object, not just working bytes.
- Compatible disabled API/UI deployed first: Vercel68Fw1GnKxYeLJE2w8bHNuoEu5yQX READY. Existing approved Admin session verified, native synthetic MP3 health232ms PASS before new migration; actual hosted PDF10/DOCX10 preserve Unicode and source keys in editable preview. No browser preview committed to an actual lesson.
- New migrations NOW APPLIED and immutable: source20260930151008 -> registry20260930194254 speaking_private_pipeline; source20260930173505 -> registry20260930194302 document_exam_import. Applied sequentially after hosted health. Never edit/repair applied SQL. No existing table column change/backfill/Auth mutation. Existing full backup and fresh schema supplement remain ignored/local; full-row re-export was rejected, no bypass.
- Production rollback-only synthetic SQL PASS: anonymous and two nonadmin auth context denial, worker/private table/authoring/grade/publish denial, Admin atomic import/replay/conflict/preview/publish, shared context immutable and inherited version, failed import atomicity, bucket private and gate disabled. Synthetic nonadmin UUIDs have no profiles: not a claim of approved/enrolled real student JWT A/B isolation. Full owner/Storage HTTP/Drive/cleanup E2E remains pending; local PostgreSQL owner tests do pass.
- Postflight courses2/lessons24/profiles2/enrollments4/access26/attempts3/assets36/audit12 unchanged counts. Official entities/imports/contexts/recordings/events and fixture courses/lessons0. Seven new internal tables deny direct access with RLS. Storage policies exactly original lesson SELECT + reserved Speaking INSERT + authorized download-only SELECT; empty definer search_path and narrow role grants verified. Advisors only new intentional no-policy INFO; known Auth password-protection WARN unchanged and out of scope.
- Both hosts: seven client/CSS byte hashes match source. Backup/server/.env paths404; anonymous API health/parser POST401. No raw-content grant tightened or previous migration modified. Existing self_reported history is not an official score or eligibility source.
- Evidence local ignored: .cache/cp2-production-verification.json, .cache/cp2-release-verification.json and rollback-only .cache/cp2-production-smoke.sql (itself run locally first). Browser parser smoke creates only local draft previews, no server exam/submission fixture. On production UI, PDF and DOCX synthetic previews can be discarded with Huy; no confirmed exam was added.
- Exact next action: STOP at user-required Drive credential checkpoint. Dedicated OAuth Web client + owner offline refresh token (drive.file/openid/email), private app-created/authorized folder, Vercel server Production secrets. Do not read/reuse old Docs credentials or create real Drive credential/scheduler/Vault secret on the user's behalf. After owner configuration, authorized synthetic E2E + owner isolation/Storage/playback/expiry cleanup/history tests must PASS before enabling any real course. pg_cron five-minute scanner is proposed, not installed. CP3 remains pending.

## Speaking draft archival regression — forward fix before credentials

- Actual late regression found while closing CP2: original claim could archive confirmed draft/superseded media, and a previously saved expired reference was not revalidated at finalization. No production impact: recordings0, gatefalse, no scheduler or Drive secrets. Stop feature expansion and fix this before owner credential setup.
- New additive source20260930201500_speaking_submission_boundary; the two applied migrations remain untouched. Worker only archives the exact submitted answer reference. Invoker helper + new submission_details BEFORE UPDATE trigger reject expired/cleaned recording at save/finalization, preserving existing timed-out finalization/history. No Auth/RLS/table/column/backfill/data deletion. Existing authorized API remains compatible; client gains actionable RECORDING_EXPIRED text.
- Full136 tests PASS; three new cases include positive submitted claim plus draft/superseded exclusion and both save/submit expiry/cleanup rejection. Scoped rollback-only SQL tested locally using synthetic Admin-owned metadata, not student data/Auth mutation. Third schema-only local ignored backup captures replaced worker/helper DDL/ACL and trigger definitions; exact timestamp/hash in migration doc. Production rollout/registry and postflight must be recorded after immutable CI/compatible loader verification, then resume the required Drive checkpoint only.

## Speaking submitted-recording forward fix RELEASED — 2026-10-01

- This entry supersedes the pending rollout above. PR27 merged9aa3d8eded4a9342b5641b25f619fa57b9b933a5; exact source1b0331bfe99d247b4e8d96cdbba6bbf1beba6578. CI36773740456 SUCCESS136 full tests + lint/build/validate + Linux real MP3 + Chromium regression gates. Eight client/CSS hashes match both live hosts before migration; anonymous APIs401 and private file URLs404.
- Third additive migration NOW APPLIED registry20260930204348_speaking_submission_boundary. All three CP2 source files are immutable. No old migration edit, table/column/RLS/Auth/backfill/data deletion. Replaced worker/helper plus new INVOKER finalization trigger only; definer search_path/grants verified.
- Hosted rollback-only synthetic state-machine smoke all4 PASS: draft and superseded exclusion, positive exact submitted-reference claim, expired finalization rejection. The first hosted expired fixture had independent clock reads differing by microseconds; the retention constraint correctly rejected it and the transaction aborted. Reusing one fixture timestamp corrected only the ignored fixture; rerun PASS, no product/schema/data change.
- Final counts2/24/2/4/26/3/36 and audit12 unchanged; recordings/events/questions/submissions/fixture course+lesson0, gatefalse. Every synthetic DB fixture and temporary gate change rolled back. No real student/Auth/media fixture or actual Drive call. Exact proof .cache/cp2-boundary-production-verification.json (ignored) and docs/assignment-cp2-migrations.md.
- STOP at user-required owner credential checkpoint. Dedicated OAuth Web client + owner offline refresh token, drive.file/openid/email; private same-app folder; server-only Vercel secrets. No credential generation/read/reuse, scheduler/Vault secret or real Speaking activation. Full enrolled-student JWT/Storage/Drive/playback/cleanup/history E2E remains pending, not production PASS. Existing mock/local isolation and retry/race tests passed. CP3 remains pending.
