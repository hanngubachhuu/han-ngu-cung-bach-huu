# Hosted browser verification — synthetic canary

User authorized one bounded exception while the global Speaking setting remains false and cron remains disabled. This checkpoint is not real-course activation.

## Migration delta

New migration `20261001055453_speaking_synthetic_canary.sql` creates only the private, empty-by-default `account_internal.speaking_test_gate`: owner, attempt, question, run identity, creation time and expiry (at most four hours). The primary key binds owner/attempt/question; foreign keys require a profile and an existing submission answer. RLS is enabled with no policies and all PUBLIC/anon/authenticated/service_role table privileges revoked.

New internal `speaking_canary_allowed(uuid,uuid,uuid)` is SECURITY INVOKER with empty search_path and no client/service EXECUTE grants. It checks the exact tuple and current validity, official attempt/version references, approved synthetic student, fixed fixture course/lesson naming, question kind and server-controlled Auth app marker/email. User metadata and frontend flags cannot grant the exception.

Three existing SECURITY DEFINER functions are replaced additively with their current production definitions and only scoped gate changes; search_path and existing grants remain unchanged: recording reserve, Storage object authorization and worker eligibility. Reservation deadlines are capped by gate expiry. Owner/access/draft/deadline/question/reference/immutable object and lease checks remain mandatory. Worker claim accepts an optional recording ID filter to bound fixture processing without claiming unrelated jobs. Public RPC signatures and Storage policies stay unchanged.

No existing row, Auth configuration, global setting, schedule, applied migration or answer key is altered. No data backfill. Ordinary assignment starts remain globally gated; the disposable draft attempt is seeded explicitly, then the browser uses existing get/save/submit, recorder, reserve/upload/confirm services.

## Backup and rollback

Ignored `.cache/backups/speaking-canary-before-20261001.json` stores the exact three current function definitions and aggregate counts, not student rows or secrets; read-back passed. SHA256 `ec5f60068dc88654db014c57e68833d11ff8a4e55912730ce44901de11f2ebe5`. Previous recovery backups remain local/ignored.

Immediate revoke is deletion of the exact test gate rows. Global setting stays false. Restore prior function definitions only after fixture media/submission work is stopped; leave the empty private table/predicate in place with denied grants. Use a forward repair; no drop/reset or real data rollback.

## Fixed disposable run and browser proof plan

Run `be793026-cb25-4452-a044-ed868a6d8028`, fixture course/lesson `cp2-browser-be793026-cb25-4452-a044-ed868a6d8028`, exact two synthetic Auth identities in the temporary server manifest. Only A's designated attempt/question is allowlisted; B and A's second attempt/question are negative controls with valid fixture enrollment/access.

Temporary Admin-only tools create only those two Auth accounts (no email), provide one-time Auth challenges for genuine browser verifyOtp login on a separate Production deployment origin, and invoke the actual worker for the exact submitted recording. Passwords/service/Drive secrets remain server-side. No access or refresh token is returned by the helper or recorded in evidence. Existing Admin origin/session stays isolated from student login.

The existing browser recorder uses actual MediaRecorder with a synthetic oscillator microphone on the disposable test page; reserve, Storage upload, confirm, autosave and submission use the existing production modules and real student session. Negative browser controls check outside reserve/upload, cross owner, private keys/draft grades and prohibited mutation/worker access. Admin playback and Publish must use the ordinary Admin UI, including the browser confirmation. No SQL publication fallback counts as browser PASS.

Cleanup removes synthetic media, gate rows, FK-scoped DB fixtures and revoked Auth sessions/accounts. Compare baseline/after counts and immutable guards. Remove all temporary HTTP/UI/server fixture tools after testing. Both browser statuses remain unverified until hosted evidence is collected; no release plan for real courses is prepared yet.
