# HSKK CBT reference and private practice drafts

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

## Reference inspection

The user supplied three local reference videos. Contact sheets were inspected across each entire timeline (advanced: 773.850023 s, elementary: 1757.982766 s, intermediate: 2618.351746 s), with representative full-size frames for preparation and exam content. This is sampled visual inspection, not a claim of continuous human listening or pixel-for-pixel certification. Ignored evidence is retained under `test-results/hskk/video-reference/`.

The implementation follows the common visual structure: green CBT frame, language selection, headphone and microphone checks, candidate/structure confirmation, timed three-column workspace, question tree, current-question number, countdown/progress, candidate card and help/text-size controls, microphone signal and preparation notes. Real server timing and the existing private recording pipeline drive the actual experience. Vietnamese video subtitles/callouts, channel branding, foreign candidate photos/credentials and end-of-video answers are not copied. Hán Ngữ Cùng Bách Hữu identifies the actual application, and the listening illustration is decorative artwork rather than exam content. Mobile screens stack the same content and retain scrolling and the visible timer.

Reference demo counts do not override real source definitions. H71002 retains 27 elementary questions; H80000 has 14 intermediate questions; H91002 has 6 advanced questions. Advanced Q4 is reading aloud, not an invented picture task. The two intermediate pictures are exact embedded JPEG bytes extracted from the supplied PDF.

## Source provenance and privacy

The original archives, PDFs, answer document and MP3s remain unchanged outside Git/dist. Private local working copies are ignored under `.cache/hskk-sources/`. No new MP3 or answer PDF is uploaded to production, committed, transcoded or given a public URL. The user-facing titles and labels use only H80000/H91002; the supplied document's provider header/footer/watermark is not reproduced in the clean question presentation. Originals and their hashes preserve provenance. These are user-supplied practice sources; provider authenticity has not been independently certified.

| Source | Byte size | SHA-256 | Duration/pages |
| --- | ---: | --- | --- |
| H80000.mp3 | 21579694 | `312e6118cf94621cb77faa1036bfd3656b86a001a9e49c188b10aa4bddaf703c` | 1348.688980 s |
| H80000.pdf | 161842 | `723fdf912d96dce398311e5e42cc679dad33626518159aff9cc7aa5b3d64b23a` | 3 pages |
| H91002.mp3 | 24028099 | `97c22584156721b01276fa5a7c406c30fbab1d6b0dffbed158b26d50c0ac4b48` | 1501.714286 s |
| H91002.pdf | 912105 | `5deb12e3b7a7fcc2cd19c99de5e7d218799a3e7aea9b8ad2641f644c6370d9a1` | 2 pages |

All exam PDF pages were rendered and visually checked. The exact source Q11/Q12 JPEGs are packaged as private server authoring assets. `GET /api/hskk-exams?action=picture` requires the existing real approved Admin authorization before any file read, validates the exact exam/question filename and stored SHA/size, and uses private/no-store responses. Unit/API checks reject Student/anonymous access and traversal. These source pictures are not public site files; future published learner picture delivery is still a separate guarded implementation checkpoint.

## Draft state

`server/hskk/H80000.json` and `H91002.json` are private authoring definitions. Safe public catalog metadata contains codes/counts only, not source audio, question contents, transcript, answer key or source paths. The Admin source catalog can show the new drafts without publishing or registering a production source. Neither has learner grants, a production source registry, segmentation, confirmed segments, generated clips, official delivery binding or sessions.

H80000: 10 listening/repeat questions, 2 picture descriptions and 2 answers; 600 seconds preparation covers both final sections. Source text and pinyin are preserved. Listening response duration remains explicitly provisional until source-audio review. No listening transcript is invented.

H91002: 3 listening/retelling questions, 1 reading passage and 2 answers; 600 seconds preparation covers reading and answering. Printed response times and source text are preserved. The supplied private answer transcript supplies authoring text for the listening questions, which the learner listening renderer never displays. No scoring rubric or answer key is inferred. A second visual comparison of the source PDF confirms that Q4 itself prints the apparently incomplete phrase `机会只会准备好的人`; the draft preserves it verbatim. This source-text issue needs explicit human review before publication rather than an invented correction.

Both drafts deliberately have empty public audio URLs and unverified/null boundaries. They cannot be treated as ready exams. Source registration, byte verification, audio timing/segmentation review, human confirmation and separate publication remain required before real learner testing.

## Validation boundary

- 24 local visual checks: H71002/H80000/H91002, 390/768/1440 px, audio/text and intermediate image layouts, correct code/count, no provider label and no horizontal overflow.
- Actual renderer microphone workflow: 390/768/1366 px; input signal, inadequate-sample rejection, device/preflight gate, retained recordings and Vietnamese/Chinese UI. Synthetic devices/transport only.
- Delayed current-clip playback: 27 clips actually start at zero and 27 recordings auto-submit once at all three widths. Synthetic local transport, not hosted human audio evidence.
- PostgreSQL role/timeline and immutable recovery tests pass; original response/preparation times and historic session rows remain unchanged.
- Lint, build, study validation and 226 unit/SQL tests pass. Both exact-application-commit workflows pass: [study](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/37028624742) and [lessons](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/37028624345).

## Hosted verification — 2026-10-03

Production deployment **`dpl_AsG7VUhR2j7udmq4UAxMaxxgkZ7V`** is READY for application commit **`31cbbc5e3cf99e8b900adbfb01a97436a6763e7f`** on `hanngubachhuu.vercel.app`. The six changed CBT/runtime assets return HTTP 200 and their fetched bytes match the local build. The real approved Admin opens H71002 with its unchanged 27 confirmed questions and published state; H80000 opens as an unpublished 14-question draft. Its protected Q11 and Q12 images actually decode at 279 × 396 and 377 × 250 px respectively, matching the supplied private PDF assets. H91002 opens with exactly six questions, code-only title, no provider branding in the editor and publication disabled; Q4 is displayed as reading aloud with a 120-second response and the actual supplied source passage. The temporary Chrome disconnection was resolved using a fresh tab in the restored Admin browser; it did not require session-token extraction or a data mutation. The ignored screenshot is `test-results/hskk/cbt-admin-H91002-draft.png`.

Anonymous hosted draft configuration/picture requests return 401 AUTH_REQUIRED. Raw server draft JSON and source-picture paths return 404. Student denial for the new picture action is verified by API tests, but a fresh real hosted Student test of that new action remains NOT TESTED. Earlier real hosted Student authoring/Storage denial evidence does not substitute for that new endpoint check.

Read-only production reconciliation before/after deployment and Admin navigation preserves all backed-up H71002 authoring, source/clip/recording Storage objects, access, session, answers and recording rows. The applied buffered-prompt migration version is `20261002154036`; it changes guarded function definitions for future starts while preserving existing immutable rows/deadlines. Speaking remains false and scheduler jobs remain zero. No new source upload, segmentation, confirmation, generated clip, learner grant, exam/session creation, result publication or RLS change is performed in this verification.

No human exam listening success, legitimate submitted BachHuu attempt, new draft readiness or official scoring accuracy is claimed from these checks.
