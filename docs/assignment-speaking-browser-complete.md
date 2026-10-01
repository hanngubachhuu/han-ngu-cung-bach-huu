# Hosted browser checkpoint completed — 2026-10-01

STUDENT BROWSER: PASS

ADMIN PUBLISH BROWSER: PASS

Production UI: PR #34, commit `58cb4b6c224da65f5774f410a2938ebd46b16d1e`, Vercel `dpl_4QxMtz7q8aceA9wLBzEmZwSe3Ar1` READY. Twelve public page/module/style parity checks passed. GitHub CI on exact head `71fe84a524ba7a336d9a6f943269fce5583dff6e` passed 146 tests, lint, build, validators and all seven browser suites. Product UI and PDF/Word review were inspected at 390/768/1366 px using local synthetic provider responses; these local checks are distinct from the hosted evidence below.

## Hosted evidence, 08:20–08:38 UTC

Exactly two authorized disposable Auth identities, no email and no Auth configuration change. Run `be793026-cb25-4452-a044-ed868a6d8028`, course/lesson `cp2-browser-be793026-cb25-4452-a044-ed868a6d8028`. The private gate allowed only A + attempt `f93985a8-0b9a-45e8-b59b-225395d4d068` + question `e477b95d-d7ac-455f-90d3-a72a0df7fd57`, expiring 10:00 UTC. Global Speaking remained false and cron jobs remained zero.

- A logged into real Supabase in a separate production deployment origin. The isolated QA host embedded the ordinary student product page and supplied WebAudio oscillator input. Actual browser MediaRecorder created 73,189 WebM bytes; the production SDK reserved, uploaded to private Storage, confirmed and autosaved them. No personal voice or real learner data was used.
- Recording `a705b07e-bb28-4e90-827c-73d6b0931808` matched owner, attempt and question version. `submission_answers.answer.recording_id`, official assignment version and immutable prompt snapshot matched. Review showed 1/1 answered; browser Submit used the ordinary confirmation dialog. State became `submitted`, source `official`, score remained null and result state remained draft.
- The bounded server worker produced a validated 72,621-byte MP3 and archived it to real private Google Drive. Conversion and Drive states became completed; `expires_at = uploaded_at + 7 days`. No Drive ID, token or signed URL was included in the student UI or evidence files.
- Admin opened the synthetic submission in the ordinary Admin UI. MP3 playback reached 9/9 seconds, readyState 4, ended=true, no decoder error. Admin saved 9/10 and feedback, previewed 90/100, then clicked Publish and confirmed the product modal. Production result revision 1 became published; the question version remained pinned. A refreshed through the product UI and read 90/100 plus the published feedback.
- Real JWT negative checks: A could not reserve against its second attempt or another question, read B's submission, read private answer keys/draft grades, mutate grade/publish/question, claim worker jobs, create signed URLs or list object metadata. The draft-grade read check was repeated after an actual draft grade existed. B could not reserve/upload outside the gate, read A's recording/submission, or download A's raw/MP3 objects. Both global sign-outs completed; anonymous reserve/audio were denied. One transient Auth fetch failure resolved by idempotent retry; server-side session counts confirmed zero.
- Scoped expiry simulation changed only the synthetic archived recording in a guarded transaction, restoring its immutable trigger before commit. The actual worker removed Storage and Drive media. Cleanup state became completed; retry returned idle. Metadata, seven recording audit events, submission, answer reference, published grade/feedback and 90/100 result remained. Admin reopened the submission and received the clear expired-audio notice while the published result remained visible.
- Fixture teardown then removed only exact synthetic rows/audits and the two Auth users. All synthetic sessions, media, recordings and gate rows were gone; no immutable guard remained disabled. No production learner rows were exported, overwritten or reset. Recovery backups and browser screenshots are local and Git-ignored.

## Before / after record counts

| Entity | Before | After |
| --- | ---: | ---: |
| courses | 2 | 2 |
| lesson_content | 24 | 24 |
| profiles | 2 | 2 |
| enrollments | 4 | 4 |
| student_lesson_access | 26 | 26 |
| learning_attempts | 3 | 3 |
| lesson_assets | 36 | 36 |
| Auth users | 2 | 2 |
| audit_logs | 12 | 12 |
| speaking_test_gate | 0 | 0 |
| speaking_recordings / private Storage objects | 0 / 0 | 0 / 0 |
| synthetic Auth sessions | 0 | 0 |
| Speaking enabled / cron jobs | false / 0 | false / 0 |

Disposable maintenance migrations only: `speaking_browser_fixture_expiry_validation` and `speaking_browser_fixture_final_cleanup`. They did not alter applied migrations or drop/reset any schema or existing production data. Temporary QA endpoint/pages/manifest/helper are retired in a separate reviewed release; the private empty gate remains denied to clients.

## Next release plan — proposed, not activated

Use one existing HSKK course and its current Auth/profiles/enrollment/lesson-access relations. Publish reviewed question/rubric versions and enable receipt only for designated pilot lessons when the user approves activation. Before receiving real audio, settle and verify the production worker trigger and cleanup scan schedule against actual hosting limits; do not activate Speaking with only a manual QA worker. Enable any scheduler only with the user's separate approval.

Then open a small pilot, check MP3 processing, private archive, Admin playback and grading against the pinned question versions, and monitor retry/error counts. Retain Storage on conversion/archive failure; start retention only after successful Drive upload. Roll back availability by disabling receipt for pilot lessons and global Speaking, preserving all submissions/grades/history and completing existing retention work safely. Broaden only after the pilot meets these checks. Physical Safari/iPhone microphone permission and codec behavior remain outside this Chrome checkpoint and need device verification before promising support there.

Local evidence: `test-results/hosted-student-{review,submitted,published}.png`, `hosted-admin-preview-playback.png`, `hosted-admin-cleanup-history.png`, `hosted-student-b-denials.png`, `hosted-browser-fixture-removed.png`, plus the existing responsive UI/import images. These files contain synthetic evidence and are ignored, never committed.

Retirement validation: 144 tests passed after removing the two temporary-helper tests; lint, full build, study validator and 30 canonical lesson validator passed. The ownership/RLS/anonymous/canary and recording state-machine tests remain in the full suite.
