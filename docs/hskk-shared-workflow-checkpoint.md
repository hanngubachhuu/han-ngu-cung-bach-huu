# HSKK shared authoring and delivery checkpoint

Status: IMPLEMENTED LOCALLY; HOSTED THREE-LEVEL CHECKPOINT PENDING.

Baseline application: da4a57a. PR #36 stays draft and unmerged. This checkpoint implements the human's requested shared workflow, and does not supersede the verified historic H71002 submission/grade evidence.

## Admin workflow

1. Enter exam code and level, supply PDF/Word `.docx` plus MP3/MP4.
2. Read native document text or run local OCR; extract actual pictures. If there are extra embedded images, Admin chooses Q11/Q12 from those source images. Preserve uncertainty and require review.
3. Reserve/store immutable private originals. MP4 over 32 MiB uses registered, ordered, hashed parts; maximum 256 MiB. PDF/Word limit 3 MiB. MP3 limit 32 MiB. Server verifies stored original hash, extracts MP4 audio if needed, stores canonical MP3 and verifies its stored hash.
4. Persist one initial segmentation run idempotently; proposals remain NEEDS_REVIEW. An interrupted analysis is visible and can continue from the normal editor. Reloading identical original files preserves the existing canonical definition and reviews.
5. Human verifies source text/pictures/response and preparation timing, then listens to and confirms/adjusts question boundaries. The approved Admin identity/time and working fingerprint form the content-review receipt. Changed content/timing requires another receipt.
6. Create/store question audio through the normal Admin button. Every clip binds source hash, run, exact reviewed boundaries, question version and reviewer. Server readback verifies stored bytes. Partial failure reuses valid staged clips, cannot overwrite an immutable object and does not publish.
7. Existing version preparation, selected learner entitlement, runtime readiness, explicit human publication, learner device check/exam, submission, Admin playback/grading, result publication and missing-only Admin makeup operate on the same version contract for 27/14/6 questions.

## Verified local evidence

- Private supplied sources, unchanged: H71002 SHA-256 `101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0`; H80000 `312e6118cf94621cb77faa1036bfd3656b86a001a9e49c188b10aa4bddaf703c`; H91002 `97c22584156721b01276fa5a7c406c30fbab1d6b0dffbed158b26d50c0ac4b48`.
- Real local MP3 analysis produces 27/27, 14/14 and 6/6 proposals respectively, all unconfirmed. Regressions explicitly preserve adjacent elementary beeps while identifying isolated transition signals. This is source-processing evidence, not human boundary approval or hosted learner evidence.
- Real supplied scanned PDFs: local OCR reads H80000/H91002; H80000 yields the two original source pictures. OCR recognition errors remain review-required. No answer key or inferred correction is imported.
- H91002 first three measured response waits are approximately 65–70 seconds, while the initial template uses 120 seconds. Admin must verify and set the intended response timing before preparation/publication; the algorithm does not silently change it.
- PGlite tests exercise all three structures, an unseen intermediate code, immutable registered originals/chunks, review invalidation, version-pinned timing, protected pictures, Admin/Student/anonymous denial, exact submission counts and Admin processing lists. Separate intermediate/advanced makeup tests preserve accepted answers and the original session, deny Student opening makeup, and deny images outside their owned missing-question window.
- Browser tests use **isolated synthetic Auth/Storage and fake microphone input**: two-file import for all levels at 390/768/1366 px, MP4 branch, content-review gate, interrupted clip continuation and zero publication. CBT has 24 visual checks across three levels. Makeup checks include protected image loading for intermediate and audio loading for advanced. These are not real production JWT/physical microphone tests.
- Local **256/256 tests**, lint, build and study validation pass. CI/deployment state will be recorded after the release checks finish.

## Hosted checkpoint

| Check | H71002 | H80000 | H91002 |
|---|---|---|---|
| Historic actual learner completion | PASS, previous rollout | NOT TESTED | NOT TESTED |
| Current shared source import/readback | PENDING regression | NOT TESTED | NOT TESTED |
| Persisted proposals / private waveform | Historic PASS | NOT TESTED | NOT TESTED |
| Human content/timing/boundary review | Historic PASS | REQUIRED | REQUIRED |
| Stored confirmed clips/private receipt | Historic PASS | NOT TESTED | NOT TESTED |
| Hosted Student/anonymous security | Historic PASS | NOT TESTED | NOT TESTED |
| Current real full learner trial | Historic PASS | NOT TESTED | NOT TESTED |
| Admin playback/grading/makeup | Historic PASS | NOT TESTED | NOT TESTED |

Production is unchanged in this phase as of the pre-migration baseline: 54 answers, 56 recordings, 177 Storage objects, two submitted H71002 attempts; H71002 active version remains `0b3d1a53-c3d0-4d5c-a55f-3fa60ed4ccb4`, registry revision 4. Speaking false; cron jobs zero. Function OIDs/ACLs and protected row hashes have been captured for post-migration comparison. Existing authored source, learner history, answers and grades must remain byte-for-byte unchanged by the schema rollout.

Remaining required work: validate CI, migrate/deploy and verify exact live assets; import H80000/H91002 privately through the approved Admin workflow; verify stored hashes and hosted denials; obtain human review/publication; run actual owned learner trials and Admin review. Do not call this phase complete before those checks pass.
