# Central Admin workspace checkpoint

## Full hosted submission and completion-screen fix — 2026-10-04

- Real BachHuu test `cb7fa9fa-362c-432d-9aca-7ad9035f36da` received and submitted **27/27** at `2026-10-03T18:29:14.901826Z`, including Q26/Q27. Human feedback explicitly confirms clear audio, working microphone and automatic advancement. Result revision 1 is draft, not published by the agent.
- The human screenshot exposes a remaining completion UI defect: after successful automatic submission the timed CBT shell and microphone monitor remain active. The new renderer releases microphone tracks, analyser/context, audio, timer, online listener and journal after server-confirmed submission, then automatically replaces the exam workspace with a submission confirmation and links to account submission history/HSKK. Pending/failed uploads keep the exam recovery flow. Reopening a submitted exam does not record or submit again; unavailable result lookup cannot hide a successful receipt.
- Regression reproduced RED against the old build (microphone track still live), then PASS at 390/768/1366 px: all 27 delayed prompt clips start from zero, 27 recordings, one submission, every microphone track ended, exam shell/skin removed, history link present, submitted recovery without another submission, and safe result-fetch failure. Targeted 24 engine/media/microphone tests PASS; lint PASS. Full 238-test suite and both CI workflows already PASS for general makeup commit `2db4b1a`; exact completion-fix CI/rollout are pending.
- Admin now displays **Đã nhận trên hệ thống** independently of the secondary grading/publication state. Draft attempts remain **Đang làm**. This changes presentation, not submission or score state.
- General Admin makeup migration applied as production `20261003183857 / assignment_admin_makeup`. Before/after row hashes, counts, Storage policies, original source/authoring, enrollments/access, both session histories, submissions/results/grades all match exactly. Speaking remains false; cron jobs zero. Application rollout remains pending the completion-fix CI.
- Clarification: the original recovered attempt was submitted 27/27 at `17:52:08.881719Z`; the human Admin subsequently published its result at `18:06:16.972882Z`. That human publication supersedes the earlier snapshot saying its result was still private. The agent did not publish, grade or alter that result.

- Hosted Admin processing revealed error 42703: local assignment-version record `v` shadows relation alias `v` in the ordinary-session processing query. The older makeup-specific branch bypassed this defect. Forward migration `20261003185205_hskk_admin_recording_process_alias.sql` changes only that query alias while preserving the function OID and ACL. Regression reproduces the same error without a makeup receipt, then six SQL/security tests PASS, including Student denial and the exact 27 Admin recording identities. Production hotfix application and playback verification pending.
- Completion commit `80719f6` CI passed unit/SQL/lint/build but its browser job expected the existing local-trial confirmation wording. Preserve that wording; the existing three-width HSKK browser now PASS. Do not deploy the failed-CI commit; final corrected application CI pending.

Next: deploy the exact tested completion-fix application after CI, verify hosted Admin receipt/makeup controls and real recording playback, and obtain fresh real-Student privacy/completion evidence. Preserve all original source/history, no more test attempts, no automatic result publication, Speaking/scheduler off.

## Hosted makeup recovery and general Admin authority — 2026-10-04

- VERIFIED: the original blocking production trigger rejected Q26/Q27 binding after the original deadline (`SUBMISSION_LOCKED`) although both real new recordings had already reached private Storage. Forward hotfix `f0b62dd` passed both CI workflows and was applied as `20261003175113 / hskk_makeup_history_guard`; the real Student tab retried the same references and successfully submitted.
- VERIFIED hosted receipt: old attempt `ba99f979-a21e-4555-86ac-7fda9d8802e3` is **submitted, 27/27**, actual late receipt `2026-10-03T17:52:08.881719Z`. Frozen 25 accepted answers match exactly. Original source, pinned version, session and deadlines were preserved. Only Q26/Q27 were supplemented. Result revision 1 remains private, pending teacher review. The real Admin screen shows both recordings and the actual makeup receipt; screenshot `test-results/hskk/makeup-hosted-received.png` is local evidence. Do not label this as a new full on-time E2E test.
- Latest direct human instruction: Admin may authorize makeup for **any exam or lesson**. Shared support covers every official submission, all supported written formats and speaking, on its original pinned version. A four-hour immutable Admin window freezes only server-missing answers and preserves received answers and prior published result/grade rows. Completing makeup creates a separate unpublished grading revision and accurate receipt; it never republishes a result or backdates an original submission. Timed HSKK retains its pinned response timing and private prompt authorization.
- Implementation under validation: `20261003173842_assignment_admin_makeup.sql`, shared Admin submission control and Student missing-only recovery. Generic private tables are inaccessible directly; original Storage policy function OID is retained, authorized recovery writes stay narrowly scoped, Student replay/enumeration remain denied. Generic production migration and rollout are **PENDING**, not hosted PASS.
- Local evidence: final 238/238 tests, lint, full build and validators PASS, including the Student-history-link addition; all seven targeted recovery tests pass. Exact-commit CI is pending. New recovery browser regression passes at 390/768/1366 px with same-request reload/retry and one submission, plus existing assignment/HSKK recovery browser checks. These are synthetic/local evidence.
- One separate real full test is ACTIVE: BachHuu confirmed starting; attempt `cb7fa9fa-362c-432d-9aca-7ad9035f36da`, started `2026-10-03T18:10:39.313634Z`, deadline `18:29:07.086634Z`; latest observed 24/27, draft. Keep application `32b6fd9` during the real test; do not interrupt the Student tab or create another attempt. Speaking false; scheduler zero.

## Admin-opened makeup for missing recordings — 2026-10-03

The human explicitly authorizes a bounded Admin-opened makeup window and a new recording when the original missing recording is no longer retained. This supersedes the earlier prohibition on modifying the old incomplete submission ONLY for the explicitly missing answers. The user's one new full hosted E2E test remains a separate checkpoint.

The server freezes the missing question UUIDs and the already accepted answers on the original pinned version. An approved Admin can open a four-hour window only for an entitled approved Student's expired, unsubmitted H71002 attempt. Stable request IDs, expected revision/version/missing-set checks, per-attempt locking and immutable private grant/timing/provenance rows protect the scope. Student/anonymous cannot open windows or inspect another account. Existing RLS policies and Storage permissions are retained.

If server bytes already exist but the original bind failed, the exact owned reference is reused. Retained local audio is resent unchanged with an explicitly linked, separately durable recovery identity. Otherwise only a missing question can receive one new, server-timed recording in the open window (Q26/Q27 each retain 90 seconds). Received answers cannot be replaced, replayed or rerecorded. Failed uploads retain the Blob and reuse their identity with backoff; expired windows deny further writes. An expired window needs a separately audited Admin opening rather than silently extending its deadline.

Makeup completion validates all 27 references, preserves the original session/timeline/deadlines and 25 already accepted answers/recordings, fills only the missing answers, and records the actual late receipt time. It creates a private teacher-review result, no published score. The Admin conversion queue includes only the bound 27 recordings, not historical missing/unbound reservations; the existing review workspace clearly labels the added questions and actual recovery timestamp.

| Evidence | Current status |
| --- | --- |
| PostgreSQL: retained bytes, already uploaded/unbound reference, missing-only new recording, expiry/reopening, old row equality, 27 references, actual late timestamp, no result publication | PASS — local synthetic database |
| Student/anonymous/other-owner denial and private Storage/no future prompt | PASS — local SQL/API |
| Actual renderer microphone, immutable retry, missing-only layout, submission at 390/768/1366 px | PASS — local fake microphone/provider; not human hosted proof |
| Full tests / lint / build / validators | PASS — 234/234 tests; lint/build/study/30 lessons |
| Exact application CI | PASS — both workflows for application commit `32b6fd9` |
| Production migration / deployment / real Admin opening | PASS — guarded migrations applied, exact application deployed, real approved Admin opened Q26/Q27 only |
| BachHuu actual Q26/Q27 makeup, legitimate old submission, Admin playback | NOT TESTED |

Production rollout is verified at `2026-10-03T17:18:40Z` (October 4 local time). Application commit `32b6fd98d3c59643b3ca6794f1c78b6409ad2e87` is READY / Production, deployment `dpl_J2Sa5Jy9jQtE3ALVSDGxSRGiUm9g`, on `hanngubachhuu.vercel.app`. Both exact-commit [study CI](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/37139089343) and [lesson CI](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/37139089281) PASS. Six hosted application assets match the tested build. Anonymous makeup-load, authoring status and source-audio requests return `401 AUTH_REQUIRED`.

Forward migrations are recorded as `20261003171309 / hskk_controlled_test_attempt` and `20261003171323 / hskk_missing_recording_makeup`. All five new private tables have RLS enabled, zero direct policies and no authenticated SELECT; renamed implementation helpers have EXECUTE revoked, public entrypoints retain real role/owner guards, and the prompt descriptor is service-role-only. Existing Storage policies, grade/result rows and all historical row hashes are unchanged after migration.

The real approved Admin opened window `90d2f4b5-a0e8-4eea-b2c5-3945da590c90` for BachHuu's original attempt `ba99f979-a21e-4555-86ac-7fda9d8802e3`, pinned version `0b3d1a53-c3d0-4d5c-a55f-3fa60ed4ccb4`. Its frozen missing set is exactly Q26/Q27; 25 accepted answers are preserved. Opened at `2026-10-03T17:17:30.438481Z`, expires `2026-10-03T21:17:30.438481Z` (04:17:30 October 4 in Vietnam). The immutable grant records the actual Admin identity. An independent controlled test preflight `cb7fa9fa-362c-432d-9aca-7ad9035f36da` was authorized at `2026-10-03T17:18:17.564030Z`; no new actual exam session, audio or submission was created by the Admin actions.

Read-only verification after both openings: preflights 1→2; attempts remain 4, sessions 1, answer rows 27, recording reservations 27, Storage objects 94. Every prior answer/recording/session/preflight/attempt/submission/Storage/authoring/access row hash matches the baseline. The old attempt is still legitimately draft 25/27 with unchanged original deadlines. Source hash, all 27 confirmed clips and authoring revision 159 remain unchanged; Speaking false and scheduler zero. Ignored evidence: `test-results/hskk/makeup-hosted-admin-opened.png`, `makeup-production-http.json`, and the baseline snapshots.

Human Student makeup and Admin playback remain NOT TESTED until real retained-byte recovery or new microphone recordings are received and legitimately submitted. The separate new full hosted E2E remains NOT STARTED. No source/clip/segmentation/publication/global Speaking/scheduler changes occurred. Report these two checkpoints independently.

## New controlled H71002 test and Q26/Q27 upload correction — 2026-10-03

The user explicitly selects the real approved Student BachHuu for one new controlled hosted test on the existing published version. The historical attempt remains a draft with 25 uploaded/bound recordings; its expired deadline, answers, recording reservations and absent Q26/Q27 objects are preserved. No missing audio is fabricated or retroactively submitted.

A regression reproduces a client submission race: retry/submit previously treated an already running upload as completed, allowing COMPLETED transition before the two long final-question recordings were saved. The correction joins actual upload promises, shares concurrent submission work, retains the same Blob/request/owner/attempt/question/exam identity on failure, retries failed production uploads in the background with bounded backoff, and stops retrying at the original upload deadline. Question deadlines and automatic advance do not wait for network work. Local reproduction uses the historical Q26/Q27 byte sizes and 90-second response windows; it does not establish the exact cause of the historical failed network uploads.

The forward controlled-test migration allows an approved Admin to authorize exactly one separately audited H71002 test preflight for an already entitled approved Student on the current published version, after the previous actual attempt's upload deadline has expired. It preserves all historical rows and uses the normal Student preflight/countdown path to create an actual session. Stable request identity, version/prior-attempt checks, a serialized insertion guard and an immutable private authorization table prevent repeated grants, Student self-authorization and duplicate starts. No new source, clip, learner entitlement, result publication, RLS policy relaxation, Speaking activation or scheduler activation is included.

| Evidence | Status |
| --- | --- |
| Q26/Q27 delayed uploads, shared submit and immutable retry regression | PASS — local |
| Admin-only one-test authorization, Student/anonymous denial, pinned version, old-row equality and normal preflight/countdown | PASS — local PostgreSQL/API |
| Full unit/SQL suite | PASS — 234/234; document-parser timeouts during concurrent build passed on full rerun after build |
| Lint / build / study validation / 30 canonical lesson validation | PASS |
| Local browser regressions | PASS — 390/768/1366 px; synthetic transport/microphone only |
| Exact change CI and production deployment | PASS — exact application `32b6fd9`, both workflows and Production READY |
| Production migration and real Admin test authorization | PASS — one separate test preflight; original attempt/history preserved |
| New real Student microphone/audio/27-recording submission and Admin playback | NOT TESTED — requires actual human hosted attempt |

The new hosted E2E checkpoint must remain incomplete until a real normal Student attempt is submitted and Admin playback is verified. Synthetic microphones, direct SQL-generated answers or API-only submission cannot pass it. Keep test grades private; stop and report the exact failed step if the real flow fails.

PR #36's accepted central Admin UX is preserved. H71002 audio authoring remains complete: 27 confirmed, three actual manual adjustments (Q13/Q16/Q26), zero unresolved and 27 valid clips. The official learner implementation reuses the existing assignment/access/submission/grading architecture, with real production schema applied. **H71002 was manually published by the human Admin at 12:44:15Z on 2026-10-02; real hosted Storage HTTP is PASS, and real learner end-to-end submission remains pending the actual microphone exam.** Earlier missing-transport/zero-confirmation/API-404/source-upload-pending statements are historical and superseded by this phase.

## Published state and scrolling follow-up — 2026-10-02

Read-only production reconciliation verifies the published assignment, active version `0b3d1a53-c3d0-4d5c-a55f-3fa60ed4ccb4`, registry revision 4 and unchanged authoring revision 159. Existing source metadata, HSK rights/history, 27 clip receipts and one controlled grant remain equal to the pre-publication baseline. No H71002 preflight or live session exists. This UI follow-up performs no production database/Storage mutation.

The HSKK source catalog's draft status previously overwrote the authoritative registry state. The list now retains the saved publication state, title, revision and update time while showing current source audio review. The editor displays **Đề đã xuất bản** for a published official binding, distinguishes subsequent unpublished edits, and retains the existing guarded publication flow. No audio/version/policy change is required.

Fresh production Chrome tabs scroll successfully on Admin, Trang chủ and Tài khoản, confirmed independently by the human. The older Admin tab's input problem was observed without any CSS body/document lock or modal; its cause remains unproven. No speculative global scroll CSS is introduced. The relevant local browser regression exercises wheel input after publication and editor navigation at three widths. Detailed evidence and the remaining real Student microphone/submission checkpoint are in [H71002 checkpoint](hskk-h71002-checkpoint.md).

Local validation: **217/217 tests PASS**, lint/build/study validation PASS and central Admin browser PASS at 390/768/1366 px. Browser and validation are run against a completed build; their first overlapping-build invocation failed and the sequential rerun passed. Exact changed-head CI and production deployment are recorded on PR #36. No real Student submission is inferred from synthetic browser fixtures.

## Protected delivery follow-up — 2026-10-02, from HEAD 1b01fe5

Actual approved Admin Console evidence at `12:08:53.421Z` reads all 27 production prompt objects with HTTP 200 and verifies every hash, exact existing source/run/boundary provenance, question/exam version, decoded MP3 and duration. Actual approved selected Student BachHuu evidence at `12:09:15.990Z` receives the established private-object denial HTTP 400 and bucket enumeration HTTP 200 with zero objects. Anonymous private/public object routes are denied HTTP 400. Network/null statuses, generic HTTP 400 and server failures cannot pass. **HSKK_CLIP_STORAGE_HTTP is PASS**, superseding the prior SDK-null limitation. No JWT, response body or private object URL is recorded.

The authoring GET's obsolete hardcoded missing-transport readiness is corrected to read the existing Admin-only version and server publication gate, with no mutation and closed behavior on provider failure. The connected production adapter, existing 27 clips, versions, BachHuu grant, authoring and source remain intact. No new migration, RLS change, Storage write or production data mutation is performed in this follow-up.

The accelerated server-state test is strictly isolated in the in-memory local SQL fixture, inaccessible to its Student role. Actual 27-question SQL validates 7/10/90-second responses, 420-second preparation, current prompt boundaries, no client clock extension, idempotent recording retries, one submission and private results. No production clock/test endpoint is added. Full tests **216/216 PASS**, lint/build/study/30 lesson validators PASS. Actual local renderer/MediaRecorder/IndexedDB browser checks and central Admin checks PASS at 390/768/1366 px. A delivery-browser submission timeout was followed by diagnostic instrumentation and a passing three-width rerun; the first timeout cause remains unproven, and no timing was changed.

Real Student live prompt/session/exam/submission, real own/other recording denial and Admin learner-recording playback remain **NOT TESTED / BLOCKED before manual publication**; zero real H71002 preflights/sessions/submissions exist. Existing manual grading is ready locally, with no automatic/official HSKK rubric invented. Result publication is NOT TESTED and H71002 publication NOT PERFORMED. The human explicitly chose to publish manually after security PASS. Exact changed-code CI/deployment and before/after immutable-row comparison are reported on PR #36. Detailed local/hosted/real evidence is in [H71002 checkpoint](hskk-h71002-checkpoint.md). Global Speaking and scheduler stay disabled.

Application `4b238ec` is deployed READY to the actual Vercel production alias with Production settings, deployment `dpl_GJaG6gp2CxohQPpvwEpR1JADZQ3s`; both [study CI](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/37006757278) and [lesson CI](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/37006757259) PASS, including browser regression. The actual approved Admin reloads H71002 successfully, sees its ready gate and 27 bound / 27 verified / 1 learner preparation; publication is enabled and not clicked. Anonymous status/session/source requests still return 401. Exact postdeployment row comparison at `12:34:18Z` proves the existing source/authoring/HSK rights/history/official binding unchanged. Subsequent reconciliation keeps Speaking false, scheduler zero and H71002 sessions/preflights zero. Before-human-publication backups and `ready-for-human-publication.png` remain private/ignored. The documentation follow-up has identical application bytes; exact documentation-head CI is reported on PR #36. The remaining prerequisite is the human's separate manual publication, followed by the controlled real Student exam and Admin submission checks.

## Official H71002 learner implementation — 2026-10-02, from HEAD 9d48f98

The central registry migration and five forward HSKK migrations are applied after scoped reconciliation/backups. Current immutable source, authoring revision 159, all reviewed boundaries and clip provenance are preserved. Four HSK enrollments, 26 HSK access rows and three existing attempts remain unchanged. No original source, confirmed boundary or clip was regenerated; no scheduler or global Speaking activation was performed.

The existing editor's Audio tab adds **Chuẩn bị phiên bản đề**, the existing reviewed ZIP upload, **Học viên kiểm thử**, **Cấp quyền đề này** and **Kiểm tra dịch vụ thi**. These call actual authenticated server APIs/RPCs. The selected controlled learner is the uniquely matched approved Student **BachHuu**. The existing publication button is enabled only after the server verifies official versions, 27 persisted clip receipts, real selected access and runtime readiness. It remains a manual action; no exam is automatically published.

The production Student adapter uses the shared HSKK engine, microphone check, server countdown/timeline, queued recording uploads and automatic advance/submission. The account's existing submission history opens the original pinned HSKK version. The existing **Bài nộp** queue/player/manual grading/result publication are reused; the H71002 processing button runs the existing worker only for the selected submitted attempt. There is no second grading application. The internal teacher-review criterion uses the existing grade scale and is not presented as an official HSKK rubric.

**LOCAL PASS:** immutable version binding, access, server deadlines, recording identities, Student denial of own/other playback, 27-recording submission, Admin private playback authorization, manual grading and published-only results. **HOSTED NOT TESTED:** real full-duration learner exam, submission, Admin learner audio playback, grading and published result before manual exam publication. Registry/clip/access preparation and new hosted security smoke are recorded in the follow-up once deployed. Relevant synthetic browser checks pass at 390/768/1366px; they do not prove hosted learner E2E. Full tests 210/210, lint/build/study/30 lesson validators pass. Detailed evidence and remaining blockers: [H71002 checkpoint](hskk-h71002-checkpoint.md).

### Hosted preparation

The real approved Admin used production commit `f44223e` to prepare one unpublished H71002 official version and 27 distinct non-null question UUIDs. **27/27 existing clips** are now stored in private `hskk-prompt-clips`, independently reread/hashed by the server, with 27 verification receipts. Only **BachHuu** has the approved selected H71002 enrollment/access and controlled grant. Runtime health/private archive readiness passed. The actual page shows **27 questions / 27 verified audio / 1 learner**, with the server-gated publication button enabled and **not clicked**.

Source/authoring, all HSK enrollment/access rows and three existing attempts are JSON-equal to the pre-operation backup. There are zero H71002 preflights/sessions/submissions, no publication, Speaking false and scheduler jobs zero. Anonymous session/audio/Admin-delivery requests are denied 401. The actual approved Student Console result at **2026-10-02T11:02:12.780Z** passes: unpublished start 403 EXAM_ACCESS_REQUIRED, Admin delivery and all eight authoring requests 403 ADMIN_REQUIRED, prompt without an attempt 403 PROMPT_DENIED. The SDK returns no private clip and no enumerated objects; a direct HTTP check remains pending because its SDK status is null. Real full-exam submission/playback/grading/result remain NOT TESTED before manual publication. A lost upload acknowledgement was resolved by production receipt reconciliation, without regenerating or uploading clips again. Details and exact CI/deployment status are in the H71002 checkpoint.

Final application code `7deadb7` is deployed READY on production with both CI suites PASS. The final DB-only recovery correction restarts only expired unstarted preflight checks, preserving every live attempt deadline. Post-security reconciliation at **11:10:11Z** confirms 27 question UUIDs, 27 verified private clips, one grant and zero H71002 preflights/sessions; the exam remains unpublished. The exact final schema/test/documentation-head CI is reported on PR #36; these changes do not change production application bytes. Real learner E2E remains NOT TESTED before the separate manual publication and controlled human exam.

## Historical official H71002 integration audit — 2026-10-02 (Asia/Bangkok)

Continues PR #36 HEAD `9b43944`. Read-only production reconciliation at `2026-10-02T08:15:33.412984Z` / 15:15:33 Asia/Bangkok finds authoring revision 159, 27 verified questions, adjustments [13,16,26], one original run and 27 clip provenance records. All 27 authoring question `version_id` values remain null. This does not create official question versions or a publishable exam.

The existing official assignment/version/attempt/submission/access model already admits HSKK through `courses.program` and can be reused. Production still lacks `account_internal.admin_exams` and `public.admin_exam_command(text,jsonb)`; `20261001140652_central_admin_exam_workspace.sql` is unapplied and, alone, still refuses HSKK publication. There are zero real HSKK courses, delivery containers, access rows, assignment/question versions, attempts, submissions and learner recordings. No HSK1/HSK2 lesson, grant or historical submission was changed.

| Checkpoint | Current status |
| --- | --- |
| Exam/version binding | **BLOCKED** — central production registry/RPC and official H71002 UUID bindings missing. |
| HSKK access | **BLOCKED** — no real HSKK catalog/entitlement rows. |
| Student session | **BLOCKED** — HSKK Start is disabled; only nonpersistent preview transport exists. |
| Question audio delivery | **BLOCKED** — completed private clips/provenance lack official learner delivery/storage/version binding. |
| Recording submission | **BLOCKED** — no controlled real H71002 gate or official 27-recording session transport. |
| Admin learner-recording playback | **NOT TESTED** — no real H71002 submission exists. |
| Teacher grading | **NOT TESTED** — generic model tests are separate from H71002 teacher review. |
| Result publication | **NOT TESTED** — no H71002 result was published. |
| Hosted official-session security | **NOT TESTED** — authoring JWT/security PASS does not prove this absent session path. |

Global Speaking remains false, scheduler jobs zero and synthetic test gate empty. The existing global/synthetic recording gate cannot authorize a real H71002 student; the owner-read recording policy also needs an HSKK-specific reconciliation to meet the no-Student-playback rule. No fake canary rows, Auth markers, parallel version architecture, invented official scoring rubric or policy bypass was created.

The actual approved Admin production page was reloaded successfully: it shows 27/27 audio confirmations and “Đề chưa được kết nối với phiên thi chính thức.” **LƯU & XUẤT BẢN remains disabled.** Production alias still runs READY deployment `dpl_2EuaB8G6HHZXbbs7nfwYQ5qpNv82`, commit `0e2367e`; the later PR auto-advance change is not yet deployed. No hosted student session/submission/grade/result is claimed.

**STOP under the user's explicit missing-transport/missing-real-access conditions.** This checkpoint changes documentation only and performs zero production mutations or new migrations. Full existing tests **202/202 PASS**, lint/build/study/canonical lesson validators PASS; HSKK and central Admin mock browser checks PASS at 390/768/1366px. Exact documentation-HEAD CI is reported separately with the final commit/run. Detailed blockers, separate hosted/local/mock evidence and the completed audio provenance are in [H71002 checkpoint](hskk-h71002-checkpoint.md).

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

The initial 2026-10-01 audit found the central registry/RPC and HSKK authoring RPC absent. On 2026-10-02, the exact prepared `20261001100121_hskk_authoring_drafts.sql` was applied after reconciliation and a private scoped backup; production records it as `20261001173401_hskk_authoring_drafts`. The three authoring tables, guarded RPC and private source bucket now exist, with zero source registrations/objects/review revisions. `account_internal.admin_exams`, `public.admin_exam_command(text,jsonb)` and the separate `20261001140652_central_admin_exam_workspace.sql` remain absent/unapplied. No source upload, Auth mutation, learner-data modification, merge, application deployment or H71002 publication was performed.

## Production follow-up — 2026-10-02

**Authoring migration: PASS. Remaining hosted pipeline: BLOCKED.** The accepted UI and all pre-existing runtime edits are preserved. Full scope, exact migration/backup checksums, status table and evidence categories are in [H71002 checkpoint](hskk-h71002-checkpoint.md).

Backup: `D:\download\hsk\han-ngu-cung-bach-huu-github\.cache\backups\hskk-before-20261002.json`, 54,053 bytes, SHA-256 `eda4b52bbb79fe13ad363bac794f9675f85869460b6ebc1fbb7ffaaaa38942fd`; ignored/untracked, parsed successfully, no secret/token candidates. It contains scoped learner/access/attempt/submission data and configuration/schema snapshots, excludes Auth/OAuth/session/API secrets and audio, and fingerprints rather than exports lesson content. Every backed-up historical row and all 24 production lesson fingerprints matched after application.

HOSTED database role checks passed in read-only transactions: current approved Admin can call get; student is refused with ADMIN_REQUIRED; anon lacks EXECUTE. Direct access to the three private tables is revoked, RLS/immutable triggers are present and the new source bucket is private. These checks do not prove real JWT/Storage/browser authorization. The advisor's authenticated public SECURITY DEFINER WARN is documented in the H71002 checkpoint, not hidden or called a clean security scan.

The production Vercel application remains at `54e46f1`; its HSKK API returns 404. The `3e8a9b7` preview is READY and its unauthenticated HSKK API returns 401 AUTH_REQUIRED. Computer Use could not connect to the existing authenticated Chrome Admin tab (two CDP focus-emulation timeouts). No JWT/session was extracted and no upload was performed through an impersonated identity or service-role shortcut. Following the user's stop instruction, no dependent production phase was attempted.

Exact H71002 state remains **27 local proposals / 0 confirmed / 0 manually adjusted / 27 unresolved**, with Q26/Q27 unverified. Zero clips, zero official question-version UUID bindings, no real HSKK course/access and no learner session/submission/result. Hosted source access, full exam recording/submission, Admin playback/grading and result publication are NOT TESTED. Source registration/version binding, actual Admin review, finalization, official session/access integration and the complete hosted cycle are BLOCKED. Speaking remains false and scheduler jobs zero.

Current local rerun: **187 tests, 184 passed, 3 pre-existing INVALID_AUDIO failures, 0 skipped**; targeted authoring migration/server-save tests: **2 passed**. No runtime changes were made to fix or conceal the empty-audio fixture. Prior head `3e8a9b7` CI was checked live and both workflows passed; its 184 committed tests include 182 passes and 2 explicit private-source skips. New checkpoint CI is tracked separately by its commit/run.

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
