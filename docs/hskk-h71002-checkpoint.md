# H71002 shared exam / authoring checkpoint

This is an unpublished implementation. It does not enable Speaking or create a real learner attempt. No production migration has been applied in this checkpoint.

## Source evidence

- Original exam PDF: two pages visually checked; 15 repeat questions, 10 answer questions, two long answers. About 17 minutes including seven minutes preparation.
- The file called “answers” is an audio transcript, not a scoring answer key. It supplies response windows of 7/10/90 seconds. No official rubric was invented.
- Original MP3: 18,417,371 bytes, 1,151.085688 seconds. SHA-256 `101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`. Full FFmpeg decode succeeded without modifying the original.
- Private source audio is in ignored `.cache/hskk-sources/H71002.mp3`, never in Git or `dist`. Hosted delivery will use private `hskk-authoring-sources`, separate from student recording storage. Source PDF is copied unchanged to `media/hskk/H71002.pdf` as authorized in the original import brief.
- Canonical draft content/config/provenance: `server/hskk/H71002.json`. Question version IDs are intentionally null until real assignment versions are created; they cannot be used as official recording identities. Admin preview uses explicit temporary preview identities and discards media.

## Delivered structure

`hskk.html` → three level pages → `hskk-de-thi.html?exam=H71002`. All levels share `hskk-page.mjs`. There is no practice-mode choice. The exam start button remains disabled while unpublished.

`hskk-exam-core.mjs` separates config validation, server-clock anchoring, immutable session identity, timeline, deadlines, recording reference checks and the published-result projection. `hskk-exam-engine.mjs` runs the shared automatic timed flow. `hskk-experience.mjs`, `hskk-exam-media.mjs` and `hskk-session-journal.mjs` share rendering, audio, MediaRecorder and the owner/attempt-scoped offline retry queue. Admin previews use the same experience renderer with a deliberately non-persistent adapter. Production timed exam sessions are not implemented by that adapter.

`hskk-quan-tri.html` and `hskk-admin.mjs` provide source review, question/section/timing inspection, source upload, proposed-segment review, manual boundaries, waveform, local draft export, and a versioned server-save adapter. The official source definition/timing cannot be changed through audio review. Save is disabled when the new migration is absent. Publish remains disabled.

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

## Prepared migration: 20261001100121_hskk_authoring_drafts.sql

**Not applied to production.** Local PostgreSQL/PGlite tests include this migration alongside the existing Speaking migration chain.

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

Before any production application: reconcile the new object names/bucket and deployed API, make an ignored local backup that excludes every secret/token, verify readability/counts, then apply this additive migration. This checkpoint has not made a new production backup or uploaded source audio to production.

Non-destructive rollback: disable the new authoring entry/API and revoke execution of the new authoring RPC via a follow-up migration if necessary. Keep the new private bucket, immutable source registry, saved versions and audit history. Never drop/reset old data, rewrite an applied migration, or enable Speaking as a rollback workaround.

## Evidence boundary and remaining work

- Full local tests: 172 passed after the new migration/security work. Includes owner/attempt/question binding, expiry, draft grade/result privacy and all prior recording/Drive/cleanup regressions.
- Local browser test: 390/768/1366; real MediaRecorder with a browser-provided fake microphone, second exam config, candidate/device/mic/countdown, per-question auto recording, completion. This is not hosted JWT/RLS proof and does not submit an official assignment.
- Browser Admin authoring/session responses are mocked locally. The browser suite covers local-runtime failure, successful proposals, waveform dragging, invalid timestamp errors, manual confirmation, cancelled/accepted replacement, confirm-and-next focus, unconfirmed-cue warning, blocked finalization, non-question timestamp/classification save, a new run preserving the confirmed segment, and saving both run snapshots. Server role isolation and immutable/history constraints are tested independently with PostgreSQL roles. Hosted new authoring policies are not yet verified.
- Original source audio checksum/decode and local structural segmentation: verified on the private source. Word-level alignment and Admin listening verification are not claimed.
- Existing production guard read: `speaking_settings.enabled=false`, zero scheduler jobs, new draft table absent. No real student or production fixture was modified.
- Still required: full-source segment review including instructions/preparation/signals/outro; all confirmed boundaries; hosted draft/source rollout after backup; background authoring job handling if hosted duration requires it; production server session deadlines and generic recovery; course/lesson mapping to real existing HSKK enrollment/access; official question/rubric/version binding; full H71002 student submission and Admin Publish browser verification. No fake course/enrollment or invented rubric may replace these requirements.
- Generic manual/untimed response workflows, multi-file delivery and complete non-question audio orchestration remain future extensions; the current reference experience implements automatic timed HSKK sections. Do not claim the complete standard form definition of done from these tests.

Release is held. CI workflow includes the HSKK browser suite. The real-source integration test runs only where the ignored private MP3 exists; CI explicitly skips it and runs synthetic signal tests instead. H71002 must remain draft/unpublished until the remaining checks pass and Bách Hữu approves the real scope.
