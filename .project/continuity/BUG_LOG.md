# BUG LOG — HÁN NGỮ CÙNG BÁCH HỮU

Không coi một bug lịch sử là bug hiện tại nếu chưa tái xác minh.

## Current verified bugs

### HSKK-SUBMIT-INFLIGHT-Q26-Q27 — local fix verified; hosted test pending

- Symptom: the historical BachHuu H71002 attempt has 25 uploaded/bound recordings; Q26/Q27 reservations exist but their original raw objects are absent and the deadline is expired.
- Reproduction: with both 90-second final-question uploads in flight, the old client calls COMPLETED before either finishes because save() returns immediately for an already saving entry.
- Change: join per-request upload promises; share simultaneous submit work; retain immutable Blob/identity, retry production uploads with bounded backoff, and stop at the original deadline. Do not block automatic question transitions.
- Verification: meaningful regression failed before the fix and passes afterwards; full 230/230 tests, lint/build/validators pass. This proves a client race, not the exact historic network failure.
- Scope: no history edits, no recovered audio claim, no back/rerecord, no deadline extension, no source/clip/publication changes.
- Exact next: complete local browser/CI/deployment, authorize the user's single new controlled test through actual Admin, then verify a real microphone/27 recordings/submission/Admin playback. Stop on any real E2E failure.

### HSKK-MISSING-QUESTION-MAKEUP — explicitly authorized scope expansion

- Human chooses an Admin-opened missing-question makeup window; allow recording only when the missing original file is absent. This narrowly supersedes the earlier no-history-write restriction.
- Local SQL/API proof: exact missing-set/revision/version authorization; keep 25 accepted answers/recordings, original session/timeline/deadlines unchanged; reuse already uploaded reference or retained bytes; new missing-only recording; expiry and separately audited reopening; validate all 27, record actual late timestamp and keep review unpublished.
- Existing Admin player/grade workflow is reused with a makeup label and only bound recordings queued for processing. Storage/RLS policies are retained; no source/clip/global Speaking/scheduler changes.
- Renderer: real MediaRecorder on a local fake microphone, missing-only Q26/Q27, delayed/retried upload identity, actual local prompt decoding, one submission, 390/768/1366 px PASS. Hosted human recovery remains NOT TESTED.
- Full suite now 234/234 PASS plus lint/build/validators. Exact code CI/deployment/migration/Admin grant and human makeup remain next; never fabricate or force an old submission.

## Historical areas to reconcile

### AREA-LESSON-ACCESS
- Historical: từng có lỗi liên quan login, quyền bài, visibility và lesson rendering.
- Current status: UNKNOWN until runtime/source verification.

### AREA-LESSON-QUESTIONS
- Historical: từng có lỗi câu hỏi biến mất, submit không hoạt động và cấu trúc lesson khác nhau.
- Current status: UNKNOWN until comparison of working/failing lessons.

### AREA-GOOGLE-DOCS
- Historical: từng có nhiều trạng thái cấu hình OAuth/API/scope/revision.
- Current status: UNKNOWN until current adapter/tests/deployment evidence is inspected.

### AREA-PUBLIC-PRIVATE
- Historical: từng có rollout private lesson và static build boundary.
- Current status: RECONCILE against manifest, build output, Vercel, GitHub Pages, Supabase/RLS.

## Bug schema

~~~md
## BUG-YYYY-MM-DD-NNN
- Status:
- Area:
- First observed:
- Symptom:
- Reproduction:
- Expected:
- Actual:
- Root cause: VERIFIED | UNVERIFIED
- Attempts:
- Current fix:
- Verification level: V0 | V1 | V2 | V3 | V4
- Regression risk:
- Related files:
~~~

## 2026-09-30 — Assignment baseline findings (no unrelated remediation)

### GAP-ASSIGNMENT-001 — Local timer is not an authoritative deadline
- Status: VERIFIED V0 contract gap for official assignments; existing local-practice behavior not changed.
- Evidence: hsk1-lesson-engine.js startTimer decrements saved timeLeftSec; resume restores it without elapsed closed-tab time. Supabase save_attempt has no started_at/deadline enforcement.
- Effect: cannot claim official timed submission enforcement. New official flow requires server deadline and expiry policy.

### GAP-ASSIGNMENT-002 — Results and answer keys have practice semantics
- Status: VERIFIED V0/live schema inspection; required CP1 upgrade, not evidence of cross-student leak.
- Evidence: learning_attempts source=self_reported, browser points RPC, owner SELECT; full authorized lesson payload and engine reveal.
- Effect: cannot hide unpublished official grades or securely grade by adding UI alone.
- Next: CP1 approval; isolate official versions/grade drafts and harden all old write/read paths for enabled lessons.

### OBS-RECONCILIATION-001 — Internal tables without RLS
- Status: VERIFIED ACL denies browser roles; generic inventory exposure warning not substantiated.
- Three historical account_internal backup/staging tables: anon SELECT=false, authenticated SELECT/write=false.
- No automatic RLS change. Consider defense in depth separately with backup consumers audited.

### OBS-RECONCILIATION-002 — Documentation/migration drift
- STALE: unmerged private pilot and no-student/24-grant statements.
- VERIFIED: 33 remote migration entries versus 14 local files, including different timestamps and production content operations.
- Do not reset/repair/replay migrations to make names match; reconcile necessary definitions/preconditions first.

## 2026-09-30 — Local assignment implementation verification
- GAP-ASSIGNMENT-001/002: local new official flow implements authoritative deadline and private published-result/key boundaries, covered by DB/UI tests; not production-remediated yet.
- Fixed local trigger regression: compound IF accessed NEW fields absent on other table types during INSERT. Nested per-table branches fix it; immutable insert/update/delete tests pass.
- Fixed client race: newer edits retained while saves return; Admin inputs frozen during grade/preview/publish; stale grade previews invalidated; expired unsent answers kept for export; cross-tab conflict has explicit remote-reload/export choices.
- Backup export initial auto-review rejection: exact sensitive data/destination permission missing. Asked once, user approved; export succeeded. Do not bypass reviewer via shell/alternate export.
- Backup JSON parser first matched untrusted wrapper prose rather than data block. Required newline-delimited block extraction; no invalid file saved. Backup read/secret checks/real-data local restore all pass.
- Current limits: offline timed draft is finalized on next server touch, no background timeout sweep yet; editor lacks full import/archive/duplicate/order/distractor workflow; speaking blocked pending CP2. No claim of overall feature acceptance.
