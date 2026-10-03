# CHANGELOG HANDOFF — HÁN NGỮ CÙNG BÁCH HỮU

## Verified rollout complete — 2026-10-04

Application da4a57a deployed READY / Production at 2026-10-03T19:08:17Z, six live assets equal Git source, both exact application CI PASS. 238/238 local tests plus lint/build and security/responsive regressions PASS. Actual old makeup and new full test both submitted 27/27. Human audio/auto-next and deployed terminal receipt/history navigation PASS. Actual Admin receipt labels, shared makeup inspection and Q1/Q26/Q27 private playback PASS. Normal Admin pipeline prepared all 27 new recordings after alias-only SQL fix.

Actual Student privacy PASS (authoring403, Admin makeup denied, empty private buckets, direct recording400); anonymous audio401. Original row/policy/result/source history preserved; only the 27 authorized new recording rows and 27 private playback objects were processed. Generic makeup migration 20261003183857 and processing fix 20261003185553 applied. Speaking false; cron0; no new publication/extra session/learner grant. PR #36 stays draft/unmerged; preserve untracked docs/speaking-pilot-preflight.md. Historical pending notes below are superseded; current scope is complete.

## 2026-10-04

General Admin makeup applied as 20261003183857 with every pre-existing row/policy hash unchanged. Real full BachHuu test submitted 27/27 and human audio/auto-next PASS. Completion microphone cleanup/receipt screen and Admin receipt presentation validated locally; exact CI/rollout pending.

## 2026-10-04 — real makeup received, shared Admin opening
- Hosted fix: f0b62dd, both CI PASS, migration 20261003175113. The same real Q26/Q27 bytes were bound after the narrow history-trigger correction. Actual Student submitted at 2026-10-03T17:52:08.881719Z; old attempt submitted 27/27, frozen 25 answers unchanged. Real Admin sees receipt and both new recordings.
- Human expands makeup authority to every official lesson/exam. Forward generic migration and shared UI now cover all eight written formats plus speaking; missing-only, immutable received answers, original versions/timing, old published grades and real late receipts. Admin opens from submission detail; entitled owner uses a supplied link or Nộp bù in their own history.
- Final local validation: 238/238, lint/full build/validators, seven targeted SQL cases, same-request reload/network recovery at 390/768/1366 px, existing assignment and HSKK recovery browsers PASS. Exact CI/production generic rollout still pending. No unrelated fixtures were edited; preserve untracked docs/speaking-pilot-preflight.md.
- Real full test active on production application 32b6fd9: cb7fa9fa-362c-432d-9aca-7ad9035f36da, human microphone, deadline 18:29:07Z. Do not interrupt Student or redeploy mid-exam. Wait for legitimate receipt and human audio report; verify private Admin playback/denial before calling hosted E2E PASS.

Mỗi phiên quan trọng để lại một entry ngắn.

## 2026-10-04 — H71002 missing-question recovery rollout
- Goal: repair submission waiting on Q26/Q27 uploads, support human-authorized Admin-opened missing-question makeup, prepare one separate new controlled hosted test.
- Completed: application `32b6fd9`, 234/234 tests, lint/build/validators, three-width local browser checks and both exact CI workflows PASS. Production `dpl_J2Sa5Jy9jQtE3ALVSDGxSRGiUm9g` READY with six live assets matching the build. Forward migrations applied as `20261003171309` and `20261003171323`; no RLS policy weakening.
- Real approved Admin opened frozen Q26/Q27 makeup window `90d2f4b5-a0e8-4eea-b2c5-3945da590c90` for BachHuu's old attempt. Expires `2026-10-03T21:17:30.438481Z`. Authorized separate new test preflight `cb7fa9fa-362c-432d-9aca-7ad9035f36da`; no actual new session was manufactured.
- Production preservation: all old row hashes match baseline, original attempt remains draft 25/27, source/confirmed boundaries/clips unchanged, Speaking false, cron zero. Real audit entries record Admin actor. Baseline and screenshots are ignored under `test-results/hskk/`.
- Pending: human opens the provided `makeup=1` old-attempt link and actually resends retained recordings or records only missing Q26/Q27, then submits. Verify all 27 legitimate server references, actual late receipt and private Admin playback; do not claim full new E2E from makeup. Then run the separately authorized full normal human test.
- If window expired: inspect using actual Admin and open a separately audited window; never extend the old session or the immutable prior makeup deadline. Do not reuse synthetic browser results as hosted proof.
- Do not touch: original source MP3, original segmentation run, 27 confirmed clips, unrelated HSK1/HSK2 access, old 25 recordings, global Speaking/scheduler, published grades, untracked `docs/speaking-pilot-preflight.md`.

~~~md
## YYYY-MM-DD — Session N
### Goal
-

### Completed + verified
-

### Changed
- path:

### Problems discovered
-

### Failed approaches to avoid
-

### Decisions made
-

### Exact next action
-

### Do not touch
-

### Verification level
- V0 | V1 | V2 | V3 | V4
~~~

## 2026-09-28 — Continuity Engine installed
### Goal
- Đưa continuity engine chuyên dụng vào repository.

### Completed + verified
- Đã xác định repository chính.
- Đã tạo lớp continuity riêng cho project.
- Đã tạo bootstrap state yêu cầu một lần Repository Reconciliation trước khi sửa application.

### Problems discovered
- Có một số tín hiệu mâu thuẫn giữa tài liệu kiến trúc và artifact hiện tại.
- Đây là mục reconciliation, chưa phải bug đã xác nhận.

### Exact next action
- Thực hiện Repository Reconciliation theo RECONCILIATION_PLAN.md.

### Do not touch
- Application behavior, data, schema, RLS, UI approved.

### Verification level
- V1 đối với repository structure; reconciliation runtime chưa thực hiện.

## 2026-09-30 — confirmation incident recovery

Prepared PR #21 with inline email confirmation recovery and regression coverage; Vietnamese confirmation template saved/reloaded on Supabase. Unit/DB tests 51 pass, lint/build/validate and account browser flow pass. Actual incident login and production owner Google connection verified. Full reconciliation still pending; see latest WORK_STATE checkpoint. No auth/RLS relaxation or lesson data changes.

## 2026-09-30 — Assignment upgrade reconciliation and CP1 proposal

### Goal
Execute the supplied assignment/grading/speaking/versioning/student/graduation/certificate project on the existing app, with user refinement restricting auto-grading to HSK/HSKK pathway submissions by student accounts.

### Completed and verified
Read continuity/architecture/source, inspected live tables/migrations/RLS/ACL/functions/storage, traced lesson/attempt/Docs paths, built and tested baseline. 51 tests, lint, build, validate pass; account responsive and 23 private engine browser checks pass with mocked providers. Live account/attempt bytes match Git on both hosts; private samples 404, Vercel unauth API 401. Main Deploy 36677311811 and Pages 36677385402 success.

### Changed
Continuity only: RECONCILIATION_REPORT.md replaced bootstrap; ASSIGNMENT_UPGRADE_PLAN.md added; WORK_STATE/PROJECT_MEMORY/DECISION_LOG/BUG_LOG/DATA_CONTRACT/CHANGELOG_HANDOFF updated. No app/schema/RLS/production behavior changes, no migration or deployment.

### Findings and limits
Only self_reported scores exist. HSKK is a static/local grading page, not a DB course. Existing content reveals keys to entitled users. Official grading needs CP1 security/data change. Private manifest discrepancy explained by build; payload versions/shapes coexist. Internal backup tables lack RLS but actual browser ACL denied. 33 live migrations vs 14 local files prevent blind reset/push. New audio/official grading/certificate behavior not implemented or tested.

### Failed approaches
Do not run validate before build finishes (transient visibility failure, then pass). Read-only shell HTTP needed approved network escalation. Supabase reviewer temporarily hit usage limit; subsequent reviewed retry after user continuation worked. apply_patch cannot delete/add same path in one patch here; rejected atomically, then normal file write used. Connector workflow URL rejected; approved read-only public API supplied evidence.

### Decision and exact next action
User scope recorded in DEC-006. CP1 still pending; present current state, concrete extension, impact, migration and rollback from ASSIGNMENT_UPGRADE_PLAN.md. After explicit CP1 approval implement minimum versioning + existing course/attempt foundation locally and test DB/role boundaries, then phased deployment. Keep CP2 audio infrastructure/Drive and CP3 public verification separate. Never treat self_reported scores as graduation evidence.

### Protected / verification
Keep users/grants/legacy attempts/content/owner OAuth/SMTP/navigation/unrelated tools. V0 live schema/code, V1 automated DB/unit, V2 mocked browser, V4 scoped live hashes/HTTP/Actions. No live student write-based security probes or new feature E2E claims.

## 2026-09-30 18:34 — CP1 foundation and approved local backup

CP1 implemented locally: 3 additive SQL migrations, 9 private linked entities, guarded assignment commands, immutable snapshots, objective/manual rubric grading, preview/publish/regrade/audit, existing enrollment HSK/HSKK, student/Admin UI and compatible legacy getter. 72 tests; lint/build/validate; new assignment browser, account and 23 private engines passed. Exact package: docs/assignment-migrations.md; full scope remains unfinished.

User specifically approved local backup and mandated STOP before production migration until checkpoint confirmation. Backup .cache/backups/assignment-before-20260930.json (ignored/untracked, no Git/push), snapshot18:30:42, file18:31:21 Bangkok, SHA2563d34e12f952fd43aedd823ac76ad7ff4adc35e92e5ffb218e693bfa7f528d104; counts courses2/content24/profiles2/enrollments4/grants26/attempts3/assets36 plus audit_logs12. No rows/columns omitted from these tables; Auth credentials, Google credentials/docs and storage objects/files excluded from this targeted backup. JSON/FK/secret checks and local real-data restore followed by all 3 migrations pass; all rows/scopes preserved and activation0. No production mutations or deployment.

Next: hand off backup/schema/RLS/backfill/rollback/test checkpoint and await explicit user confirmation. Then recheck preflight; deploy compatible RPC loader both hosts; only then apply 3 new migrations sequentially/postflight/advisors. Preserve all legacy history and keep activation explicit. Never drop/rewrite production history or commit the backup. CP2/CP3 not authorized. Earlier CP1-waiting entries are historical and superseded.

## 2026-09-30 — actual distractor generation + provenance/archive RELEASED

Foundation/editor accepted by user, no repeat audit absent regression. Added meaningful closed-rule MCQ generation (135 contexts ×12 seeds), client/DB final semantic uniqueness and key-change processing, immutable new versions. Private source/request/archive metadata with actual import actor/time, source identifier/revision/item/parent lineage, preview rollback + atomic stale-protected idempotent import, version archive/restore and old published reference preservation. Three prior applied SQL files unchanged.

PR24 source3b5bff9 mergeda8c15a3; CI36729758153 94 tests + focused browser PASS; Deploy36730845712/Pages36731040044 SUCCESS. Six module byte hashes match on both hosts, real Admin bank/history + number17 generation verified. No actual course content imported/activated. New migration registry20260930143823 exact MD5 matches local20260930133835; now immutable. Scoped production smoke3 sections PASS and every synthetic row/audit rolled back; all new private table privileges denied, helper EXECUTE denied, empty search_path. Source/history protections tested even privileged SQL. No Auth/old data/grade/student boundary change.

Resolved test-only issues: a writing import rejection fixture retained MCQ options and failed earlier than expected rubric check; corrected fixture. Existing browser mock needed to recognize new authoring endpoint; adapted without changing student/grading behavior. Initial scoped SQL inventory used a nonexistent submission table name; read-only query corrected. Native browser binding from earlier turn was absent, rebound selected Chrome and opened new Admin tab; no credential access. No open product failure.

Evidence: docs/assignment-authoring.md plus ignored .cache/assignment-authoring-production.json and assignment-authoring-release.json. Existing backup remains local ignored. Exact next action: review/approve concrete CP2 docs/assignment-speaking-cp2.md for private audio storage/worker/Drive/credentials/scheduler. Original project's architecture checkpoint applies; no new staging/old foundation audit. No recording infrastructure or OAuth/worker setup performed yet. After CP2 approval implement/test and present exact new audio migration before production. Background deadline sweeper and CP3 remain pending.

## CP2 + document import local checkpoint 2026-10-01

User CP2 approval supersedes the earlier wait for architectural permission. New PDF/DOCX brief implemented in the same architecture. Local133 tests/lint/build/validate and Chromium390/768/1366 pass; real pinned8.1.3 MP3+six-minute benchmark pass, Drive remains mock-only. Two new migration source files still unapplied at this checkpoint, no production activation/credential/scheduler/Auth mutation. Full backup retained, new schema supplement local ignored (no PII export). Exact current work/limits/remaining hosted gates: WORK_STATE and docs/assignment-cp2-migrations.md, assignment-speaking-cp2.md, assignment-document-import.md. Next: CI/Linux build/deploy+safe schema smoke, then owner credential checkpoint; don't re-audit old passing phases.

## CP2 infrastructure and reviewed document import shipped — 2026-10-01

PR25 merged311c7f0, source698ccb5; CI36764537430/36764537552 SUCCESS133 + Chromium gates. Vercel compatible release READY; real Admin native MP3 health232ms, PDF10/DOCX10 actual hosted parse PASS. Applied only two new additive migrations sequentially (registry20260930194254/20260930194302); old SQL/Auth/data unchanged. Rollback-only synthetic hosted schema/RPC/import/immutable version smoke PASS; fixture courses/lessons/questions/imports/audits all rolled back. Current counts2/24/2/4/26/3/36 + audit12; official and new entities0; gatefalse/private bucket. Hosted policies/grants/search_paths and seven byte hashes on both hosts verified; backup/server/secret URL404 and anon APIs401. Exact delta/proof/limitations in docs/assignment-cp2-migrations.md, WORK_STATE and ignored evidence JSON.

STOP at owner Drive credential checkpoint, as explicitly required. No new OAuth credential, real Drive upload, scheduler, Vault secret or real-course Speaking activation. Full hosted student-owner JWT/Storage/archive/cleanup/history E2E is pending (local owner and mocked retry/race tests pass). Setup details/scopes/private app-folder rule/server secret names in docs/assignment-speaking-cp2.md. Don't claim complete CP2 production PASS or begin CP3 before resolving the credential-dependent gate.

## Speaking submitted-only archival forward fix shipped — 2026-10-01

Late regression was fixed before any recording/worker activation: archival claims now require the exact submitted answer; save and explicit submit revalidate expiry/cleanup. PR27 source1b0331b, merge9aa3d8e; CI36773740456 SUCCESS136 full tests/lint/build/validate/Linux native MP3/browser gates. Compatible client hashes verified both hosts, then new registry20260930204348_speaking_submission_boundary applied. All three CP2 SQL sources are now immutable; previous applied SQL/Auth/RLS/data untouched.

Hosted synthetic rollback-only smoke4 PASS: draft/superseded exclusion, exact submitted-reference positive claim, expired finalization rejection. First expiry fixture correctly failed the exact seven-day CHECK because independent clock reads differed by microseconds; transaction aborted. One fixture timestamp fixed only the ignored test fixture and the rerun passed. Final counts2/24/2/4/26/3/36 + audit12, fixture/recording/event/question/submission rows0, Speaking gatefalse. Recovery supplement read-back/hash/ignore and helper/worker permissions verified. Evidence and limits in docs/assignment-cp2-migrations.md and ignored .cache/cp2-boundary-production-verification.json.

No remaining defect from this fix; resume only the required owner Drive credential checkpoint. Do not configure credentials or scheduler, start CP3 or enable real Speaking until the user configures server secrets and full synthetic owner-JWT/Storage/Drive/Admin playback/cleanup/history smoke passes. Document import is live; parser previews never committed a real lesson exam.
