# Speaking hosted checkpoint — 2026-10-01

The actual synthetic Production pipeline passed: private Storage → native MP3 → private Google Drive → Admin playback → expiry/cleanup/history → genuine JWT A/B isolation. All disposable media, DB fixtures and both authorized Auth accounts were removed afterward. Global Speaking remains false, bucket private, cron jobs 0. This change retires the temporary smoke HTTP/UI/helper; real-course activation and scheduling are separate work.

| Check | Hosted evidence |
| --- | --- |
| MIGRATION | Fixture-only expiry/cleanup maintenance completed; no persistent schema/RLS delta; all 15 trigger definitions/states match the ignored pre-cleanup snapshot. |
| STORAGE/RLS | Two 64044-byte synthetic WAVs; positive owner reads with real JWTs; A/B cross reads, anonymous reads, list, signed URL and overwrites denied. |
| AUDIO | Each MP3 fully probed/decoded, 2 seconds/16749 bytes; repeated normalization and immutable Storage write matched. Native Chrome Admin playback reached 2/2 seconds, readyState 4, ended=true, no error. |
| DRIVE | Correct server OAuth owner and private archive folder verified; two distinct files; repeated upload reused the same identity/hash; expiry initially exactly successful uploaded_at + 7 days. No credential/JWT/signed URL returned to the browser or saved in evidence. |
| CLEANUP | Both provider deletions replayed on identical IDs; partial deletion resumed safely; both workers returned cleaned, next call idle. Storage fixture objects 0 and Drive repeated checks confirmed absence. |
| SECURITY | Real Supabase A/B JWTs: own audio/metadata allowed, cross/anonymous denied, private question/draft grade hidden, prohibited student grade/publish/question/worker actions denied. Admin MP3 allowed, raw denied. Test sessions revoked before account removal. |
| REGRESSION | Two real issues fixed and hosted flow reverified; final retirement source passes 143 full tests, lint, build and validate (69 syntax checks). CI/browser gates accompany the changes. |
| RELEASE | Synthetic checkpoint passes. Temporary bridge retired by this patch; real Speaking/scheduler remain disabled. Final deployment verification is required after this patch merges. |

Only a synthetic two-second tone was used; no learner voice or real learner fixture. Exactly two fixed Auth accounts were created without email or Auth configuration changes, with server-controlled app markers, and enrolled only in the disposable HSKK course through existing courses/enrollments/student_lesson_access.

## Scope and limitations

Global gate stayed off throughout. Raw upload and processing lease were privileged fixture bootstraps; this is **not positive hosted student reserve/upload coverage**. Actual worker conversion/state commands, Drive operations and cleanup claims ran against hosted services. Supabase remains the permission authority.

Admin used its existing browser session for playback, rubric grading and previews 70/100 and 80/100. Both grades pin question version 1 and the original rubric. Publication used the regular public RPC under authenticated role with Admin claims after those previews. Native browser confirmation automation stalled, so publication is **not claimed as hosted UI confirmation coverage**; the composed browser CI does cover save/preview/publish/regrade.

Expiry was aged only on the two archived disposable recordings. This exercises the real expiry predicate and worker; it does not claim seven days of wall-clock observation. Chromium 390/768/1366 recorder/import/layout checks are CI evidence, not Safari/iPhone or physical-device coverage.

## Fixes found during smoke

PR30 fixes unqualified data-preview selectors binding grade controls to the embedded audio element. The regression composes a real Speaking player with the Admin grading form and verifies dirty-state disabling, save, preview, publish and regrade. Hosted previews passed afterward.

PR31 fixes Storage deletion verification. The first DELETE removed the object row but a subsequent download returned old bytes, causing STORAGE_DELETE_UNCONFIRMED. Worker stopped, retained raw, scheduled retry and kept submission/grades unchanged. [Supabase documents asynchronous CDN invalidation and cacheNonce origin reads](https://supabase.com/docs/guides/storage/cdn/smart-cdn). Worker-only authenticated Storage GETs now use unique nonces/no-store. The pinned SDK wraps failed binary downloads in an HTTP Response; confirmed 404 or explicit 400/not-found are recognized, while 401/403 cannot count as absence. Six SDK integration tests cover stale cache, idempotent deletion, unresolved origin, wrapped missing, denial and identity mismatch. All 145 tests, lint, build, validate and CI passed before hosted retry.

Production deployment efe6c9f0fd572a4ba521e48371659b6f2293e92a was visibly Ready before retry. Actual retry cleaned both recordings, including the already partially deleted one, with Drive/Storage deletion replay proofs; the following claim was idle.

## History and complete fixture rollback

Before removing DB fixtures, exact scoped before/after comparison matched both submissions, snapshots/answers, original versions, timestamps, published results, 7/10 and 8/10 grades and feedback. Two recording metadata rows remained with conversion/archive facts. All 12 speaking events and 18 fixture audit rows remained, including retry_scheduled; UI showed expired audio while published 80/100, rubric 8/10 and feedback remained readable. Only after those assertions passed were the disposable DB fixtures removed in FK order, followed by both Auth accounts.

| Existing table | Before | After |
| --- | ---: | ---: |
| courses | 2 | 2 |
| lesson_content | 24 | 24 |
| profiles | 2 | 2 |
| enrollments | 4 | 4 |
| student_lesson_access | 26 | 26 |
| learning_attempts | 3 | 3 |
| lesson_assets | 36 | 36 |
| audit_logs | 12 | 12 |

Final synthetic Auth/session/course/attempt/question/provenance/recording/event/media counts 0. Bucket public=false, speaking enabled=false, cron jobs 0. No reset/drop, existing-row deletion, production migration edit, real-course grant or Auth configuration change.

The whole-data fingerprint attempt was rejected by automatic approval review for derived-data disclosure. No bypass/re-export; existing-data evidence is counts plus exact mutation scope. Byte-for-byte comparison applies only to synthetic history. Existing self_reported attempts were not converted into official results or eligibility.

## Recovery and maintenance ledger

Existing local ignored recovery backups were retained. Added schema-only guard snapshot: .cache/backups/speaking-fixture-guards-before-cleanup-20261001.json, created 2026-10-01T04:04:19.3301786Z, 15 records, JSON read-back passed, no learner rows/credentials/tokens, SHA256 ab1f9541a0311fe60422178415d181b2e575256fa640b4c00f0f3b4a38f7e741. No sensitive re-export. Raw manifest, exact SQL, evidence and screenshots remain local/ignored.

The DDL API recorded two one-off fixture maintenance entries (not feature migrations to replay on new environments):

- 20261001041239 synthetic_speaking_fixture_expiry_20261001
- 20261001043418 synthetic_speaking_fixture_cleanup_20261001

Each statement locks affected tables, temporarily suspends only named immutable user triggers, touches exact disposable IDs, restores triggers before commit and rolls back atomically on failure. RLS/grants/functions/Auth rules and persistent schema are unchanged. Exact source is in the ignored local hosted-speaking-plan.json; all 15 guard definitions/states matched afterward. Do not edit earlier applied migrations or erase maintenance history.

If a future recording fails, retain its Storage copy/history and retry with the existing lease/identity checks; use a forward fix with the gate off. Do not reset/drop or delete real attempts/grades to recover. Never infer real-course/scheduler release from this synthetic checkpoint alone.
