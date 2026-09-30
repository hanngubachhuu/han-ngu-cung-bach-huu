# CHANGELOG HANDOFF — HÁN NGỮ CÙNG BÁCH HỮU

Mỗi phiên quan trọng để lại một entry ngắn.

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
