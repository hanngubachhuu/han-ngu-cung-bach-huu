# HSKK shared authoring and delivery checkpoint

Status: SHARED WORKFLOW DEPLOYED; TWO HOSTED PRIVATE DRAFTS VERIFIED; STUDENT SECURITY, HUMAN REVIEW AND FULL TRIALS PENDING.

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
- Local **256/256 tests**, lint, build and study validation pass. Both CI workflows passed on implementation `9ce84ab` and deployed application `e96567f`.

## Verified hosted rollout, 2026-10-04

- Production application `e96567ff748aeeefe1ac3f7f74b13e2acc62d13f`, deployment `dpl_4fM3JXNwg4cLZYDvuPEDSXx985f7`, READY. Six served Admin/import/learner files match exact Git source. Preview initially failed because the parser include glob exceeded the Vercel schema's 256-character limit; the corrected 120-character glob preserves the worker/dependency files and builds successfully.
- Applied migration recorded by Supabase as `20261003213211 / hskk_shared_level_workflow`; local migration filename is aligned to that actual version. Immediately after DDL, protected row hashes, counts, H71002 registry/active version, accepted answers, attempts, submissions, recordings, grades/results and existing Storage policies match the pre-migration baseline. Existing function OIDs/ACLs are preserved. New picture RPCs are service-only, all five new internal tables have RLS and no anonymous/authenticated table grants, and import-originals Storage is private.
- Actual approved Admin used the normal two-file production form for **H80000.pdf + H80000.mp3** and **H91002.pdf + H91002.mp3**. Hosted PDF parsing/OCR succeeded. The workflow verifies stored document bytes, original MP3 bytes and canonical authoring-source bytes through the authenticated server before it can proceed to segmentation. Both source MP3s retain the canonical hashes and exact sizes: H80000 21,579,694 bytes; H91002 24,028,099 bytes. There is no MP3 re-encoding.
- Private stored documents: H80000 PDF 161,842 bytes, SHA-256 `723fdf912d96dce398311e5e42cc679dad33626518159aff9cc7aa5b3d64b23a`; H91002 PDF 912,105 bytes, SHA-256 `5deb12e3b7a7fcc2cd19c99de5e7d218799a3e7aea9b8ad2641f644c6370d9a1`. The identical pre-existing canonical definitions were resumed; fresh OCR did not overwrite their previously inspected text/pictures.
- H80000 persisted run `98c2d99a-1dbc-42eb-901b-5cf4044885a9`: **14 proposals, 14 NEEDS_REVIEW, 0 confirmed, 0 manually adjusted**. H91002 run `be357c29-db1c-4007-be82-fceabd62224f`: **6 proposals, 6 NEEDS_REVIEW, 0 confirmed, 0 manually adjusted**. Each draft is revision 1 with one run. Source waveforms and proposal playback work in the actual Admin interface; playback progress was observed, which does not replace human listening/boundary review.
- Anonymous production requests to configuration/audio/waveform/source/runs/proposals/audit/status/picture for all three codes return **401 AUTH_REQUIRED**. All four import actions also return 401. Direct anonymous Storage reads through both authenticated/public routes for both new MP3s in original/authoring buckets return **400 denial**, never audio. Anonymous enumeration of originals/sources/clips returns **200 with zero objects**. Actual Student-after-persistence evidence is requested separately and remains **PENDING**, not inferred from local SQL tests.
- H71002 current actual Admin screen still reports 27/27 confirmed and published. After private imports, only six new Storage objects and the two new authoring drafts differ from the baseline; all protected learner/grade/access/source-history rows remain unchanged. No new attempt/session, clip, entitlement, review confirmation or publication was created. Speaking false; cron zero.
- Hosted real files in this checkpoint are scanned PDF + MP3. Word extraction, actual MP4 decoding/immutable chunking and future-code behavior have local automated evidence; a real hosted Word/MP4 import is **NOT TESTED** here.
- Advisor comparison: five additional INFO notices correspond to intentional internal tables with RLS and no direct policies. Two new authenticated SECURITY DEFINER warnings correspond to the Admin-guarded canonical/import RPCs; their empty search paths and authorization guards were inspected. The existing leaked-password warning is unchanged. References: [internal RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER notice](https://supabase.com/docs/guides/database/database-linter?lint=0028_authenticated_security_definer_function_executable).
- Follow-up corrects the Admin label for advanced `short_response` to **Nghe và thuật lại**, without changing any question data, and aligns the migration filename to the server-recorded version. Lint/build, ten relevant Admin/shared-level/makeup tests and the 390/768/1366 px Admin browser check pass. Its exact CI/release verification follows separately; the hosted evidence above is for `e96567f`.

## Hosted checkpoint

| Check | H71002 | H80000 | H91002 |
|---|---|---|---|
| Historic actual learner completion | PASS, previous rollout | NOT TESTED | NOT TESTED |
| Current shared source import/readback | Existing source preserved; no re-upload | PASS, real hosted PDF/MP3 | PASS, real hosted PDF/MP3 |
| Persisted proposals / private waveform | Existing 27 confirmed preserved | PASS, 14 NEEDS_REVIEW | PASS, 6 NEEDS_REVIEW |
| Human content/timing/boundary review | Historic PASS | REQUIRED | REQUIRED |
| Stored confirmed clips/private receipt | Historic PASS | NOT TESTED | NOT TESTED |
| Hosted Student/anonymous security | Anonymous current PASS; Student historic PASS | Anonymous PASS; real Student PENDING | Anonymous PASS; real Student PENDING |
| Current real full learner trial | Historic PASS | NOT TESTED | NOT TESTED |
| Admin playback/grading/makeup | Historic PASS | NOT TESTED | NOT TESTED |

Protected production baseline: 54 answers, 56 recordings, two submitted H71002 attempts; H71002 active version `0b3d1a53-c3d0-4d5c-a55f-3fa60ed4ccb4`, registry revision 4. Storage increased from 177 to 183 only for the six registered H80000/H91002 original/source objects. Speaking false; cron jobs zero. Post-migration and post-import reconciliation confirms the protected existing source, learner history, answers, grades/results and access are unchanged.

Remaining required work: finish actual Student-after-persistence/private-Storage denial evidence; obtain human text/picture/timing and boundary review for both drafts; create/readback confirmed private clips; human publication/selected test entitlement; run actual owned 14/6-question learner trials and Admin playback/grading/makeup verification. Do not call this phase complete before those checks pass.
