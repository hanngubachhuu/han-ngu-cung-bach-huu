# WORK STATE — HÁN NGỮ CÙNG BÁCH HỮU

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

## Production rollout AUTHORIZED — supersedes waiting gate

User explicitly authorizes the three reported migrations in order and minimum production data/security/assignment/legacy/regression smoke tests, then phase continuation if PASS. Hosted discovery: only dmeqxdznzobbarvkmxyg project and no branches. User explicitly waives creating staging. Keep backup ignored/local, no production reset/drop/Auth changes. Deploy compatible loader to both hosts before migration3 closes raw access. Fresh read-only preflight 2026-09-30 19:26 Bangkok: courses2/lessons24, future uniqueness conflict0/null course0/missing course0/level mismatch0, self_reported3 and unchanged history hash70baf5db371f37eea4b88b5154a2b200. No new official entities yet. Smoke fixtures must be synthetic and transaction-rollback isolated; never overwrite current learner submissions or import sensitive backup into staging. Stop at a real failure, do not broaden features until fixed and validated.
