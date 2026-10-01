# H71002 shared exam / authoring checkpoint

This is an unpublished implementation. It does not enable Speaking or create a real learner attempt. The prepared authoring migration was applied on 2026-10-02 after reconciliation and a private backup; source upload and the complete hosted publishing pipeline remain blocked.

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
