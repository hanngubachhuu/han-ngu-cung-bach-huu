# HSKK CBT reference and private practice drafts

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
