# Central Admin workspace checkpoint

PR #36 continues from `ba434e7`. This checkpoint implements the central Admin UX and a locally verified HSK publication transaction. It does **not** certify production deployment or a complete official HSKK publication/submission flow.

## Navigation and content boundaries

The sole primary Admin entry is `quan-tri.html`, with exactly **Tổng quan · Học viên · Đề thi · Bài nộp**. The former HSKK shortcut is removed. `hskk-quan-tri.html` remains a compatibility redirect to the central workspace; it does not boot another Admin app.

- Tổng quan: student and approval counts, an explicitly bounded count of pending submissions from the last 20 attempts, and the real active exam count.
- Học viên: search/status filter, one student list, approval/rejection/suspension, course enrollment, selected lesson access, self-reported results, official submission/result history and existing Google Docs tools. Lesson assignment authoring remains under “Bài tập theo bài học”. Visible rubric configuration is hidden in the central workspace; grading existing submitted responses remains available.
- Đề thi: independent HSK 1–6 and HSKK elementary/intermediate/advanced lists. **There are no existing HSK exams to import.** Existing lessons and lesson assignment definitions are not seeded into this catalog.
- Bài nộp: existing submission queue, student/assignment/time/status/results, grading and owner/attempt/question-bound private recording playback for Admin.

Central route: `quan-tri.html?section=exams&type=HSKK&level=elementary&exam=H71002`. Navigating between the exam list/editor/audio panel keeps mounted local state and pauses playback. Authentication changes dispose the workspace and private audio blob URLs.

## Create and edit

“+ Tạo đề mới” accepts a title, HSK/HSKK type, level and PDF/Word file. The existing bounded server parser handles selectable-text PDF and `.docx` up to 3 MiB. It immediately opens the shared question editor. Scanned PDFs require a selectable-text source; this checkpoint does not introduce OCR or call Astra. Unsupported media/table warnings remain visible for comparison with the original file.

The shared question rail opens each question directly. Supported fields include type, prompt, options/key, teacher answer, explanation, pinyin, image/audio URLs, timing, ordering, hints, shared instructions and reading contexts. HSKK uses the same content editor plus Audio/Phân đoạn audio. Teacher answers and authoring metadata do not enter learner snapshots.

For HSK, **LƯU & XUẤT BẢN** validates and performs question/context creation, definition preview/publication, activation, audit and request-id recording in one database transaction. A rejected transaction changes none of them. An uncertain network response freezes that publication payload and retries the same request. Editing a published exam creates a new immutable assignment/question/context version. Existing attempts retain their original snapshots; new attempts use the active version.

The exam registry is private and independent of the lesson catalog. Its delivery adapter uses a new `exam-*` internal container to reuse the existing strict assignment engine. It never converts an actual lesson into an exam; internal containers are excluded from learner/Admin lesson selectors. A default assessment rubric is internal policy for newly authored HSK written/spoken questions, not an asserted official HSKK scoring standard.

## HSKK audio review and factual status

`mountHSKKAdmin` mounts the original `mountAudioReview` inside the central editor. It preserves the local segmentation engine, waveform/cursor, zoom/pan, draggable boundaries, millisecond timestamps, segment/context playback, current-position boundaries, proposal restoration/confirmation, confirm-and-next, non-question classification, audit and rerun preservation. Content edits and source review are separately versioned internally; automatic saves retain their exact request identities and save newer edits after an in-flight write.

Locally, the API may reopen a hash/version/question-bound cached structural run when there is no persisted review. This never changes question confirmations or the original source. Hosted deployments use private persisted review or a fresh engine run, not the local ignored cache.

H71002 remains **Thi thử HSKK Sơ cấp**, with **27 structural proposals, 27 requiring Admin verification, 0 confirmed, 0 manually adjusted**. Its original source JSON and private MP3 were not changed. Q26/Q27 remain unverified cue proposals. No clips or publication were performed. Browser test confirmations use isolated synthetic provider fixtures and do not change H71002.

The single publication button is disabled for unresolved audio or missing official session/version integration. Server-side HSKK publication also rejects a forged browser readiness assertion. Generic PDF/Word HSKK content can be opened and edited; registering its own immutable audio source and connecting it to a complete official timed session remain outstanding. This checkpoint must not be described as complete HSKK exam creation/publication.

## Verification and production boundary

Local PostgreSQL-role tests cover Admin-only catalog access, transactional rollback, idempotency, immutable old/new version binding, privacy of learner projections and refusal of forged HSKK publication. Browser provider responses are mocked, while the browser, parser and MediaRecorder run normally. Browser tests cover the central navigation, initially empty HSK catalog, create/edit/publish retry, embedded HSKK review, confirmation/navigation preservation, denial of non-Admin source access and no page overflow at **390/768/1366 px**. Existing account, lesson, private content, assignment, authoring and recording browser checks are also run.

The PR test set has 184 tests (172 existing plus 12 new). The complete working directory also contains a pre-existing untracked `tests/hskk-auto-next.test.mjs`: its three tests fail `INVALID_AUDIO` because the fixture declares an empty audio URL. Those changes, and the pre-existing HSKK runtime edits, are preserved and excluded from this commit. A first parallel build/test run also exhausted the PDF parser's 20-second budget; the parser test passed on an isolated rerun and the full rerun leaves only those three pre-existing failures.

Lint, build, study validator and the 30 canonical lesson validator are required. CI runs the new central Admin browser check alongside all previous browser suites. Actual CI status belongs to the pushed commit/run and is reported separately, not inferred from local success. CI skips real private-source integration tests when the ignored MP3 is unavailable.

Read-only production schema verification on 2026-10-01 confirms `account_internal.admin_exams`, `public.admin_exam_command(text,jsonb)` and `public.hskk_authoring_draft(text,jsonb)` are absent. Neither the prior HSKK source/review migration nor this checkpoint's additive `20261001140652_central_admin_exam_workspace.sql` was applied in this task. No production database/Auth/storage mutation, migration application, merge or deployment was performed. Official hosted HSKK publication, real student submission and Admin playback/publish verification remain release prerequisites.

## Exact files changed in this checkpoint

```text
.github/workflows/validate-study.yml
api/hskk-exams.js
docs/central-admin-checkpoint.md
hskk-quan-tri.html
quan-tri.html
scripts/check-account-browser.mjs
scripts/check-admin-browser.mjs
scripts/check-assignment-authoring-browser.mjs
scripts/check-assignment-browser.mjs
scripts/check-assignment-ui-browser.mjs
scripts/check-hskk-browser.mjs
scripts/render-account-pages.mjs
scripts/render-hskk-pages.mjs
server/hskk-cached-review.mjs
study/account-service.mjs
study/admin.mjs
study/admin-documents.mjs
study/admin.css
study/admin-exam-core.mjs
study/admin-exam-editor.mjs
study/admin-exam-service.mjs
study/admin-exams.mjs
study/assignment-admin.mjs
study/assignment-question-form.mjs
study/assignment-student.mjs
study/assignment.css
study/hskk-admin.mjs
study/hskk-admin-entry.mjs
study/hskk-audio-review.mjs
study/media-url.mjs
supabase/migrations/20261001140652_central_admin_exam_workspace.sql
tests/admin-catalog.test.mjs
tests/admin-exam-rls.test.mjs
tests/admin-exam.test.mjs
```

Rollback should disable this UI entry/RPC via a follow-up migration while preserving immutable versions, attempts, recordings, source metadata and audit. Do not drop or rewrite historical data.
