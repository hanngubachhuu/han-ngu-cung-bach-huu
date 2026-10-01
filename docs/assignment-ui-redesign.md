# Assignment UI release — 2026-10-01

The ordinary Speaking route now uses the existing account/profile authority and submission modules. A centered exam card presents one question at a time, Chinese text in the existing sans font, progress and question navigation, recording states/timer, automatic save, replay, re-record, review, explicit confirmation and the submitted/published states. Pending recordings block navigation and submission. Failed saves retain the same recording request for retry. No fixture controls, technical identifiers, JSON or raw provider errors appear in the student page.

Admin has a responsive sidebar, overview, searchable submission table/cards, grading status filters, learner/title/time headers, authorized audio playback, editable scores/feedback, preview and an explicit Publish dialog. The exam area has status tabs, a table, course level from the existing course relation, draft creation and PDF/Word import steps. Question choice and grading-criteria adapters hide serialized fields while retaining the existing payload and immutable version rules. Structured developer import is hidden from the ordinary Admin presentation; source history is retained in the database.

## Design decisions and visual review

Reuse `study.css` cream, cinnabar, charcoal, spacing, radii, contrast and focus tokens. Remove the assignment-specific serif override in `account.css`. New `assignment.css` scopes the layout to assignment components; no new font service, theme, dependency or sitewide redesign. The mobile layout is one column with 48 px controls; tables become cards. Grading actions stay in normal flow to avoid covering score fields. Exam import keeps a desktop sticky action area and normal mobile actions.

Opened the ordinary page in Chrome and inspected actual rendered local browser images at 390, 768 and 1366 px. Adjusted mobile spacing, duplicate replay controls, Admin section order and grading action overlap after visual review. Evidence is ignored local `test-results/assignment-ui-*.png` and `cp2-import-review-*.png`, with JSON interaction results. This evidence uses synthetic provider responses and is not hosted RLS proof.

## Validation

- 146 tests passed, including complete ownership/RLS/anonymous/canary security regression.
- lint, full build, study validator and 30 canonical lesson validator passed.
- study, account, 23 protected lesson engines, assignment, authoring, PDF/Word/recorder and full Speaking product UI browser suites passed.
- Full product suite at each width: ordinary login/route, real MediaRecorder bytes, reserve/upload/confirm via SDK, autosave, replay, navigation blocking, review, Escape cancellation, submit; Admin MP3 decode, score/feedback save, Publish cancellation/confirmation, published student result. Hosted responses are mocked only in this local suite.
- PDF/Word suite: actual parser, draft reload, edit/add/remove/reorder, save; recording failure retry preserves request identity, MP3 playback, microphone denial and unsupported browser states.

## Routes, components and rollout

Changed `speaking-browser-student.html`, `tai-khoan.html` and `quan-tri.html` plus their existing module components. New `assignment-dialog.mjs` and `assignment-question-form.mjs` are presentation adapters. CI runs the additional product browser suite.

No production DB migration, gate setting, scheduler, Auth configuration, grading rule or Storage/RPC boundary changes in this UI release. Real Speaking remains disabled. Prior disposable fixture was removed before redesign: courses 2, lesson_content 24, profiles 2, enrollments 4, access 26, attempts 3, assets 36, Auth users 2, gate/recording/media 0, cron 0.

Temporary QA tools remain isolated at `speaking-browser-qa.html` and the Admin-only checkpoint route until the two missing hosted browser gaps finish. The QA host supplies synthetic audio to an iframe of the **ordinary student production page**; it does not add diagnostic controls or microphone mocks to the student module. The fixed owner/attempt/question/run and expiry remain enforced by the existing private gate and server helper. Retire these temporary routes and server helper after fixture cleanup. Do not treat UI pass as authorization to activate real courses or scheduler.

Rollback UI by reverting this release and redeploying compatible assets; do not roll back real data, reset the database or change applied migrations. For fixture recovery, retain Storage on processing failure and use the existing bounded cleanup strategy.
