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

`audio-transcriber.mjs` provides a timestamp-ASR adapter. `audio-segmentation.mjs` normalizes punctuation/numeral representation and aligns timestamped transcript spans against question text without changing questions. Source announcement cues are separately marked and always require review. Confidence is text-match similarity, not a calibrated speech-recognition probability. Silence alone never generates a question segment.

The transcript identifies only the announcements for questions 26/27, rather than asserting that their printed question text is spoken. Cue proposals must not be reported as two successful spoken-question matches without checking actual audio.

## Real ASR checkpoint

The user explicitly authorized sending only the original H71002 MP3 to OpenAI Audio Transcriptions. Two authorized requests returned HTTP 429; no timestamp transcript was received. There are therefore **zero verified question segments and zero Admin confirmations** from real ASR at this checkpoint. No guessed timestamps have been stored. Unit alignment tests use labelled local transcripts, not an invented transcript for H71002.

The provider-neutral adapter currently uses OpenAI `whisper-1` with `verbose_json` and word/segment timestamp requests, according to [OpenAI speech-to-text documentation](https://developers.openai.com/api/docs/guides/speech-to-text). It keeps credentials server-side and suppresses raw provider error details. `HSKK_AUTHORING_AI_ENABLED` defaults to false. A request has a bounded timeout; a resumable hosted authoring-job worker is still required if real source processing cannot fit the function budget. No progress percentages are fabricated.

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

Non-destructive rollback: disable the new authoring entry/API, leave `HSKK_AUTHORING_AI_ENABLED=false`, and revoke execution of the new authoring RPC via a follow-up migration if necessary. Keep the new private bucket, immutable source registry, saved versions and audit history. Never drop/reset old data, rewrite an applied migration, or enable Speaking as a rollback workaround.

## Evidence boundary and remaining work

- Full local tests: 158 passed after the new migration/security work. Includes owner/attempt/question binding, expiry, draft grade/result privacy and all prior recording/Drive/cleanup regressions.
- Local browser test: 390/768/1366; real MediaRecorder with a browser-provided fake microphone, second exam config, candidate/device/mic/countdown, per-question auto recording, completion. This is not hosted JWT/RLS proof and does not submit an official assignment.
- Browser Admin authoring/provider/session responses are mocked locally. Server role isolation and immutable/history constraints are tested independently with PostgreSQL roles. Hosted new authoring policies are not yet verified.
- Original source audio checksum/decode: verified locally; AI timestamp alignment of H71002: blocked by HTTP 429, not PASS.
- Existing production guard read: `speaking_settings.enabled=false`, zero scheduler jobs, new draft table absent. No real student or production fixture was modified.
- Still required: actual ASR; full-source segment review including instructions/preparation/signals/outro; all confirmed boundaries; hosted draft/source rollout after backup; durable ASR job handling if needed; production server session deadlines and generic recovery; course/lesson mapping to real existing HSKK enrollment/access; official question/rubric/version binding; full H71002 student submission and Admin Publish browser verification. No fake course/enrollment or invented rubric may replace these requirements.
- Generic manual/untimed response workflows, multi-file delivery and complete non-question audio orchestration remain future extensions; the current reference experience implements automatic timed HSKK sections. Do not claim the complete standard form definition of done from these tests.

Release is held. CI workflow includes the HSKK browser suite, but a local test run is not a remote CI result. H71002 must remain draft/unpublished until the remaining checks pass and Bách Hữu approves the real scope.
