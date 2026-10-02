# H71002 shared exam / authoring checkpoint

H71002 is unpublished. Audio authoring is complete and unchanged: 27 confirmed, Q13/Q16/Q26 manually adjusted, zero unresolved, one original run and 27 valid clips. The current official learner implementation below supersedes the earlier missing-transport audit, which is retained as history. Global Speaking and scheduler remain disabled; no real H71002 learner attempt has been created.

## Official learner implementation — 2026-10-02, from PR #36 HEAD 9d48f98

The existing courses, selected lesson access, official assignment/question versions, attempts, submission answers, private recording pipeline, teacher grading and result publication are reused. H71002 has a separate `exam-H71002` internal delivery container; existing HSK lessons and history are not converted. Intermediate and Advanced have no invented exams or grants.

Production schema reconciliation and secret-free ignored backups preceded each migration. The previously missing central registry migration and four forward HSKK migrations are applied: official delivery, sessions, guarded publication and historical session loading. Applied migrations were not rewritten. Before/after counts remain: three existing attempts, four HSK enrollments, 26 HSK lesson access rows, one private original source, authoring revision 159 and zero scheduler jobs. Backups are in ignored `test-results/hskk/` (`delivery-before-schema-backup.json`, `before-delivery-ddl.json`, `before-sessions-ddl.json`, `before-publication-ddl.json`, `before-history-ddl.json`); they contain no JWTs, credentials or signed/private URLs.

At this implementation checkpoint production registry preparation, clip storage and the selected learner grant are **pending the new deployment**. The selected real account is **BachHuu**, uniquely matched to an APPROVED STUDENT profile. Only that account is authorized for the controlled H71002 grant. No global Speaking gate or scheduler activation is used.

| Checkpoint | LOCAL evidence | HOSTED evidence |
| --- | --- | --- |
| Exam/version | PASS — existing immutable assignment/version model, idempotent preparation | Schema applied; actual registry preparation pending |
| Question versions | PASS — 27 stable UUIDs per version and immutable membership | Actual binding pending |
| Audio delivery | PASS — exact existing ZIP, each clip hash, independent stored-byte verification, current-window owner authorization | Private bucket/policies installed; actual 27-clip upload pending |
| Learner access | PASS — approved selected enrollment plus H71002-only controlled grant | BachHuu selected; actual grant pending |
| Session | PASS — real API/transport implemented, server start/deadline, ordered preflight, no live attempt before prerequisites | Real learner session NOT TESTED before manual exam publication |
| Submission | PASS — 27 owner/attempt/question-bound confirmed recordings; idempotent finish, automatic submission | Real learner submission NOT TESTED |
| Admin playback | PASS — submitted H71002 recordings use existing conversion/Drive archive/private Admin player | No real H71002 recording yet; NOT TESTED |
| Grading | PASS — existing manual grade/regrade RPC and UI | No real H71002 grading; NOT TESTED |
| Result publication | PASS — existing immutable publication; no learner score/feedback before teacher publication | No real H71002 result; NOT TESTED |

### Delivery, timing and privacy

The new same-origin `/api/hskk-session` uses Supabase Auth and the current approved Student profile; SQL independently checks selected enrollment/access, the explicit controlled grant and publication. Student projections omit original source hash/path, run/boundaries/confidence/audit, authoring revisions and audio-question transcripts. The private `hskk-prompt-clips` bucket has no Student read/list/signed-URL policy. Only the current LISTENING question of the owner's published pinned session can stream its verified clip through the server. The full original MP3 remains private authoring-only.

A preflight is separate from a live attempt. Candidate/device/microphone/readiness/structure must precede COUNTDOWN. The authoritative immutable server timeline drives recording and automatic advance. Blob sealing, owner/attempt-scoped IndexedDB durability and uploads remain queued without delaying the next question. The 30-minute upload recovery grace does not extend the exam's response windows. Duplicate retries retain one request/recording identity; rerecording is denied. HSKK-specific Storage authorization denies the owner playback of both raw and converted recordings while preserving unrelated recording behavior. Admin reads converted audio only after submission. No global worker schedule is enabled; the existing worker can process only the explicitly selected submitted H71002 recordings.

The existing teacher grade model uses an internal manual `teacher_review` criterion on its 0–10 storage scale and the existing normalized result. This is **not an asserted official HSKK scoring rubric or automatic score**. Teacher feedback alone is projected after result publication; private grade notes remain private. Existing attempts and their original question snapshots remain immutable; the account submission history links to the pinned HSKK renderer rather than the generic recorder.

The central Admin provides version preparation, upload of the existing reviewed ZIP, selected-learner grant and runtime verification. Publication validates 27 immutable UUID bindings, source/review provenance, all 27 independently verified stored clips, real approved selected access and the server runtime. The sole **LƯU & XUẤT BẢN** action calls the server gate. A browser boolean and the legacy generic publication RPC cannot bypass it. Publication is a separate manual human action and has not been performed.

### Validation scope

Full existing tests: **210/210 PASS**. The forward historical/catalog correction additionally passes the relevant four DB tests. Lint, build, study validator and all 30 canonical lessons pass. Existing HSKK and central Admin browser suites pass at 390/768/1366px. The new delivery browser check also passes at those widths: 27 recordings, automatic advance/submission, no learner recording playback controls and no overflow. Its transport and microphone are **LOCAL SYNTHETIC**; actual renderer, MediaRecorder and IndexedDB are used. It is not hosted end-to-end evidence. The actual downloaded production ZIP separately passes 27-file hash inspection without regenerating any clip.

CI and exact new production deployment evidence are recorded in the follow-up below. **STOP before automatic exam publication, real full-exam learner testing, PR merge, global Speaking or scheduler activation.** A real full-duration microphone exam, submitted Admin playback/teacher grading and published-result check remain human/hosted checks after manual H71002 publication.

## Historical official production integration audit — 2026-10-02 (Asia/Bangkok)

**BLOCKED; the user's explicit STOP conditions apply. H71002 was not published.** This follow-up starts at PR #36 HEAD `9b43944` and audits the existing production schema before any catalog/access/session mutation. Audio authoring remains complete and was not reopened or redesigned. The read-only production audit at **`2026-10-02T08:15:33.412984Z` / 15:15:33 Asia/Bangkok** still finds revision **159**, 27 verified questions, adjustments **Q13/Q16/Q26**, 27 clip provenance records and one original run. All **27 `version_id` values are still null** in this unpublished authoring draft; they are not official question-version UUIDs.

### Reusable official model and exact production blockers

1. **Official exam/version binding is absent.** Production has the existing immutable `assignment_versions`, `assignment_question_versions`, `assignment_version_questions`, `learning_attempts`, `submission_details`, answers/results/grades and `student_lesson_access` model. `courses.program` already permits HSKK, so there is no evidence that a parallel version/attempt architecture is required. However, production has neither `account_internal.admin_exams` nor `public.admin_exam_command(text,jsonb)`. The prepared local `20261001140652_central_admin_exam_workspace.sql` is absent from the applied migration history; applying it alone would still reject every HSKK publish with `HSKK_OFFICIAL_BINDING_REQUIRED`. There are zero production HSKK assignment/question versions and no active H71002 official version.
2. **Real HSKK catalog/access is absent.** Production contains only HSK level-1 and level-2 courses: zero HSKK courses, delivery containers or access rows. The three HSKK levels and draft H71002 card in `study/hskk-catalog.mjs` are a safe static listing, not a production entitlement or publication. The existing selected-content access model can be reused with an H71002 internal exam container; no HSK lesson should be converted or HSK1/HSK2 grant modified. Intermediate/advanced have no real content and none was invented.
3. **The production HSKK session transport is missing.** `study/hskk-page.mjs` renders a disabled Start button and does not mount `HSKKExamEngine`. The only provided HSKK transport is the deliberately nonpersistent `previewTransport`; the engine's production load/transition/server-clock/deadline/recording/submit/result interface has no production adapter. The existing assignment RPC pins versions and checks ownership, but does not implement the HSKK candidate/device/microphone/countdown/question timeline. There are zero HSKK attempts, submissions or recordings. Existing auto-advance/retry/journal behavior is preserved, not replaced by the legacy assignment student's replay/back/review flow.
4. **Finalized prompt-clip delivery is missing.** The 27 actual MP3s and persisted provenance from the completed audio checkpoint are valid. They currently exist as the authorized private Admin ZIP/ignored local files plus production provenance; they were not registered in a permanent production prompt-clip store. There is no authorized learner clip-delivery adapter or official question-version-to-clip binding. The authoring API remains Admin-only and cannot be reused as the learner's source/configuration provider. The source bucket remains private with exactly one unchanged source object; no original source, source hash, waveform, segmentation/audit or source path should enter the learner projection.
5. **Controlled real H71002 recording authorization and playback isolation are missing.** Production global Speaking is false, scheduler jobs are zero and the test gate is empty. The existing assignment `start` refuses Speaking questions while the global gate is off. `recording_command`/Storage writes additionally recognize only the existing synthetic canary predicate, whose exact synthetic course/Auth markers cannot authorize a real H71002 student. Those fixture markers must not be spoofed. Independently read production `speaking_object_allowed` also permits the recording owner to read raw audio and eligible MP3s; this existing generic behavior must be reconciled with HSKK's strict no-Student-recording-playback requirement before controlled activation. No gate or policy was weakened here.

The existing generic teacher-grading/result-publication model is reusable, but its Speaking question versions require rubric binding and a fixed per-question maximum. H71002 has no approved automatic scoring rubric. A future additive HSKK adapter must preserve teacher review and explicitly reconcile those constraints; it must not invent an official HSKK rubric or silently adopt the HSK written-exam default. Existing immutable snapshots/versions/results should remain the authority for historical submissions.

### Requested integration checkpoints

| Checkpoint | Status | Actual evidence / missing dependency |
| --- | --- | --- |
| Exam/version binding | **BLOCKED** | Zero official HSKK versions; all 27 authoring version IDs null; central registry/RPC not applied. |
| HSKK access | **BLOCKED** | Zero real HSKK courses, delivery containers and entitlement rows. |
| Student session | **BLOCKED** | No production HSKK transport/preflight/timeline route; Start disabled. |
| Question audio delivery | **BLOCKED** | Valid private clips/provenance exist, but no production learner delivery/binding. |
| Recording submission | **BLOCKED** | No controlled real H71002 recording gate or session-to-27-recordings submission path. |
| Admin playback of learner recordings | **NOT TESTED** | Zero real H71002 submissions/recordings. Prior Admin source/waveform playback PASS remains a separate authoring proof. |
| Teacher grading | **NOT TESTED** | Existing generic tests pass; no real H71002 submission or approved HSKK scoring configuration was created. |
| Result publication | **NOT TESTED** | No real H71002 teacher-reviewed result exists; none was published. |
| Hosted official-session security | **NOT TESTED** | No real session/access path exists to test. Prior real authoring Admin/Student/anonymous denial proof is preserved, not substituted for official-session security. |

### Hosted evidence, validation and stop

Vercel production was checked live: alias `hanngubachhuu.vercel.app` still resolves to READY production deployment `dpl_2EuaB8G6HHZXbbs7nfwYQ5qpNv82`, code commit `0e2367e25c5ac79accb901cde7c362b01db6f345`. PR code at `8a7f3d5` includes the approved student auto-advance change, but has not been deployed to production; local/CI success is not a hosted student proof. Reloading the actual authenticated Admin page succeeds and shows **Audio: 27/27 câu đã xác nhận. Đề chưa được kết nối với phiên thi chính thức.** Its publication button is disabled. No publish action was attempted.

This audit makes **zero production writes**: no migration, catalog/access seed, attempt, learner recording, submission, grade, publication, Auth change, Storage upload, policy change, source modification or scheduler/global-Speaking enablement. Current source registry/object counts are one each, bucket public=false and source object updated_at remains `2026-10-01T20:24:59.197837Z`. No historical learner row was exported or modified. Sanitized counts/schema evidence is ignored `test-results/hskk/official-integration-audit.json`; the actual Admin gate screenshot is `official-integration-admin-blocked.png`. No JWT, secret or private object URL is recorded.

Full existing local tests: **202/202 PASS, zero failures/skips**. Lint, build, `validate:study` (99 syntax checks) and all 30 canonical lesson validators PASS. Responsive HSKK and central Admin browser checks PASS at **390/768/1366px**. HSKK checks use actual MediaRecorder/IndexedDB with synthetic transport/fake microphone and explicitly report `hostedRLS=false`, `officialSubmission=false`; Admin provider responses are mocked. Exact updated-HEAD CI is reported separately with the final commit/run. No implementation, migration or fixture was changed, and no mock was presented as a real student submission.

**STOP:** both “production session transport is incomplete” and “real HSKK access model is missing” are verified. No controlled real student test can proceed yet. The next implementation must add the minimum H71002 official binding/transport/clip delivery/controlled authorization to the existing model, then verify the genuine hosted submission/playback/grading/publication path before enabling H71002. Audio authoring remains **AUDIO VERIFIED + CLIPS GENERATED: PASS**.

## Persisted human review and finalization — 2026-10-02 (Asia/Bangkok)

The human's report was independently reconciled with the immutable production draft, not used to create confirmation state. Production revision **132 before clip generation**, saved at **`2026-10-02T00:16:54.503095Z`**, contains exactly 27 questions and **27/27 verified segments, zero unresolved**. The existing validator counts verified `MANUALLY_ADJUSTED` segments as confirmed; raw statuses are 24 CONFIRMED and three MANUALLY_ADJUSTED. The actual adjusted questions are **Q13, Q16 and Q26**. They were already persisted by the real Admin before this verification; no timestamp or confirmation was rewritten here.

Every segment has the actual reviewer **`e4099061-45f0-4a9d-a501-73bcd16b069e`**, independently verified as ADMIN / APPROVED, and an individual review timestamp. Each question's last audit event is `segment_confirmed`; its recorded current segment exactly equals the presently stored segment, including boundaries, source hash, run, identity/version, reviewer and timestamp. There are 33 historical question-confirmation events because some questions were reviewed again; history is preserved rather than collapsed. The entire draft history contains 132 immutable revisions and 132 draft audit rows at this checkpoint.

The original segmentation run **`b48bd897-2c9d-4e54-9d4c-3d98530ceb26`** is the sole run and is byte-for-byte JSON-equal to its revision-1 snapshot. Source hash remains **`101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`**, source size **18,417,371 bytes**, exam version **1**. The source registry and private bucket still contain exactly one matching source/object. The exam remains a draft. Existing proposal snapshots remain NEEDS_REVIEW as immutable detection evidence; current reviewed question segments are all verified and are the authoritative finalization/clip input.

### Finalization and hosted Admin

The existing shared server validator was run read-only on the actual production revision-132 snapshot: `validateSourceReview` and `checkFinalization` both PASS. All 27 segment identities, question/exam versions, integer bounds, source identities, review metadata, ordering, durations and non-overlap pass. All 26 inter-question gaps are EXPECTED_GAP using the persisted non-question reviews; no unexplained blocking gap or automatic timestamp correction occurred.

The actual approved Admin then ran the hosted same-origin probe at **`2026-10-02T06:51:20.232Z`**. Configuration GET HTTP 200 reports revision 132, 27 questions, 27 confirmed, adjustments [13,16,26], no unresolved question and one run. Existing **POST `action=finalize` is validation-only**, returns HTTP 200, `ready=true`, `READY_FOR_PUBLISH`, revision 132 and no blocking question. This internal audio-ready status does not publish or grant official learner access. Waveform GET and production audio GET both return HTTP 200. SHA-256 over the actually downloaded production bytes matches the canonical hash and exact byte size.

The real hosted Admin page was reloaded, showing **Audio: 27/27 câu đã xác nhận**, 27 proposal cards, zero needing review and three manual adjustments. Its audio check displays “Audio đã đủ điều kiện. Đề còn cần kiểm tra các điều kiện xuất bản.” Publish remains disabled. Confirmed playback succeeds for Q1 (4.58 s), Q16 (6.8 s with the confirmed end at 326900 ms) and Q27 (6.3 s); actual displayed playhead endpoints are 88.189 s, 326.993 s and 1034.687 s, with empty player error fields. Browser stop overshoot is not a persisted boundary change.

### HSKK_SEGMENT_SECURITY after confirmation

| Security check | Result | Evidence |
| --- | --- | --- |
| Anonymous | **PASS** | Fresh production audio/waveform/source/runs/proposals/status/exam GETs at `2026-10-02T06:52:45.665Z` each return only 401 AUTH_REQUIRED. |
| Student after persistence and confirmation | **PASS** | Actual STUDENT / APPROVED session, `2026-10-02T07:05:08.774Z`: audio/waveform/source/runs/proposals/audit/status/configuration each returns 403 ADMIN_REQUIRED with no partial data. Draft/source RPCs deny; private source registry/draft/audit queries return PGRST106 and no data. Vercel independently records all eight production GETs as 403. |
| Admin after persistence and confirmation | **PASS** | Actual ADMIN / APPROVED session: hosted configuration, finalization, waveform and source reads all HTTP 200; real confirmed playback succeeds. |
| Storage private object / enumeration by Student | **PASS** | SDK download returns no bytes; bucket-root/exam-prefix listing returns zero objects. Independently scoped Supabase edge logs (`07:04:40Z–07:05:15Z`) show the authenticated object GET returned HTTP 400 JSON and both authenticated listing POSTs returned HTTP 200 JSON. The listings are filtered empty; no object name or metadata is visible. |

**HSKK_SEGMENT_SECURITY: PASS before clip generation.** The initial GitHub Pages WRONG_ORIGIN and unauthenticated Vercel AUTH_REQUIRED diagnostic stops were not substituted for this real Student result. Immediately after the Student attempts, the database still had revision 132, the same saved timestamp, 132 revisions/audit rows, one original run and zero clips; those read attempts made no data change. No broad CORS, RLS, Storage-policy or schema change was made. The real Admin was reloaded after those attempts and again played Q1/Q16/Q27 successfully before clip generation.

### Confirmed physical clips and production provenance

After the persisted-human-review, hosted-finalization and real-Student security gates passed, the actual approved Admin ran the existing **POST `action=clip&question=q1` through `q27`** implementation. Each request used the original private production source and exact persisted confirmed millisecond boundaries. A SHA-256 fingerprint of all 27 reviewed identities/bounds/statuses/reviewers/timestamps was checked before every request; it remained unchanged. No segmentation run, confirmation or boundary adjustment was created by this batch.

**27/27 real clips generated and validated, zero failed questions.** The batch completed at **`2026-10-02T07:23:54.855Z`** (14:23:54, Asia/Bangkok). Server clip provenance was stored before returning each MP3. The latest immutable draft is **revision 159**, saved at `07:23:51.986572Z`; it contains exactly 27 provenance records, one per question, bound to input draft revisions 132–158. There are 159 draft revisions and 159 draft audit rows, including 27 new clip-provenance save audits attributed to the actual approved Admin. The reviewed questions, original run, question review audit and non-question reviews are JSON-equal to revision 132. Exam status remains **draft**, audio validation status READY_FOR_PUBLISH; this does not perform publication.

The returned physical MP3s and manifest were downloaded as **`D:/download/H71002-confirmed-clips.zip`**, **2,943,900 bytes**, archive SHA-256 **`06cb7b9392646e3747de29e406abb4f58af2565c8b79cca746541158411ffe5c`**. This is an authorized Admin download, not a public asset. Each clip is also preserved in ignored `test-results/hskk/confirmed-production-clips/`; no audio was added to Git or dist and no production clip-bucket upload was performed. The existing authoring API stores provenance in immutable production draft revisions; future official storage/access/session binding is outside this checkpoint.

An independent local read of the actual downloaded ZIP verifies CRC32, exactly 27 MP3 entries plus provenance.json, nonempty bytes, MP3 codec/one audio stream, full ffmpeg decoding without error, ffprobe duration and SHA-256 for **every Q1–Q27**. All hashes match the production-persisted provenance, not just the browser report. All durations match the exact reviewed bounds within the repository's **200 ms** tolerance; maximum observed difference is **0.014 ms**. The three genuinely adjusted inputs are retained exactly:

| Question | Confirmed start_ms | Confirmed end_ms | Independent MP3 duration (seconds) |
| --- | --- | --- | --- |
| Q13 | 254180 | 259803 | 5.622993 |
| Q16 | 320100 | 326900 | 6.800000 |
| Q26 | 933805 | 939601 | 5.795986 |

Every clip records correct exam/question identity and version, exact source ID/hash, original run ID, reviewed start/end, actual reviewer/review timestamp, server creation timestamp, method `ffmpeg_atrim_confirmed_ms`, duration and clip hash. Independent reconciliation confirms all 27 downloaded manifests match their production records and expected draft-revision bindings.

**Original source: UNCHANGED.** The server hashes the private production source before every clip operation. Source registry remains the sole matching immutable record; the private bucket still contains only the original object. That object's created_at and updated_at both remain **`2026-10-01T20:24:59.197837Z`**. Source bytes/hash/size and original run remain canonical; no source transcode, truncation or replacement occurred. ffmpeg encodes the derived clips only.

After the batch the real production Admin was reloaded, still showing **Audio: 27/27 câu đã xác nhận**, 27 confirmed, zero needing review and three manual adjustments. Real Q1/Q16/Q27 confirmed playback was repeated successfully with empty player error fields; displayed playhead endpoints were 88.221 s, 326.995 s and 1034.646 s. Publication is disabled because the official exam/session binding has not been performed, not because audio remains unresolved. Ignored screenshots `confirmed-clips-admin-production-overview.png` and `confirmed-clips-admin-production.png` preserve the actual hosted Admin overview and final Q27 waveform/player state.

Ignored evidence: `production-reviewed-draft.json`, `production-reviewed-validation.json`, `production-clip-provenance.json`, `confirmed-production-clips-validation.json`, `server-clip-provenance-reconciliation.json`, the private clips/manifest, and the filtered Console scripts under `test-results/hskk/`. No JWT value, secret or private object URL is recorded in this checkpoint.

### Validation and stop

**22/22 relevant tests PASS**, including existing finalization, confirmed MP3 generation/provenance, API Student/anonymous denial before reads, immutable draft/RLS, source validation and idempotent persistence tests. Fixture clip generation is synthetic and is not a production H71002 clip. `npm run lint` and `npm run build` PASS. Relevant HSKK and Admin browser checks PASS at 390/768/1366px; the Admin check was rerun alone after an unrelated document-parser timeout during concurrent work. Existing PR CI at current code HEAD `8a7f3d5` is PASS: [study web app](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36973072400), [lesson data](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36973072427). No implementation or unrelated test changed for this verification.

**STOP — AUDIO VERIFIED + CLIPS GENERATED: PASS.** Human review 27/27 confirmed, three actually adjusted, zero unresolved; finalization PASS; HSKK_SEGMENT_SECURITY PASS; clip generation/provenance 27/27 PASS. The read/security checks made no data mutation; the subsequently authorized clip batch appended 27 immutable provenance revisions/audits. Original source **UNCHANGED**. Publication **NOT PERFORMED**. No learner access, learner session, Speaking or scheduler was enabled. Official exam/version/access/session binding is a separate later task and was not performed here.

## Student automatic advance — 2026-10-02 (Asia/Bangkok), local verification

The shared `HSKKExamEngine` retains a sealed recording Blob with its candidate, attempt, question key/version ID, numeric question version, exam version and stable request ID. It starts the existing owner/attempt-scoped IndexedDB save and upload in the background, then enters the next frame on the unchanged absolute server timeline. The recorder deadline itself triggers advancement; it does not wait for the next renderer poll, a local transaction, a successful upload or a learner click. A slow recorder seal recomputes the current frame without extending any configured response window. The final recording enters COMPLETED and retains the existing overall submission step.

Finished questions are marked answered and cannot start recording again during recovery. Concurrent deadline/render updates share one frame transition and one Blob seal. Offline/API/lost-ack failures retain the Blob and request ID; retries do not generate a new identity. Failed local transactions can retry the retained Blob. Closing the experience waits for pending local durability before closing IndexedDB, while avoiding a network wait. Recovery rejects mismatched owner, attempt, question key, question version ID, numeric question version or exam version and clears transient in-flight flags from persisted entries. Local queues remain retry storage, never an authorization or official-result source.

The learner renderer has no per-question review screen, replay/rerecord/back/download controls, recorded audio element, recorded waveform or Blob URL. Even microphone preflight checks captured bytes and the microphone level without playing the recording. Only source prompts and the device-check tone are played. During a response it shows `● Đang ghi âm…`; entering a new question focuses its title and announces the question change through the existing live region. Admin source review and submitted-recording playback remain intact.

Evidence for this change:

- **12 new engine tests PASS**, covering exact deadline/Blob/queue/automatic next/final completion, concurrent updates, slow local save, local-write retry, lost acknowledgement/stable identity, closed-view durability and six independent recovery identity mismatches.
- **202/202 full local tests PASS**, including existing PostgreSQL RLS/authorization, grading privacy, recording, conversion, Drive failure, cleanup and immutable-history regressions. Private-source tests use only the already ignored source copy; CI skips the two tests when that source is unavailable.
- **Student browser PASS at 390/768/1366px** using the actual learner renderer, real MediaRecorder with a fake browser microphone, real IndexedDB and a synthetic local transport. Two response Blobs survive simulated upload failure, the timeline completes without clicks between questions, reconnection reuses two request IDs, and the overall local simulated submission runs once. Every observed learner render has no replay/rerecord text or recording player; no learner Blob URL is created. Other owner/attempt journals return no entries. Question focus and the live announcement are asserted. This is not an official production submission or hosted JWT/RLS proof.
- **Admin playback browser PASS at 390/768/1366px**: the locked recording UI plays a synthetic validated MP3; ready media, unpaused playback and advancing playback time are asserted. The existing actual Admin submission queue/playback/grading/Publish browser integration also passes with synthetic local provider responses. Admin application playback code was not changed.
- `npm run lint`, `npm run build`, `npm run validate:study` and canonical lesson validation PASS locally. The existing PR CI workflow runs the full unit suite and these browser checks against the pushed commit; its exact run status is reported on PR #36.

Ignored evidence: `test-results/hskk/student-auto-next-tests.txt`, `test-results/hskk/browser-evidence.json`, learner screenshots and `test-results/cp2-import-browser.json`. This update makes no database/RLS/Storage/Auth/migration or production deployment change, confirms no real question boundary, and enables neither Speaking nor the scheduler. The separate hosted source-review and real Student denial checkpoint below remains pending as recorded; local learner tests do not replace it.

## Production structural segmentation — 2026-10-02 (Asia/Bangkok)

Continues PR #36 at `c6d270ff464602d2059e91ac11789060cd542c3c`. **Real production segmentation/persistence and Admin playback: PASS. Security completion is pending the real Student probe after persistence. This is not Admin verification of the boundaries.** This section supersedes the earlier zero-hosted-proposal state and waveform playback blocker. It does not supersede the human-review or publication gates.

### Real production run and immutable draft

The unchanged generic `HSKKAudioSegmentationEngine` / `local-energy-1` ran on the private production H71002 MP3 through the approved Admin's existing **Tự phân đoạn audio** workflow. No OpenAI, paid provider, H71002-specific segmentation rule, source replacement or physical clip was used. The existing `server/hskk/H71002.json` remains the canonical source configuration.

The necessary implementation at `0e2367e25c5ac79accb901cde7c362b01db6f345` connects segmentation to the existing immutable draft RPC. Hash and exact byte size are checked before analysis. Persistence completes before HTTP 200; the browser consumes the stored configuration without making a duplicate save. The default request identity includes exam code/version, canonical source hash and engine version. Explicit UUID request identities support a separately requested new run. Retries reuse the original stored run; optimistic revision conflicts preserve intervening reviews. No production schema, RLS, Storage policy or migration changed.

Production deployment **`dpl_2EuaB8G6HHZXbbs7nfwYQ5qpNv82`** is READY, target production, source `0e2367e`, and owns `hanngubachhuu.vercel.app`. It was rebuilt with Production settings from that exact Git source, excluding existing unrelated dirty Speaking files. Preview readiness was not substituted for this production deployment. [Production deployment](https://vercel.com/hanngubachhuu/hanngubachhuu/2EuaB8G6HHZXbbs7nfwYQ5qpNv82).

- Run ID: **`b48bd897-2c9d-4e54-9d4c-3d98530ceb26`**.
- Exam code/version: **H71002 / 1**; method **`structural_timing`**, engine **`local-energy-1`**.
- Run created at **`2026-10-01T21:35:26.319Z`**; immutable draft revision **1** saved at **`21:35:29.122571Z`** (04:35 on October 2, Asia/Bangkok).
- `source_audio_id`, `source_audio_hash` and analyzed `sha256`: **`101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`**. `source_audio_id` preserves the existing engine/canonical configuration's content-hash identity; it is not relabelled as the Storage registry UUID.
- Exact source size: **18,417,371 bytes**, checked by the server before engine invocation. Unrounded ffprobe duration recorded from those production bytes: **1151.085688 seconds**, exactly canonical. The server production reader uses authenticated private Storage, with local fallback disabled, and checks downloaded bytes before returning them to the engine.
- The immutable revision contains one run with all required metadata, 27 question proposals and all 46 detected non-question regions. Every proposal retains `question_id`, integer `start_ms/end_ms`, confidence, detection method, run ID and `NEEDS_REVIEW`; all 27 have non-null valid bounds. `admin_confirmed=false` for every proposal.
- Non-question regions: **45 UNKNOWN, 1 PREPARATION**. Undetected INTRO/CANDIDATE_INFO/SECTION_INTRO/TIME_WARNING/TRANSITION/OUTRO labels were not invented or forced onto uncertain regions.
- Q26 and Q27 retain **`unverified_cue`**. The real UI explicitly says these are proposed cue/transition regions and does not claim the printed PDF question was spoken.
- Exactly **one draft revision, one draft-save audit, zero question-review audit events**, zero confirmed and zero manually adjusted questions. The audit event is `draft_saved`; it is not a claim of human verification. The source registry/object remain unchanged in the existing private bucket.

| Requested checkpoint check | Result | Evidence |
| --- | --- | --- |
| Production segmentation run | **PASS** | Real approved Admin POST `/api/hskk-exams?exam=H71002&action=segment` HTTP 200; Vercel runtime records the production POST at `21:35:18Z`. Immutable Supabase revision independently contains the run. |
| Proposals | **27 / 27** | 27 structurally matched regions with valid proposed bounds; 27 proposal cards in the actual hosted Admin DOM. |
| Needs review | **27 / 27** | All proposals NEEDS_REVIEW and not admin-confirmed. |
| Confirmed | **0 / 27** | No confirmation action or confirmed question record. |
| Manually adjusted | **0 / 27** | No timestamp input, drag, replacement or manual-boundary action. |
| Source hash | **PASS** | Production bytes checked before processing; stored run analysis hash/size/duration exactly canonical. Original source not overwritten, transcoded or truncated. |
| Admin waveform playback | **PASS for actual hosted playback/seek** | Q1, Q16 and Q27 play the original production source at their proposed timestamps; moving playhead reaches the proposed endpoint, with no player error. Q1 context playback works; this is not verification that the proposal matches the intended spoken question. |
| Student denied | **NOT TESTED after persistence** | Fresh read-only real Student JWT probe requested. Earlier real Student source checks were PASS before proposals existed; those are not silently reused as a new post-persistence real-JWT result. Current local authorization/RPC tests and read-only production privilege checks PASS. |
| Anonymous denied | **PASS** | After persistence, actual anonymous audio/waveform/source/runs/proposals/status/exam GET each returns only `401 AUTH_REQUIRED`; no source, timestamp, confidence or run data. |

### Hosted Admin playback, reload and retry

The real approved Admin Chrome session was reloaded on the production origin, then opened **Đề thi → Đề thi HSKK → Sơ cấp → H71002 → Phân đoạn audio**. The workspace shows **27 câu · 27 đề xuất · 0 đã xác nhận · 27 cần kiểm tra · 0 chỉnh thủ công · 46 đoạn ngoài câu hỏi · 45 đoạn chưa phân loại**. All 27 cards have question number, proposed timestamps, structural score, automatic-method label and review status. Scores displayed are 68% for Q1–Q15, 74% for Q16–Q25, 78% for Q26–Q27; these are structural fit scores, not ASR probabilities.

Actual production-source playback observations:

- Q1: `00:01:23.480 → 00:01:28.060`; displayed playhead advances to `00:01:28.101` and stops, without error.
- Q16: `00:05:20.100 → 00:05:26.880`; seek/play succeeds and playhead reaches `00:05:26.975`, without error.
- Q27: `00:17:08.300 → 00:17:14.600`; seek/play succeeds and playhead reaches `00:17:14.634`, with the unverified-cue warning still visible.
- Q1 **Nghe ±2 giây** seeks/plays the context; the blue waveform playhead moves beyond the proposed end. The existing context action does not refresh the textual position field, so its actual moving waveform, not a stale text value, is the observed context evidence. Small playback-stop overshoots are browser scheduling observations, not revised persisted bounds.

Reload retrieves the same 27 stored proposals. Retrying the default segmentation workflow returns HTTP success with the original run; read-only database reconciliation still finds **revision 1, one run, one draft audit** and the same run ID. No duplicate draft save or segmentation run was created. There was no proposal import from the ignored local cache.

Production source Storage remains private; anon/authenticated have no direct SELECT on draft revisions/audit. The existing approved-Admin API/profile gate and RPC gate remain unchanged. Anonymous probe timestamp: **`2026-10-01T21:44:57.567Z`**; the seven denial bodies each contain only `AUTH_REQUIRED`. The private object's public URL also remains denied (HTTP 400, checked after persistence).

Ignored evidence: `test-results/hskk/segmentation-production-deployment.png`, `production-proposals-waveform.png`, `production-context-playback.png`, `segmentation-anonymous.json`, and `segmentation-student-console.js`. Browser/Console probes keep tokens inside the authenticated session/request flow; no JWT values are copied into files, logs, screenshots or this checkpoint.

### Validation and stop

**14/14 relevant existing/new tests PASS:** generic energy/duration/source checks, real local cached H71002 analysis, immutable/RLS persistence, idempotent replay, mismatch stop before processing, revision conflict preservation, unavailable-save failure and API authorization before reads. The real cached MP3 test is labelled **REAL H71002 LOCAL PRIVATE SOURCE**; its result is separate from the actual hosted production run recorded above. Persistence fixtures and browser audio are synthetic, explicitly not production audio. No synthetic success substitutes for hosted playback or security.

`npm run lint` and `npm run build`: **PASS**. Relevant HSKK and central Admin browser checks: **PASS at 390/768/1366px**. The HSKK browser check verifies that a server-persisted response does not trigger a redundant browser save; no unrelated fixtures were changed. At implementation commit `0e2367e`, [Validate study web app](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36928777296) and [Validate lesson data](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36928776520) both **PASS**, including the full committed unit suite and browser flows. CI for the documentation-only follow-up is checked against its own commit and reported separately.

**STOP.** Technical segmentation/persistence and source playback are complete. Remaining checkpoint evidence is the post-persistence real Student denial probe, requested through the actual Student Console because the browser automation surface cannot call the session module or extract JWTs. Do not bypass that tool boundary or claim the pending result PASS. All 27 questions still require Bách to listen and confirm in a later human-review step. No physical clips, confirmation, manual adjustment, learner access, learner sessions, publication, Speaking enablement or scheduler enablement occurred.

## Hosted private source — 2026-10-02 (Asia/Bangkok)

Continues PR #36 at `bf059b0da808445619880feca8433bc872eacdaa`. **Registration, upload, stored-byte integrity and hosted access: PASS. Overall requested checkpoint: NOT FULLY PASS — Admin waveform playback is blocked by the current UI's requirement for question boundaries.** No segmentation or question-boundary edit was used to bypass this limitation. This section supersedes earlier missing-source/Storage NOT TESTED entries only for the checks explicitly recorded here.

### Exact source and production storage

- Bucket: **`hskk-authoring-sources`**, `public=false`, maximum 33,554,432 bytes, MP3 MIME only. No bucket/policy change or migration was made.
- Registered and stored path: **`H71002/101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0.mp3`**. The Storage object's name exactly matches the immutable source registry's `object_path`.
- Registry ID: `32589128-d8e0-4266-8927-31c2d61803fd`; registered at `2026-10-01T20:24:53.142275Z` (03:24:53 on October 2, Asia/Bangkok). Object created at `20:24:59.197837Z`.
- Original/local and production-read byte size: **18,417,371**. SHA-256: **`101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`**. Original ffprobe duration and production-read browser metadata both report **1151.085688 seconds**, with zero observed difference; the repository's source-duration validation permits at most 500 ms difference.
- Existing hosted canonical version metadata: **`provenance.source_version="H71002"`**, exam version 1, bound to the canonical SHA-256. The registry has immutable ID/hash/path/size/Admin/timestamp identity. There is still no independent registry `source_version` column; this checkpoint verifies the existing canonical version label and immutable content identity, not a newly introduced independent source-version schema.

The existing real approved Admin Chrome session opened `quan-tri.html` → Đề thi → Đề thi HSKK → Sơ cấp → H71002 → Audio → **Tải audio nguồn**. The exact ignored `.cache/hskk-sources/H71002.mp3` was hashed/sized and inspected with ffprobe before file selection. The existing UI called `POST action=reserve_source`, then uploaded the original File through the authenticated Supabase SDK with `audio/mpeg`, `upsert=false`, `cacheControl=0`. It subsequently read the source through the authorized Admin API and displayed **“Đã tải audio vào kho riêng tư.”** No transcode or source editing occurred before storage.

| Hosted private source check | Result | Hosted evidence |
| --- | --- | --- |
| Registration | **PASS** | Real Admin reserve request HTTP 200; one registry row with exact exam/hash/path/byte size. Admin read-only `get_source` RPC independently matches the expected metadata. |
| Upload | **PASS** | One private Storage object, `audio/mpeg`, size/contentLength 18,417,371; object name exactly matches registry path. Existing Admin workflow reports success. |
| Stored hash | **PASS** | Real Admin GET `action=audio` returned production-stored bytes; browser SHA-256 over that response exactly matches the canonical hash. This is not only a local-file hash or Storage ETag comparison. |
| Admin read | **PASS** | Real ADMIN / APPROVED JWT: source API HTTP 200, full correct MP3 bytes and duration. Server validates their hash before returning them. Waveform GET HTTP 200 with 11,511 points. Actual waveform UI playback has a separate FAIL below. |
| Student denied | **PASS** | Real STUDENT / PENDING JWT: audio, waveform, source, status and exam/configuration GET each return 403 with only `ADMIN_REQUIRED`; direct existing Storage object GET returns HTTP 400 JSON, independently confirmed in Supabase edge logs, and no bytes. Source/draft RPCs return ADMIN_REQUIRED. Private registry/audit queries return PGRST106 and no data. |
| Anonymous denied | **PASS** | Audio, waveform, source, status and exam GET each return 401 with only `AUTH_REQUIRED`. The public Storage URL for the existing private object returns 400 and no audio. |
| Source immutable | **PASS for original/stored bytes and current authoring guards** | Exact original hash/size/duration preserved after upload; immutable registry trigger enabled, no authenticated Storage UPDATE/DELETE policy, upload is insert-only. No overwrite/delete attempt was made against the production original. |

### Real hosted evidence and access boundaries

The user ran the sanitized read-only Console probe in the existing Admin session and separate Chrome incognito Student session. Admin result timestamp: **`2026-10-01T20:34:40.505Z`**, independently captured from the filtered browser console; Student result: **`20:34:55.335Z`**, supplied by the user and corroborated by Vercel's live 403 requests. Tokens stayed inside the authenticated session/request flow; no token values or full private exam/audio response bodies were printed, copied to chat, written to files or captured in screenshots.

The [actual production runtime logs](https://vercel.com/hanngubachhuu/hanngubachhuu/EC2aaR727AVFpWdmAbDCbVDcbqSt/logs) show the reserve request `6vswt-1790886288745-5d481b004e6a` as **POST, `action=reserve_source`, HTTP 200**. Source request `wjhvr-1790886299286-88b13ab80018` is **GET, `action=audio`, HTTP 200**, with the actual path **Vercel handler → Supabase Auth/user → profiles → hskk_authoring_draft get_source → authenticated Storage object GET**. The server's production reader does not fall back to the ignored local MP3 and hashes downloaded bytes before returning them. The subsequent independent Admin probe recalculated that response's SHA-256 and decoded its duration.

Student checks exercise both the Admin API and the actual existing Storage object. The Student could not obtain source bytes, waveform, segmentation/exam metadata, source path/registry or review audit through these reads. PGRST106 means `account_internal` is not an exposed REST schema; read-only SQL additionally verifies that anon/authenticated lack direct SELECT privileges on the source registry/audit tables. The guarded read-only `get_source` and `get` RPCs independently reject this real Student JWT. The SDK error did not expose an HTTP status in the inspected fields, so its generic error was corroborated separately: Supabase edge logs for `20:34:45Z–20:35:05Z` record one authenticated GET to the exact object path with **HTTP 400**, `application/json; charset=utf-8`. The accompanying unauthenticated OPTIONS 200 is transport evidence, not object access. The log query selected only method, path, status, content type, authentication-presence boolean and aggregate count; no token/session/user identifier values were selected. No synthetic role test or network error is substituted for that actual-session Storage denial.

The public URL denial was an access test, not source publication. The MP3 remains ignored/untracked, absent from `dist`, and stored only in the existing private source bucket. Read-only final reconciliation finds **one matching registry row, one matching object, zero H71002 draft revisions and zero review audit rows**. Only the authorized source registration and object upload changed production application data in this task.

### Admin browser result and proposal state

**Upload/retrieve in the real Admin browser: PASS. Waveform API: PASS. Playback within the existing Admin waveform UI: FAIL / BLOCKED.** Opening Câu 1 and pressing **Nghe đoạn** shows “Chưa có ranh giới hợp lệ. Nhập thời gian hợp lệ trước khi nghe hoặc chỉnh.” The UI's segment player requires start/end values and has no independent full-source playback control. No field was entered, boundary changed, confirmation clicked or test-only boundary persisted. The initial waveform-unavailable notice was from the pre-upload request; the later real Admin waveform request succeeds. That successful API response does not prove working playback in the current UI.

**Local review is unchanged: 27 proposals, 0 confirmed, 0 manually adjusted**, 46 non-question proposals, 45 UNKNOWN. The actual hosted GET reports **27 questions, 0 hosted proposals, 0 confirmed, 0 manually adjusted**. The local cached proposal snapshot has not been registered as a hosted draft; a 27-question count is not reported as 27 hosted proposals. No segmentation run, proposal import or draft save was performed to populate production. Publication remains disabled.

Screenshot evidence of the actual successful private upload is ignored at `test-results/hskk/hosted-source-upload.png`. Read-only probe sources/results remain ignored under `test-results/hskk/hosted-source-console.js`, `test-results/hskk/source-anonymous-probe.mjs`, and `test-results/hskk/source-anonymous.json`; they contain no token values.

### Relevant validation and stop

**5/5 relevant existing tests PASS:** source Storage/RPC denial and immutability, official source metadata locks, canonical H71002 unchanged checksums, Admin API authorization before reads, and waveform/clip authorization gates. These are local fixtures; no hosted segment/clip request was made and no production learner session was created. `npm run lint` and `npm run build` **PASS**. Logs: ignored `test-results/hskk-source-tests.txt`, `test-results/hskk-source-build.txt`. No unrelated fixtures or existing dirty runtime edits were modified. CI for the documentation-only checkpoint commit is checked after push against that exact commit and reported separately.

**STOP after source registration/upload/access verification.** The source bytes and permissions are verified, but the full requested checkpoint is not labelled unconditionally **HOSTED PRIVATE H71002 SOURCE VERIFIED** because real Admin waveform playback did not pass. No clips, segment confirmation/manual adjustment, learner-access binding, learner sessions, publication, Speaking activation or scheduler activation was performed. The only hosted processing was the authorized read-only waveform GET; no `POST action=segment` was invoked. The current UI playback limitation and the absence of hosted proposal boundaries are recorded for a separate authorized next task.

## Hosted JWT authorization — 2026-10-02 (Asia/Bangkok)

Continues PR #36 at `39f70f667cb4fa80ac525d91683a7c5c610eae54`. **PASS: all six requested production JWT authorization probes.** This section supersedes the real-JWT NOT TESTED entries and JWT stop point in the historical routing checkpoint below. It verifies authorization on the existing production deployment, not source registration, direct Storage object access or the complete publishing pipeline. No production deployment or database change was made in this checkpoint.

### Real sessions and hosted results

The user ran the read-only GET probe in an existing authenticated Chrome Admin session and a separate Chrome incognito Student session. The probe used the application's current session, verified identity with Supabase `auth.getUser`, and read the current profile's `role,status`. The Admin was **ADMIN / APPROVED**; the existing Student was **STUDENT / PENDING**. No profile status or permission was changed. These are actual authenticated sessions, not synthetic tokens or database-role impersonation.

All requests used the same production origin, `https://hanngubachhuu.vercel.app`. Authenticated requests sent the current access token only in the Authorization header to that origin; token values were never copied into chat, logs, files, screenshots or this document. The probe printed only whitelisted result fields. The Admin output at `2026-10-01T19:48:12.960Z` was both supplied by the user and independently read from the browser's filtered console log; a repeat at `19:54:09.507Z` also passed. The Student output at `19:56:28.011Z` was supplied by the user and corroborated by the actual production runtime requests below.

| Hosted JWT authorization probe | Result | Evidence |
| --- | --- | --- |
| Anonymous status | **PASS — 401 AUTH_REQUIRED** | GET `?exam=H71002&action=status`; response contains only the error field. Direct read-only HTTP probe and both browser probes agree. |
| Admin status | **PASS — 200** | GET `?exam=H71002&action=status` with the real approved Admin JWT; `local_segmentation_enabled=true`, `external_ai_enabled=false`. Production request started at `19:48:09.638Z`. |
| Student status | **PASS — 403 ADMIN_REQUIRED** | GET `?exam=H71002&action=status` with the real Student JWT; JSON contains only `error`, no exam/source/configuration data. Production request started at `19:56:26.469Z`. |
| Admin H71002 GET | **PASS — 200** | GET `?exam=H71002` with the real approved Admin JWT; response has `exam_code=H71002` and 27 questions. Production request started at `19:48:11.440Z`; the actual editor also renders all 27 questions. |
| Student source access | **PASS — 403 ADMIN_REQUIRED** | GET `?exam=H71002&action=audio` with the real Student JWT; JSON contains only `error`. No MP3, audio URL, waveform or segmentation metadata was returned. Production request started at `19:56:28.487Z`. |
| Anonymous source access | **PASS — 401 AUTH_REQUIRED** | GET `?exam=H71002&action=audio`; response contains only the error field, with no source data. Direct read-only HTTP probe and both browser probes agree. |

The whitelisted denial bodies are exactly `{"error":"AUTH_REQUIRED"}` or `{"error":"ADMIN_REQUIRED"}`. The probe validates the expected status, error category and single-key body rather than merely accepting any 401/403 response. No POST segmentation request was invoked.

### Routing, identity, roles and Storage are separate evidence

- **Vercel routing: PASS.** Deployment `dpl_EC2aaR727AVFpWdmAbDCbVDcbqSt` remains READY, production, source `f7f24c49da41252c98438f527956cf8f7db5d1c3`, and owns the production alias. Runtime request details identify `/api/hskk-exams` as the invoked function in IAD1, with cache BYPASS and the exact exam/action query. The checkpoint head's API implementation is unchanged from this deployed source. These responses are application results, not Vercel protection redirects or edge 404s.
- **JWT identity: PASS.** The live Admin status trace shows Supabase `/auth/v1/user` followed by `/rest/v1/profiles`; the Admin H71002 GET trace additionally shows `/rest/v1/rpc/hskk_authoring_draft`. The server's `documentContext` verifies the supplied JWT with Supabase Auth before reading the current profile. The draft RPC is the read-only `get` action, not a draft save.
- **Supabase role checks: PASS for the tested identities.** The actual Admin is APPROVED and allowed; the actual Student is PENDING and denied. The Student audio trace shows only Auth/user and profiles external calls before HTTP 403, with no authoring RPC or Storage request. The handler's approved-Admin guard precedes exam/configuration/source access. The earlier SET LOCAL ROLE checks remain historical database evidence and are not substituted for these real-JWT results.
- **Storage: API source authorization PASS; direct Storage object access NOT TESTED.** The source denials prove that Student/anonymous requests cannot reach source retrieval through this API. H71002's production source is still unregistered/unuploaded, so this checkpoint does not claim an actual Admin MP3 download or direct authenticated/anonymous Storage object-policy test. No source object was created or modified.

Production runtime evidence was read from the [actual deployment logs](https://vercel.com/hanngubachhuu/hanngubachhuu/EC2aaR727AVFpWdmAbDCbVDcbqSt/logs), including Admin status request `z8xc7-1790884089638-8410150a5fd7`, Admin exam request `snlpg-1790884091440-607e0cad9831`, Student status request `5hr75-1790884586469-44b33aa05832`, and Student audio request `5hr75-1790884588487-2675d53d54af`. Only non-secret request metadata and external-call paths were inspected; Authorization/cookie values and full exam/source response bodies were not recorded.

### Hosted Admin page and limits

The real production Admin was opened through `quan-tri.html` → **Đề thi → Đề thi HSKK → Sơ cấp → H71002 → Sửa đề**. **PASS for authenticated editor loading:** the page shows verified Admin access, H71002, all 27 question selectors, Q1 `太好了！` and its 7-second response window. The catalog/exam API calls succeed, with no HSKK routing 404, authentication loop or raw technical error exposed in the page. The editor remains at **0/27 confirmed** and **LƯU & XUẤT BẢN** is disabled. No input was edited or source upload initiated. An ignored screenshot records the rendered editor at `test-results/hskk/jwt-admin-editor.png`.

Existing authoring prerequisites remain visible as friendly warnings: the central saved-exam list/save connection is unavailable, and the editor's incidental source requests return **503** because no source is registered/uploaded. These are not marked as successful source delivery or complete authoring readiness. No migration or source registration was used to make the page appear ready.

**CORS unchanged.** This checkpoint uses the same-origin Vercel Admin flow. The historical GitHub Pages OPTIONS 405 is not a JWT failure and no broader CORS allowance or security relaxation was introduced.

### Validation and stop condition

`npm run lint` and `npm run build`: **PASS**. The full existing working-directory test run: **187 tests, 184 passed, 3 failed, 0 skipped**. The three failures remain the pre-existing untracked `tests/hskk-auto-next.test.mjs` fixtures with empty audio URLs (`INVALID_AUDIO`); no unrelated test or runtime edits were changed. Logs are ignored under `test-results/hskk-jwt-local-tests.txt` and `test-results/hskk-jwt-build.txt`.

CI at starting head `39f70f6`: [Validate study web app](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36909309300) and [Validate lesson data](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36909309234) both **PASS**. The committed suite has 182 passing tests and 2 explicitly skipped unavailable private-source tests, separate from the untracked local fixture failures. CI for this documentation update is checked against its own new commit after pushing and reported separately.

**STOP: the requested hosted JWT authorization checkpoint is PASS.** No production data was changed by this checkpoint: no database write/migration, source upload, segmentation, audio confirmation, clip generation, question-version binding, learner-access change, production exam session, publication, Speaking activation or scheduler change. Those later release steps remain outside this task; direct Storage/source delivery and central authoring readiness still require their own authorized work.

## HOSTED API ROUTING — 2026-10-02 (Asia/Bangkok)

Continues PR #36 at `f7f24c49da41252c98438f527956cf8f7db5d1c3`. **The production 404 is resolved. Preview: PASS for route existence. Production: PASS for route existence and actual Admin catalog/exam GET. The complete hosted JWT smoke matrix is still incomplete; do not label the full checkpoint HOSTED API ROUTING VERIFIED yet.** No H71002 upload, segmentation, confirmation, access creation, publication, Speaking activation, scheduler change or database migration was performed in this routing task. The earlier infrastructure checkpoint below is historical and is superseded here for Vercel deployment/session state.

### Root cause and minimal fix

**Classification F: production was running an older build.** Production previously pointed to deployment `dpl_Gc2zk2ywnG5N2Ch8AHc7yeRX9FLX`, commit `54e46f1da9398f577e3432ba7c87e09ed34ff6f3`. That commit has no `api/hskk-exams.js` or `server/hskk/**` (`git ls-tree` verified), so its Vercel edge returned HTTP **404**, `text/plain`, `x-vercel-error: NOT_FOUND`. The request never reached the function, Admin authorization or Supabase. An absent route (A) was the symptom of this deployment mismatch; the current PR function did not fail deployment (B), disappear during packaging (C), conflict with a rewrite (D), or return this 404 from application code (E).

After explicit user confirmation of the whole-commit production scope, Vercel redeployed the exact unchanged source of `f7f24c4`, with Production selected and build cache disabled. New deployment **`dpl_EC2aaR727AVFpWdmAbDCbVDcbqSt`**, unique URL `https://hanngubachhuu-dgbui0o2z-hanngubachhuu.vercel.app`, is **READY**, target `production`, and owns `https://hanngubachhuu.vercel.app`. Deployment commit metadata matches the requested SHA. No API implementation, route, build script, `vercel.json`, authentication guard or RLS change was needed. The only repository changes for this task are this checkpoint, a read-only hosted routing smoke script, and status assertions in the existing API test.

The initial connector deployment action was rejected by automatic approval review because deploying the whole PR changes production beyond a single API endpoint. No deployment occurred from that rejected call. The user then explicitly approved redeploying `f7f24c4` to production; the subsequent Vercel redeploy completed. Production authorization was not bypassed.

### Actual deployment artifact and request path

- Preview deployment: `dpl_Bk4m6DoQZe1gCnt7LVJxDpAKTzsQ`, `https://hanngubachhuu-a3icg298k-hanngubachhuu.vercel.app`, commit `f7f24c4`, READY. Its Vercel Resources page lists **`/api/hskk-exams`**, **Node.js 24.x**, **IAD1**, **80.7 MB**, **120 seconds**; the Output source inspector identifies it as a serverless function and links to `/api/hskk-exams`. The new production deployment's Resources page independently shows the same route/runtime/region/size/duration.
- Vercel preview build logs show `npm run audio:install`, conversion `passed`, runtime **8.1.3**, release `autobuild-2026-09-30-13-08`, and **179,988,843 runtime bytes**, followed by build/deployment completion. Existing `includeFiles` includes `{server/hskk/**,.cache/recording-runtime/linux-x64-8.1.3/**}`. Runtime installation/conversion and function bundle size are verified; the dashboard does not expose the per-file Lambda archive, so FFmpeg inclusion is supported by these build/configuration checks rather than a downloaded archive inventory. No hosted FFmpeg execution or source processing was triggered.
- Real Admin catalog and H71002 GET render the private canonical 27-question exam, proving `server/hskk/H71002.json` is available to the deployed function. The original MP3 remains absent from the private source bucket; an incidental source GET from the editor returns 503, not a routing 404. This source prerequisite is outside the routing fix.
- `build-web.mjs` removes only its fixed `dist` output and copies a public allowlist; API/server sources stay outside public assets. `outputDirectory=dist` does not hide the Vercel function, as the actual Resources listing and hosted responses demonstrate. Existing rewrites cover only `/login`, `/register`, `/admin`; none intercept `/api/hskk-exams`.
- Browser `hskkAdminRequest` resolves `./api/hskk-exams` against root-level `quan-tri.html`, sends the current session in the **Authorization: Bearer** header and uses JSON for request bodies/responses. The actual production runtime trace shows **GET /api/hskk-exams → Supabase /auth/v1/user → profiles → hskk_authoring_draft → HTTP 200** for the Admin H71002 GET. No service-role credential was introduced into the browser.
- Same-origin Vercel Admin needs no CORS preflight. The GitHub Pages fallback is a cross-origin Vercel URL; this handler has no Pages CORS allowlist and OPTIONS returns 405 by its existing method gate. Pages cross-origin authoring is not verified by this checkpoint and was not changed to address the unrelated old-build 404.

### Hosted smoke evidence

Minimal endpoint: **GET `/api/hskk-exams?exam=H71002&action=status`**.

| Probe | PR preview | Production after redeploy |
| --- | --- | --- |
| Anonymous status GET | **401 AUTH_REQUIRED**, JSON, private/no-store through the authorized Vercel connector earlier in this task. Subsequent raw requests are 302 HOST_AUTH_REDIRECT at Vercel preview protection; those do not test application authorization. | **401 AUTH_REQUIRED**, JSON, private/no-store; no 404. |
| Anonymous POST status | Raw request **302 HOST_AUTH_REDIRECT**, NOT TESTED at application layer. Local existing API test confirms 401 before file access. | **401 AUTH_REQUIRED**, JSON, private/no-store. |
| Anonymous H71002 GET | Raw request **302 HOST_AUTH_REDIRECT**, NOT TESTED at application layer. | **401 AUTH_REQUIRED**, no exam returned. |
| Anonymous source GET | Raw request **302 HOST_AUTH_REDIRECT**, NOT TESTED at application layer. | **401 AUTH_REQUIRED**, JSON, private/no-store; no source returned. |
| Invalid Bearer token | Raw request **302 HOST_AUTH_REDIRECT**, NOT TESTED at application layer. | **401 AUTH_REQUIRED**, JSON; distinct from a real student JWT. |
| Real student JWT status | **NOT TESTED**: no usable student session/JWT available to the hosted smoke runner. | **NOT TESTED**: no usable student session/JWT available to the hosted smoke runner. Prior database-role and synthetic tests are not substituted for this result. |
| Real Admin JWT status | **NOT TESTED**: the browser has an Admin session, but its normal UI does not call status and Computer Use's read-only DOM scope cannot load/call application modules. | **NOT TESTED** for the same reason. Expected flags are verified only in the local status contract test. |
| Real Admin catalog GET | **PASS**, real signed-in Admin UI loads the H71002 source catalog. HTTP 200 is implied by the response-checked browser adapter and rendered data, not directly captured in preview logs. | **HTTP 200**, confirmed in Vercel runtime log at `2026-10-01T18:39:03.617Z`, `exam=catalog&action=catalog`; real Admin UI renders the source catalog. |
| Real Admin H71002 GET | **PASS**, real signed-in Admin UI renders 27 questions, Q1 太好了！, response window 7 seconds; no publication action. | **HTTP 200**, confirmed in Vercel runtime log at `2026-10-01T18:39:05.763Z`, `exam=H71002`; auth/user/profile/draft spans and actual 27-question rendering observed. |

Production read-only HTTP report: ignored `test-results/hskk/api-routing.json`; GET/POST/invalid-token probes are real network requests. The script accepts optional `HSKK_STUDENT_JWT` and `HSKK_ADMIN_JWT` environment values, never logs JWTs or full successful exam/source bodies, and records absent credentials/protected-preview redirects as NOT TESTED. It never uploads, saves, segments, confirms or publishes. Browser sessions were used only through normal Admin navigation; no JWT/cookie was extracted, role impersonated or authentication protection disabled.

### Validation and stop point

Existing API test with added minimal-status assertions: **7/7 passed**; it checks anonymous GET/POST 401 and synthetic authorized GET 200 with exactly `{local_segmentation_enabled:true,external_ai_enabled:false}` before file access. These are local dependency-injected assertions, not hosted real-JWT evidence. ESLint, build and diff checks pass.

Complete working-directory run: **187 tests, 184 passed, 3 failed, 0 skipped** in 27.609 seconds. All three failures are in the pre-existing untracked `tests/hskk-auto-next.test.mjs` and fail `INVALID_AUDIO` on an empty fixture URL. Its test and pre-existing edits to `study/hskk-exam-core.mjs`, `study/hskk-exam-engine.mjs`, `study/hskk-experience.mjs`, plus `docs/speaking-pilot-preflight.md`, remain untouched and excluded from this commit. The committed PR has 184 tests; its prior `f7f24c4` [study app CI](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36901932497) and [lesson data CI](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36901932758) pass, with 182 passing and 2 explicitly skipped unavailable private-MP3 tests. New checkpoint-commit CI is checked separately after pushing.

**STOP HERE.** The 404 is fixed, but real Admin status and student-JWT denial still need direct hosted evidence before the complete checkpoint can be called HOSTED API ROUTING VERIFIED. No subsequent HSKK release step is authorized by this routing task. H71002 remains draft, **0/27 confirmed**, publication disabled; no learner access/attempt, clips, MP3 upload, extra migration, Speaking or scheduler activation was performed.

## Production infrastructure checkpoint — 2026-10-02 (Asia/Bangkok)

This update continues PR #36 at `3e8a9b7`. **Phase 1 is applied and verified; the remaining production pipeline is blocked. H71002 is not production-ready.** The accepted central Admin UI is unchanged. No merge, source upload, automatic confirmation, clip generation, publication, Speaking activation, Auth mutation, course/assignment creation or worker scheduling was performed.

### Backup and exact migration

Read-only reconciliation confirmed all six new authoring table/function names and the source bucket/policies were absent, while the existing profiles, courses, enrollments, lesson grants, attempts and official submission tables were present. The unchanged SQL file `supabase/migrations/20261001100121_hskk_authoring_drafts.sql` was then applied through Supabase MCP. Its SHA-256 is `054287b290343eb579b7c4ffa61f667c2e8b1f0df22e4683847b7f939df58236`. Production records the migration as **`20261001173401_hskk_authoring_drafts`**; this is the MCP application timestamp, not a rewrite of the repository migration.

- Backup: `D:\download\hsk\han-ngu-cung-bach-huu-github\.cache\backups\hskk-before-20261002.json`; 54,053 bytes; SHA-256 `eda4b52bbb79fe13ad363bac794f9675f85869460b6ebc1fbb7ffaaaa38942fd`.
- Capture time: `2026-10-01T17:33:06.929725Z` (2026-10-02 in Asia/Bangkok). JSON read-back succeeded; the file is ignored and untracked. Recursive key/value scanning found zero secret/token candidates.
- Scope: current public learner profiles, enrollments, lesson grants, attempts, official submission/answer/result/grade rows, assignment activation, Speaking flag, Storage bucket configuration/policies, schema reconciliation and migration inventory. Auth passwords/sessions/identities, OAuth integration credentials, environment/API/JWT secrets and audio bytes are excluded. This is a scoped pre-migration backup, not a complete database/Storage backup.
- Private post-migration evidence: `.cache/backups/hskk-authoring-after-20261002.json`; SHA-256 `d4bfe7ced099ee6aed4536b252262afbc3ed3c935f80379ebd214288fa16b34c`. Do not publish either artifact.
- Before/after comparison matched every backed-up historical row: 2 courses, 2 profiles, 4 enrollments, 26 lesson grants, 3 attempts, 0 official submissions/answers/results/grades and 0 lesson assignment activations. All **24 production lesson rows** have identical SHA-256 fingerprints. Local HSK 1/2 canonical content was not edited.
- Speaking remains `enabled=false`; cron jobs remain zero. The new source registry, source bucket objects and review revisions each contain **0 rows/objects**.

### Evidence and exact state

| Item | State | Evidence / prerequisite |
| --- | --- | --- |
| Production authoring migration | PASS | Exact prepared SQL applied; three private tables have RLS and no direct anon/authenticated SELECT grant; immutable triggers, registered-path Storage SELECT/INSERT policies and RPC exist. |
| Private source registration/upload | BLOCKED | Bucket is private, 32 MiB, MP3 only, but contains no H71002 object or source registration. Production API is absent and no usable authenticated Admin browser session was available. |
| Source version metadata | BLOCKED | The applied registry contains exam/hash/path/size/Admin/timestamp; it has no independent source-version column. Resolve with a later additive migration and canonical binding, never edit this applied migration. |
| Actual Admin verification | BLOCKED | **27 local proposals, 0 confirmed, 0 manually adjusted, 27 unresolved.** Q26/Q27 remain unverified cue proposals. No hosted review revision exists. |
| Finalization | BLOCKED | Current local gate is false; all question confirmations and required non-question review must precede finalization. |
| Physical clips | BLOCKED | Zero H71002 clips generated; confirmed boundaries and immutable source/question/exam provenance are prerequisites. |
| Official exam/question binding | BLOCKED | Canonical exam version is 1; all 27 official question-version UUIDs remain null. The private central exam registry/RPC is also absent in production. |
| HSKK catalog/access | BLOCKED | Production contains only HSK 1 and HSK 2 courses and no real HSKK access. No course/enrollment/assignment was fabricated and no HSK lesson was converted. |
| Production student session | BLOCKED | No published H71002 or production transport/version/attempt integration. The Admin preview adapter supplies no production evidence. |
| H71002 recording/submission | NOT TESTED | No H71002 learner attempt was created; no production student recording or submission was made. |
| H71002 Admin playback/grading | NOT TESTED | Requires a real persisted H71002 submission and private per-question recordings. No official automatic scoring rubric is asserted. |
| H71002 result publication | NOT TESTED | No H71002 result exists; teacher review and explicit publication are still required. |
| Hosted database authorization | PASS | Read-only transactions using existing profiles and SET LOCAL ROLE: approved Admin can call get (returns null); student receives ADMIN_REQUIRED; anon receives 42501 permission denied. These are database-role tests, not JWT/browser/Storage tests. |
| Hosted source/recording security | NOT TESTED | The actual MP3 is not uploaded. Admin download, student/other non-Admin/anon object denial and hosted recording identity/privacy remain unverified. |
| Hosted complete exam cycle | BLOCKED | Cannot proceed without source upload, human review, official bindings/access, real session/submission transport and working hosted Admin UI. |
| Publication and rollout | BLOCKED | H71002 remains draft/unpublished. Global Speaking stays off. No automatic merge or publication is authorized. |

REAL-SOURCE / LOCAL: the ignored original MP3 was rehashed and remains exactly 18,417,371 bytes with SHA-256 `101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`. The cached review reopens 27 structural proposals and 46 non-question proposals, of which 45 remain UNKNOWN. No listening verification is claimed.

HOSTED / SUPABASE: migration/read-back, historical integrity and read-only database role checks passed. HOSTED / VERCEL: production still runs `54e46f1` and `/api/hskk-exams?exam=H71002&action=source` returns **404**. The PR preview at `3e8a9b7` exists and the same unauthenticated endpoint returns **401 AUTH_REQUIRED** with private/no-store headers. These responses do not prove authenticated source playback or full student isolation.

The existing Chrome production Admin tab was selected twice through Computer Use; both attempts timed out on `Emulation.setFocusEmulationEnabled`. No session/JWT was extracted, no Admin identity was impersonated for upload and no Storage service-role shortcut was used. The dependent workflow stops here under the user's explicit instruction to stop when a production prerequisite is missing.

The Supabase security advisor reports one new WARN for authenticated execution of the public SECURITY DEFINER RPC. Its fixed search path and authoritative current approved-Admin guard were verified, including the student denial above; the warning is documented rather than reported as a clean advisor result. The three new private tables also appear as INFO for RLS without policies: their direct grants are revoked and access is intentionally via the guarded RPC. Existing leaked-password-protection WARN remains outside this change. Any refactor to a private definer plus public invoker wrapper must use a new additive migration. See [function-execution advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [RLS policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

LOCAL / SYNTHETIC: the migration authorization/immutable-history/server-save tests were rerun: **2 passed**. Full working-directory rerun: **187 tests, 184 passed, 3 failed, 0 skipped** in 36.662 seconds. The same three failures are in the pre-existing untracked `tests/hskk-auto-next.test.mjs`: its empty audio URL fails INVALID_AUDIO before the proposed auto-next scenarios execute. That fixture and the pre-existing runtime edits are preserved; this infrastructure checkpoint does not claim that proposed behavior is verified. Log: ignored `test-results/hskk-production-infrastructure-local.txt`.

CI for the prior `3e8a9b7` head was checked live: [Validate study web app](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36884431634) and [Validate lesson data](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36884431628) both passed. That committed PR set has 184 tests; CI passes 182 and explicitly skips the 2 unavailable private-source tests. These are separate from the complete dirty working directory. Prior browser provider tests are synthetic and were not rerun or promoted to hosted evidence in this infrastructure update. CI status for this documentation update must be reported against its own new commit/run.

### Remaining prerequisite order

1. Make the accepted Admin UI and HSKK API available on a controlled hosted deployment connected to this production project, reconcile/apply the separate central workspace migration when appropriate, and obtain a functioning authenticated Admin session.
2. Add the missing immutable source-version binding, register/upload the exact MP3 through the Admin-authorized path, then test actual Storage access with Admin, student, other non-Admin and anonymous identities.
3. Have Admin listen and review all 27 question boundaries and relevant non-question regions, including the Q26/Q27 cues; then run finalization and create immutable clips.
4. Complete the minimum additive official exam/question/audio/timing binding using the existing assignment/attempt/submission/grading model; establish explicit HSKK access without converting HSK lesson data.
5. Verify real server-clock sessions, scoped idempotent recording retries, persisted submission, Admin playback/grading and published-result privacy in one complete hosted Q1–Q27 cycle. Keep publication and Speaking off until the required explicit release decision.


## Source evidence

- Original exam PDF: two pages visually checked; 15 repeat questions, 10 answer questions, two long answers. About 17 minutes including seven minutes preparation.
- The file called “answers” is an audio transcript, not a scoring answer key. It supplies response windows of 7/10/90 seconds. No official rubric was invented.
- Original MP3: 18,417,371 bytes, 1,151.085688 seconds. SHA-256 `101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`. Full FFmpeg decode succeeded without modifying the original.
- Private source audio is in ignored `.cache/hskk-sources/H71002.mp3`, never in Git or `dist`. Hosted delivery will use private `hskk-authoring-sources`, separate from student recording storage. Source PDF is copied unchanged to `media/hskk/H71002.pdf` as authorized in the original import brief.
- Canonical draft content/config/provenance: `server/hskk/H71002.json`. Question version IDs are intentionally null until real assignment versions are created; they cannot be used as official recording identities. Admin preview uses explicit temporary preview identities and discards media.

## Delivered structure

`hskk.html` → three level pages → `hskk-de-thi.html?exam=H71002`. All levels share `hskk-page.mjs`. There is no practice-mode choice. The exam start button remains disabled while unpublished.

`hskk-exam-core.mjs` separates config validation, server-clock anchoring, immutable session identity, timeline, deadlines, recording reference checks and the published-result projection. `hskk-exam-engine.mjs` runs the shared automatic timed flow. `hskk-experience.mjs`, `hskk-exam-media.mjs` and `hskk-session-journal.mjs` share rendering, audio, MediaRecorder and the owner/attempt-scoped offline retry queue. Admin previews use the same experience renderer with a deliberately non-persistent adapter. Production timed exam sessions are not implemented by that adapter.

The central `quan-tri.html` editor mounts `hskk-admin.mjs` for source review, question/section/timing inspection, source upload, proposed-segment review, manual boundaries, waveform, local draft export, and a versioned server-save adapter. `hskk-quan-tri.html` is a compatibility redirect. The official source definition/timing cannot be changed through audio review. The authoring migration now exists in Supabase, but production application deployment/authenticated hosted save remain blocked. Publish remains disabled.

`audio-transcriber.mjs` is retained as an optional unused timestamp-ASR adapter. `audio-segmentation.mjs` normalizes punctuation/numeral representation and aligns timestamped transcript spans against question text without changing questions. Source announcement cues are separately marked and always require review. Confidence is text-match similarity, not a calibrated speech-recognition probability. Silence alone never generates a question segment.

The transcript identifies only the announcements for questions 26/27, rather than asserting that their printed question text is spoken. Cue proposals must not be reported as two successful spoken-question matches without checking actual audio.

## Local segmentation checkpoint — correction of direction

The primary authoring pipeline is now `HSKKAudioSegmentationEngine` in `server/hskk-audio-segmentation.mjs`. It makes no network/API call and needs no OpenAI key, quota or billing. The old timestamp transcription adapter is retained as an unconnected optional module; neither the Admin segmentation endpoint nor the CLI imports it. Earlier HTTP 429 failures are historical and no longer block segmentation.

Stages: verify SHA-256 and size; ffprobe validates MP3 streams/duration/sample rate/channels; bounded FFmpeg decodes the complete source into 8 kHz mono PCM in an exclusive temporary directory; validate decoded duration; measure RMS in 20 ms frames. Threshold is max(0.006, min(0.04, twentieth-percentile RMS × 4)). Join activity separated by at most 450 ms; discard activity shorter than 180 ms. Group measured regions separated by at most 1.8 seconds to preserve number/sentence/signal groups. Search ordered candidate chains using each configured response window, tolerating max(1.8 seconds, 20%) gap deviation and up to eight extra seconds at section transitions. Prefer the longest supported chain, then gap-fit score; equally plausible chains remain unresolved. Partial chains return null boundaries for unresolved questions. No even-duration splitting or H71002-specific branch exists.

Confidence is capped at 0.79 and measures response-gap fit: 0.79 × (1 − mean relative gap deviation). It is **not** a speech recognition probability, textual match, or verification that an energy region contains speech. Music or tones can trigger energy detection. Every local question proposal remains NEEDS_REVIEW even when all expected positions are found. Boundaries are always measured region edges. No local ASR is installed or used.

Actual private H71002 run `4224727f-efa5-48a3-b602-a518fa6f3518` processed the original 18,417,371-byte file with its unchanged source hash. **27/27 structural proposals: 15/15 + 10/10 + 2/2; 27 require review; 0 manually confirmed; 0 manually adjusted.** Source duration is 1,151.085688 seconds. Original bytes remain unchanged; no physical clips were generated. Evidence is ignored under `.cache/hskk-segmentation/<source-hash>/<run-id>.json`.

Q26/Q27 are labelled `unverified_cue`, never spoken-question text matches. Measured late activity groups are approximately 933.82–939.60 seconds and 1028.30–1034.60 seconds, separated by approximately 89/91-second response gaps. A measured silence of 512.78–933.82 seconds is a preparation candidate consistent with the configured 420 seconds. These are machine proposals from actual source processing, not Admin listening confirmations.

Unused activity and measured long gaps are preserved as non-question proposals. Long pauses consistent with preparation receive PREPARATION; speech/music without semantic evidence stays UNKNOWN. Supported classification vocabulary includes INTRO, CANDIDATE_INFO, SECTION_INTRO, QUESTION, PREPARATION, TIME_WARNING, TRANSITION, OUTRO, UNKNOWN. Without ASR or manual review the engine does **not** assert that an unknown region says a candidate's name, country, sequence number or a time warning. Exact semantic non-question classification remains an Admin review task.

Each run stores run_id, source_audio_hash, exam_code/version, created_at, method and engine_version. Runs are append-only draft snapshots. Re-runs preserve question edits and confirmed boundaries; replacing an existing boundary requires explicit browser confirmation. Manual changes set method=manual and status=MANUALLY_ADJUSTED, revoke verification until confirmation, and append before/after audit. Original proposals remain unchanged. Waveform boundary dragging and numeric inputs share this review path. Immutable database draft revisions preserve the complete saved review history.

The server API authorizes an approved Admin before reading source audio or invoking FFmpeg. Student/anonymous access remains denied. Learner runtime never imports analysis code, receives segmentation runs, or invokes the authoring service. Vercel function packaging includes the existing pinned FFmpeg runtime; hosted execution remains unverified until deployment. The existing 120-second function budget bounds authoring execution, and decode failure produces a recoverable manual-review workflow.

## Admin verification and finalization checkpoint

The review workspace now shows section/question text, proposed HH:MM:SS.mmm boundaries, duration, confidence/method/status, selected-region highlight, two draggable edges and a live playback cursor. Listen-only controls add up to two seconds before/after without changing saved boundaries. Admin may set either boundary to the playback position, restore a proposal with explicit replacement confirmation, and confirm/advance to the next unresolved question. A persistent summary counts verified, manually adjusted and unresolved questions separately. No keyboard-only operation is required.

Canonical saved coordinates are integer start_ms/end_ms. Seconds fields are a compatibility projection for the existing preview engine and must equal ms/1000 on server save. Empty/negative/sub-millisecond/reversed/out-of-source inputs are rejected visibly; stored boundaries are never silently clamped. Unconfirmed manual edits can be saved as drafts but cannot pass finalization. Non-question rows support playback, exact boundary edits, classification and before/after audit; old regions are retained.

Waveform envelopes are now generated from server PCM analysis (100 ms peak summaries). The Admin browser receives one compact envelope and uses normal audio playback; it no longer decodes the whole MP3 into a second full PCM copy. Students receive no waveform/analysis data.

`checkFinalization` runs locally and on the server. Every question needs explicit verified confirmation, accepted CONFIRMED/MANUALLY_ADJUSTED status, reviewer/time, exact question/version/exam identity, current source hash/ID and valid integer coordinates. Reverse ordering, overlaps, durations below 200 ms and unexplained large gaps block READY_FOR_PUBLISH. EXPECTED_GAP uses configured response/preparation time plus bounded announcement allowance (15 seconds within section, 60 at transitions). Larger gaps require non-question review explaining them; the checker never rewrites timing. READY_FOR_PUBLISH here means audio metadata is eligible for clip preparation, not permission to publish an exam or enable a course.

Admin-only `POST action=finalize` checks the persisted draft, not client readiness. `POST action=clip&question=<id>` rechecks the whole persisted draft, verifies exact original hash, and uses FFmpeg atrim on confirmed milliseconds. Output MP3 codec/duration and SHA are validated. Provenance (source hash, question/exam versions, exact boundaries, reviewer, source draft revision and clip hash) is appended to a new immutable draft revision before the bytes are returned. There is no clip generation on drag, no automatic batch generation, no source modification and no publication action. No H71002 clips were generated: it is not ready.

Actual private-source review test: **27 structural proposals; 27 pass basic signal/order/gap checks; 0 flagged suspicious by these rules; 27 NEEDS_REVIEW; 0 Admin confirmed; 0 manually adjusted.** This does not verify sentence content or word-level boundaries. All Q1–Q27 remain unresolved for Admin verification. Q26/Q27 show the explicit unverified-cue warning and visually separate measured cue/preparation/response-gap information from configured response duration. Evidence: ignored `test-results/hskk/real-signal-review.json`.

States are distinct: AUTOMATIC STRUCTURAL PROPOSAL is never verified; MANUALLY_ADJUSTED may still be unconfirmed; ADMIN VERIFIED requires an explicit confirmation; READY_FOR_PUBLISH requires the complete cross-question server gate. Old run snapshots and audit entries are preserved. Source changes invalidate old approvals and require a new matching run before an old proposal can be confirmed.

## Applied migration: 20261001100121_hskk_authoring_drafts.sql

**Applied to production on 2026-10-02 (Asia/Bangkok) as 20261001173401_hskk_authoring_drafts.** The exact unchanged repository SQL was used. Local PostgreSQL/PGlite tests include this migration alongside the existing Speaking migration chain; current production checks are documented at the top.

| Delta | Exact scope |
| --- | --- |
| Private source registry | `account_internal.hskk_exam_source_assets`: UUID ID, exam code, SHA-256, immutable object path, byte size, importing Admin and timestamp; unique exam/hash and path. |
| Immutable draft versions | `account_internal.hskk_exam_draft_revisions`: UUID ID, code/revision, draft configuration, source hash, prior revision FK, request UUID, input fingerprint, Admin FK/timestamp; unique request and code/revision. |
| Append-only audit | `account_internal.hskk_exam_draft_audit`: identity ID, revision FK, actual actor FK, event, prior revision FK and timestamp. |
| Storage bucket | New private `hskk-authoring-sources`, maximum 32 MiB, `audio/mpeg`; no public bucket. |
| Private table grants/RLS | RLS enabled on three new tables; no direct anon/authenticated table or sequence access. No permissive table policies. |
| Source predicate | `account_internal.hskk_source_object_allowed(text)`: SECURITY DEFINER, fixed `pg_catalog` search path, current approved Admin plus registered exact source object path. PUBLIC/anon execute revoked; authenticated execute permitted. |
| Source object policies | SELECT and INSERT only, authenticated current Admin plus registered source path and exact new bucket. No UPDATE/DELETE policy is added for this bucket. Old bucket policies are unchanged. |
| History trigger | `account_internal.hskk_draft_immutable()`: SECURITY INVOKER, fixed `pg_catalog` search path; rejects UPDATE/DELETE on all three new authoring tables. |
| RPC | `public.hskk_authoring_draft(text,jsonb)`: SECURITY DEFINER, fixed `pg_catalog` search path. `get`, `save`, `get_source`, `reserve_source` each check `auth.uid()` and existing authoritative `account_internal.is_admin()`. PUBLIC/anon execute revoked, authenticated execute granted. |
| Concurrency | Save takes an advisory transaction lock, compares expected revision, and preserves the exact request identity across retries. Conflicts do not overwrite older versions. |

No old table columns, enrollment model, Auth users, grading data, historical question versions, recording RLS, retention rules or worker scheduler are changed. There is no backfill or transformation of current learner data. No `self_reported` score becomes an official result.

The authoring migration has now completed the reconciliation, ignored scoped-backup, application and read-back checks documented above. Source audio has not been uploaded to production. The separate central workspace migration and hosted Admin/API prerequisites remain unresolved.

Non-destructive rollback: disable the new authoring entry/API and revoke execution of the new authoring RPC via a follow-up migration if necessary. Keep the new private bucket, immutable source registry, saved versions and audit history. Never drop/reset old data, rewrite an applied migration, or enable Speaking as a rollback workaround.

## Evidence boundary and remaining work

- Prior implementation checkpoint: 172 local tests passed after the initial migration/security work. Includes owner/attempt/question binding, expiry, draft grade/result privacy and prior recording/Drive/cleanup regressions. The current full working-directory count and failures are reported above.
- Local browser test: 390/768/1366; real MediaRecorder with a browser-provided fake microphone, second exam config, candidate/device/mic/countdown, per-question auto recording, completion. This is not hosted JWT/RLS proof and does not submit an official assignment.
- Browser Admin authoring/session responses are mocked locally. The browser suite covers local-runtime failure, successful proposals, waveform dragging, invalid timestamp errors, manual confirmation, cancelled/accepted replacement, confirm-and-next focus, unconfirmed-cue warning, blocked finalization, non-question timestamp/classification save, a new run preserving the confirmed segment, and saving both run snapshots. Server role isolation and immutable/history constraints are tested independently with PostgreSQL roles. Hosted schema/database role checks now pass; actual authenticated Storage/source/browser tests are still NOT TESTED.
- Original source audio checksum/decode and local structural segmentation: verified on the private source. Word-level alignment and Admin listening verification are not claimed.
- Current production guard read: `speaking_settings.enabled=false`, zero scheduler jobs; new authoring tables now exist and have no rows. No real student or production fixture was modified.
- Still required: working hosted Admin/API and source-version binding/upload; full-source segment review including instructions/preparation/signals/outro; all confirmed boundaries; authenticated hosted review saves; background authoring job handling if hosted duration requires it; production server session deadlines and generic recovery; explicit real HSKK access; official exam/question/audio/version binding; full H71002 student submission and Admin result publication browser verification. No fake course/enrollment or invented official rubric may replace these requirements.
- Generic manual/untimed response workflows, multi-file delivery and complete non-question audio orchestration remain future extensions; the current reference experience implements automatic timed HSKK sections. Do not claim the complete standard form definition of done from these tests.

Release is held. CI workflow includes the HSKK browser suite. The real-source integration test runs only where the ignored private MP3 exists; CI explicitly skips it and runs synthetic signal tests instead. H71002 must remain draft/unpublished until the remaining checks pass and Bách Hữu approves the real scope.
