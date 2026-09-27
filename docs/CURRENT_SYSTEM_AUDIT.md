# CURRENT SYSTEM AUDIT

Audit date: 2026-09-27. Scope: account experience, approval/access, personal-data sync, administration and supporting security.

## Verified baseline

- Plain multipage HTML/CSS/JavaScript and native ES modules; no React/Next/Vite. npm with committed package-lock.json. Node 24 declared. esbuild only bundles browser libraries.
- Build: render study templates → generate catalog/reference/lexicon → copy public allowlist into dist. Vercel serves dist and api/study.js; GitHub Actions also publishes dist to gh-pages. Source is main.
- UI: study/ui.mjs embeds sign-in/sign-up in the learning tools. private-lesson-loader.js duplicates authentication and loads an unpinned Supabase CDN script. No password recovery page or learner/admin dashboard.
- Data: canonical public lesson modules and private lesson_content; student_lesson_access and lesson_assets govern private content. Live aggregate audit: 24 private lessons, 24 access rows, 1 Auth user. No learner profile table or auth.users application trigger found.
- RLS: owner predicates on saved words, saved characters, readings and analysis cache. Private lesson, asset and storage reads depend on student_lesson_access. No approval lifecycle exists yet.
- Personal storage: guests use hnh_study_v1; signed-in users read/write Supabase. Switching modes does not merge guest material. There is no visible sync history or conflict check for reading updates.
- Server: api/study.js delegates AI work to server/study-service.mjs. AI is opt-in via server environment. Runtime uses caller JWT, not a service-role key.
- Frontend configuration contains a publishable key, which is intended to be public. .env.local is ignored; no secret values were copied into this audit.
- Supabase project: dmeqxdznzobbarvkmxyg, ACTIVE_HEALTHY when inspected. Google connector identity matches bachhuu1809@gmail.com. No persistent website Google Docs integration exists in the inspected source.
- Vercel discovery: project hanngubachhuu (prj_RsciottZ63A1VaHZIXqebwaGTEEB), team hanngubachhuu. Detailed environment, current deployment and Auth redirect/SMTP configuration still NOT CHECKED.

## Findings and priority

|Priority|Evidence|Action|
|---|---|---|
|P0|Live advisor and function definition: anonymous/authenticated callers can execute SECURITY DEFINER import_study_lexicon_words(), which truncates/rebuilds a corpus.|Revoke execution for browser roles; retain DBA execution. Never call the importer to test this.|
|P1|Missing approval states, administrator authority and administration UI.|Trusted database profiles; audited admin functions; per-course and per-lesson access checks.|
|P1|Duplicated login forms; no reset flow; guest and account libraries appear disconnected.|Shared account controller, dedicated account page, explicit guest import and visible sync state.|
|P1|Database migration history has 26 entries; repository initially has 5, with different timestamps.|DATABASE DRIFT: reconcile historical schema evidence and record exact deployment mappings. Do not reset or rewrite production history.|
|P2|Nine lexicon functions lack a fixed search_path; leaked-password protection is disabled.|Inspect definitions before changing search_path; document provider configuration requirements.|
|P2|Google connector access is not an OAuth credential usable by the deployed site.|Implement a separate server adapter, field allowlist, stable mapping and conflict/audit protocol; enable only after server credentials and permissions are configured.|

## Boundaries and intended design

UI → account service / learning storage → Supabase adapter → Auth/PostgreSQL/RLS. Shared lesson content remains separate from access assignments. Public learning materials remain public; an approval gate cannot retroactively make a previously public source secret.

ADMIN/STUDENT and PENDING/APPROVED/SUSPENDED/REJECTED live in protected records. Client metadata, email matching and localStorage never authorize actions. Existing granted users must retain their access during migration; new users start PENDING. Bootstrap the sole administrator only after the owner identifies the account.

Sync has separate domains: personal library across devices; guest-to-account import; optional Google management documents. Google editing must never change roles, approval, access, scores or security state. Reading/profile conflicts require versions, not blind last-write-wins.

## Evidence limits

The Facebook reference could not be fetched; no security claim is attributed to it. Supabase and OWASP primary documentation were consulted. A broad query containing account records was rejected by automatic review; the successful replacement only inspected metadata and aggregate counts. No passwords, tokens or learner records were extracted.

Production rollout requires migrations, behavior/RLS tests, build checks and live verification. Build success alone is insufficient. Remaining deployment and integration limits will be recorded in the change report.

## Implementation update (2026-09-27)

- Shared account UI, profile/dashboard, owner-only administration, course/lesson grants, versioned personal sync, private-lesson result queue, and controlled Google Docs sync are implemented locally. See architecture/auth/authorization/database/google-docs/deployment/portability documents.
- Live fixed and re-queried: importer execute=false for both browser roles; all nine previously flagged lexicon read functions now have a fixed empty search_path. Local PostgreSQL fixtures execute all nine; live sample lookup returns 学. Corpus unchanged.
- Release blocker discovered: 23 of the 24 DB-private lessons still had source content copied into the old static distribution. New build protects all 24 routes, removes private data/revision/audio files, stages 23 payloads and 33 existing audio files outside dist. HSK 2 retains its exact original LESSON data and engine. Not-yet-recorded audio placeholders remain pending, without invented audio.
- GitHub repository was verified PUBLIC. Source/history exposure persists independently of database RLS and the new dist filter. Repository privacy is an owner decision, not silently changed.
- Account and Docs migrations were applied after owner approval, a scoped backup and a local PostgreSQL restore rehearsal. Sole ADMIN bootstrap was applied after explicit account-specific confirmation; 24 prior grants remain. Google server variables and Supabase configuration were saved for Vercel Preview and Production. Real Google round trips, SMTP/redirect settings, final storage migration, production release and real-user end-to-end checks remain pending. No environment secret was inspected.
- Verification: account/private browser mocks, full study regression, PostgreSQL RLS and sync tests. Mobile study grid needed a one-column breakpoint repair; fixed and rechecked. Counts, exact results and commands are recorded in deployment.md and ignored test-results artifacts.

## Release update (2026-09-28)

- PR #19 contains the account implementation. Preview deployment D4ATBPzEdAD7P4PprZBSYgjGqG6B is READY; GitHub Actions run 36322870714 completed successfully, including browser regression checks.
- Latest verified preview: `dpl_3NNrK9XWhMyd58qGKuNzkKaN6KkG` at commit a32dd28; Actions run 36336231585 passed.
- All 33 new audio files (HSK 1 lessons 5–15) are uploaded; lesson 4's three existing files remain. Local SHA-256 matches the build manifest, and remote size/MIME/single-part multipart ETag matches local files. This does not claim a full remote download/SHA-256 check.
- The large publication body exceeded the API size limit without changing live lesson rows. Added a private staging path and atomic final publication guarded by baseline and staged-payload hashes; regressions cover incomplete/tampered staging and rollback. Applied migrations 20260927181041 and 20260927181444. Verified all 23 canonical lessons preserved, 36 audio mappings and 24 grants. Anon role reads zero private content/objects; authenticated owner claims read 24 lessons/36 assets. Stage/backup tables are not browser-readable.
- Auth provider now has minimum password length 12, secure password change, email confirmation, production Site URL and six exact production/Pages/preview redirect URLs. Anonymous sign-in and manual identity linking remain disabled. The Free dashboard requires Pro for leaked-password protection; no paid upgrade was made. Gmail SMTP was specifically approved and non-secret form fields prepared; owner credential entry/save and real email delivery remain pending.
- Local unit/PostgreSQL tests: 46/46; lint passed. Real owner login, Google round trip, email recovery and production promotion remain pending; see deployment.md for evidence boundaries.
- Google status now refreshes OAuth and verifies the designated Google identity before reporting connected. Expired/revoked credentials receive a specific administrator-facing error. This is covered by an automated regression test, not yet a real Google round trip.
