# CP2 Speaking / MP3 / Drive — approved implementation

User approval supersedes the earlier proposal. Safety > quality > speed. Drive production credentials are not configured. Real-course Speaking stays disabled until the entire synthetic production pipeline passes.

## Runtime and storage

Private `speaking-private` bucket, raw <=8 MiB, recording <=6 minutes, MP3 <=3 MiB. Browser uploads only to Supabase with its JWT and a server reservation. Re-record creates a new immutable object identity. Recording has a composite FK to the exact submission answer/question version and an owner FK to the existing profiles. Existing Auth, courses, enrollments and lesson grants remain the permission authority.

FFmpeg and FFprobe 8.1.3 are pinned to BtbN monthly release `autobuild-2026-09-30-13-08`, with hardcoded SHA256 and file hashes. `npm run audio:install` verifies the downloaded archive, installs only executables/shared libraries/licenses in ignored `.cache/recording-runtime`, tests synthetic conversion, and fails closed. Linux SONAME libraries are materialized once to avoid duplicate bundle bytes. Vercel includes this directory only in the server function; `dist` excludes it. Deprecated npm binaries were removed after their actual versions proved older than current security fixes. Decoder subprocesses do not inherit server credentials, accept only local file protocols, have input/output/time limits, and validate the resulting MP3 using probe plus complete decode. Current Windows runtime: 167,299,555 bytes, real conversion verified. Linux build and actual hosted execution need independent evidence.

Primary sources: [FFmpeg downloads](https://ffmpeg.org/download.html), [security fixes](https://ffmpeg.org/security.html), [BtbN build targets and retention](https://github.com/BtbN/FFmpeg-Builds), [Vercel limits](https://vercel.com/docs/functions/limitations).

## Recording state and retention

Raw confirmation checks the Storage object size/MIME and provider-created timestamp before deadline. Submission pins the confirmed recording reference; no later upload/reference edits are accepted. Conversion completion requires validated MP3 SHA/size/duration. Admin can play a completed MP3 for a submitted answer. Raw audio is owner-only.

`uploaded_at` means **successful verified Drive upload**. Only then `expires_at = uploaded_at + interval '7 days'`. Conversion/upload retries never renew this interval. Drive failure leaves raw and MP3 in private Storage with no expiry. Access is denied at expiry; physical cleanup runs on the next successful scan. Drive, MP3 and raw deletion are identity-checked and lease-fenced; 404 means already absent, not a permission error. Metadata, submission, grades, feedback, publications and audit are retained. An unconfirmed upload or permanently failing archive requires operational review; no automatic deletion of the only copy.

The worker runs one bounded leased job per request. Service-role-only RPC and a separate constant-time worker secret protect the background endpoint. There is no caller-supplied SQL/path/URL, no long-running seven-day function, and no client delete/update permission.

## Credential checkpoint — user action required before real Drive testing

Use a dedicated **Google OAuth 2.0 Web application client** for Speaking archival and an owner-authorized offline refresh token, separate from existing Docs credentials. Permissions: `https://www.googleapis.com/auth/drive.file`, `openid`, `email`. No whole-Drive scope. Adapter verifies the owner and rejects public, domain or shared permissions. A My Drive folder must be created by/authorized to this OAuth app; an arbitrary manually created folder is not automatically accessible under drive.file. Service accounts without appropriate Workspace storage ownership are not the chosen adapter.

Enable Google Drive API in that Google Cloud project, configure OAuth consent for the owner and obtain the refresh token with offline consent using the same client. Production OAuth consent is needed for a durable token; external apps left in Testing can have expiring refresh tokens. Do not paste credentials into chat or Git. Enter these values in **Vercel project server-side Production environment secrets**:

- `SPEAKING_DRIVE_CLIENT_ID`
- `SPEAKING_DRIVE_CLIENT_SECRET`
- `SPEAKING_DRIVE_REFRESH_TOKEN`
- `SPEAKING_DRIVE_OWNER_EMAIL`
- `SPEAKING_DRIVE_FOLDER_ID` (private app-created/authorized folder)
- `SUPABASE_SERVICE_ROLE_KEY` (only for recording worker, never public)
- `SPEAKING_WORKER_SECRET` (at least 32 random characters)

Existing `SUPABASE_URL` / publishable key remain. No `VITE_`, `NEXT_PUBLIC_`, HTML or public DB secret fields. After configuration, redeploy to make server secrets available. Credential exchange/folder provisioning and real archive calls wait for this checkpoint; no credential was generated, guessed, read or configured during implementation.

## Scheduler after credential configuration and synthetic smoke

Production already has pg_cron, pg_net and Vault installed. Use Supabase Cron to POST `/api/recordings?action=work` on a five-minute schedule, with a dedicated bearer secret retrieved from Vault. No schedule or Vault secret has been created yet. Do not choose Vercel Cron until the actual project plan supports the needed frequency; the existing Hobby restriction is insufficient. Never put the literal secret into cron SQL or logs. Drain volume and concurrency must be measured before real-course enablement; one bounded job per scan is the initial conservative throughput.

## Deployment gate and rollback

Exact additive schema/RLS/backup/rollback is in `assignment-cp2-migrations.md`. Ship compatible loader/API before enabling access. Native runtime health is authenticated Admin-only and uses synthetic audio; it does not prove Drive or end-to-end pipeline readiness. Keep `speaking_settings.enabled=false` until real synthetic Storage -> conversion -> Drive -> playback -> cleanup and history preservation pass.

Disable new Speaking starts through the gate, suspend new worker claims if needed, retain readonly history and required cleanup. Restore old functions from the ignored schema supplement only when the new functionality is disabled and no new imported/submitted data depends on it; otherwise use a forward migration. Never drop/reset or remove learners, attempts, grades, contexts or media to roll back. Existing Docs OAuth is preserved.

## Verification boundaries

Local PostgreSQL tests cover anon/A/B/Admin and service-role boundaries, no signed/list access, draft privacy, exact reference, immutability, retries, archive failure and cleanup race/history retention. Browser Chromium covers 390/768/1366, real MediaRecorder with synthetic mic, permission denial/unsupported runtime, locked MP3 playback and draft import persistence. Chromium is not Safari/iPhone evidence. Drive provider calls are mocks until owner credentials exist. Production readiness must be reported separately, never inferred from local PASS.
