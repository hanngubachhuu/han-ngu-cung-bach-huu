# Distractor Generator, provenance import and archive

This milestone extends the approved official assignment model. Foundation/editor remain PASS; the three applied migrations are unchanged. No existing Auth, enrollment, learner projection, grade publication or self_reported eligibility rule changes.

## Generator contract

Admin selects a rule/context, enters or edits the correct text, and generates three meaningful wrong choices plus the correct choice. Preview explains each wrong choice with an N-code. Regenerate rotates alternatives and answer position. Admin can edit final choices; both client and database validate the final set before a new question version is created. Changing prompt, type, context or key invalidates the current generated set in the editor. Used versions are never updated.

Version `zh-closed-1` supports MCQ with four controlled contexts: ordinary cardinal numbers 0–99, weekday names, pronouns with explicit person/number/referent, and negation of 是 with a supported subject and 老师/学生/医生. Equivalent Sunday spellings, equivalent number spellings, duplicate semantics, another correct choice, incorrect keys and meaningless choices are rejected. PostgreSQL recognizes these controlled prompts even if an Admin omits generator metadata or uses the previous question-create RPC.

This is a real rule-based generator, not universal semantic interpretation of arbitrary Chinese questions. For unsupported types or insufficient context it refuses generation and explains the missing context. Freeform authoring remains manual and requires Admin review before publishing. No AI/provider, student data or private key is sent to an external service.

## Import contract

Only JSON `hnh-question-import-v1` is accepted; never executable lesson JavaScript. A packet targets the currently selected lesson, identifies `source`, `source_identifier`, `source_revision`, and gives each question a unique `source_item_id` plus its stable `question_key`. Maximum 200 questions / 8 MiB. Open questions must reference a valid rubric. Student identity, import actor/time, existing version IDs, publication state and other authority fields cannot be supplied by the file.

Example (synthetic; replace lesson ID, source and content with an actual reviewed packet):

```json
{
  "format": "hnh-question-import-v1",
  "lesson_id": "selected_lesson_id",
  "source": {
    "source": "Admin-authored exercise",
    "source_identifier": "internal:exercise-bank-2026",
    "source_revision": "1"
  },
  "questions": [{
    "question_key": "greeting_01",
    "source_item_id": "original_question_01",
    "kind": "mcq",
    "prompt": "Khi gặp bạn vào buổi sáng, chọn lời chào.",
    "options": [{"id": "A", "text": "你好"}, {"id": "B", "text": "再见"}],
    "answer_key": {"value": "A"}
  }]
}
```

Preview uses the actual question validation path inside a rolled-back subtransaction, then stores only the private preview/request. Commit must use the identical preview payload and unchanged base versions. All questions, sources and audits commit atomically. A failed/stale packet creates no partial batch. A repeated committed packet returns the previous versions rather than adding duplicates, including after a lost response or page reload; changing the source revision allows a deliberately reviewed new import. Import creates new question versions, never updates history or auto-publishes/enables a lesson. Actual `imported_by`/`imported_at` come from the authenticated approved Admin and database timestamp.

Source metadata is immutable. Edit/copy references the parent version; subsequent versions with the same stable key also retain lineage. Historic questions with no reliable origin are labelled `legacy_unknown`, without inventing an import actor/time. The bank shows source, identifier, item, source revision, actual question version, imported actor/time and archive status. Original imports can be traced through the parent/source and import request ledger.

## Archive contract

Archive targets one question version, requires a reason and the latest archive revision, and adds an immutable event/audit. Archived versions are filtered by default and cannot join a newly created definition. Admin can show them and restore selection through a new event. A shared per-version lock serializes archive with new membership creation. Existing draft/published definition memberships, pinned submissions, answer keys and grades remain unchanged. Archive does not silently disable a lesson or replace a published definition; Admin publishes a reviewed replacement definition when needed.

## Exact additive migration delta

Local file: `20260930133835_assignment_authoring_provenance_archive.sql` (created by Supabase CLI). Deployment registry timestamp is recorded separately after apply; never repair/rewrite prior history.

- Private tables: `account_internal.assignment_question_sources`, `assignment_question_archive_events`, `assignment_authoring_requests`.
- Sources columns: question_version_id PK/FK, source, source_identifier, source_revision, source_item_id, origin, parent_version_id FK, generator JSONB, recorded_by/at, imported_by/at, import_request_id deferred FK. Length/domain checks; imported actor/time paired; import origin requires actor and request. Indexes `assignment_source_lookup` and partial `assignment_source_parent`.
- Archive columns: question_version_id FK, revision, archived, reason, actor FK, occurred_at; composite PK(question_version_id,revision), positive revision/nonempty reason.
- Request columns: id PK, actor FK, lesson_id FK, kind, payload_hash, state, expected_versions, preview, response, created_at, committed_at; kind/state domains and committed timestamp consistency. Partial unique index `assignment_import_content_once` for committed import hash; `assignment_import_history` indexes lesson/time for import history and `assignment_source_import` indexes the source's import request link.
- FKs reference existing question versions, profiles, lesson_content and the private request ledger; no second course/enrollment system.
- Functions: internal `assignment_metadata_immutable`, `assignment_rule_text`, `assignment_rule_number`, `assignment_check_generator`, `assignment_infer_generator`, `assignment_capture_source`, `assignment_archive_membership_guard`, `assignment_authoring`; public wrapper `assignment_authoring`. All have fixed empty search_path. Only the internal authoring dispatcher is SECURITY DEFINER; its first operation explicitly checks auth.uid plus the existing approved Admin predicate. Public wrapper and helpers are SECURITY INVOKER.
- Triggers: `assignment_source_immutable`, `assignment_archive_immutable` on private metadata; `assignment_source_capture` AFTER INSERT on existing question versions; `assignment_archive_membership` BEFORE INSERT on existing definition/question membership.
- RLS: enabled on all three private tables; no direct role policy. ALL table/function privileges revoked from PUBLIC/anon/authenticated. EXECUTE granted to authenticated only on internal authoring dispatcher and public invoker wrapper; student calls still fail the explicit Admin check. No SELECT/INSERT/UPDATE/DELETE grants on private tables. No old table columns, policies or grants changed. Existing learner APIs never include private provenance/generator/request JSON.
- Backfill: sources only for existing questions, preserving recorded actor/time and labelling unknown origin. No existing question/lesson/profile/enrollment/access/attempt/asset/grade row rewritten. Production preflight for this milestone: 0 question versions / 0 definitions, new metadata table absent.

## Rollout, verification and rollback

Additive DDL first, then the Admin UI: the previous question-create API remains compatible and automatically captures manual/inferred metadata. The new UI requires the new authoring RPC and fails closed if unavailable. No legacy content-access removal in this milestone. Do not use db push/reset or modify the three applied migration files.

Local verification: full generator domain (135 contexts × 12 seeds), final semantic/key validation, JSON import provenance/forged-field rejection, exact request retry, PostgreSQL role denial/private metadata, preview rollback/stale batch/atomic commit, archive history/old published student reference, exact rollback-only production smoke. Focused browser checks cover generation/edit/regenerate, key change, import lost response replay, provenance/history/archive/restore at 390/768/1366px. Normal lint/test/build/validate/CI remain release gates.

Production smoke is `supabase/operations/assignment_authoring_smoke.sql`: synthetic fixtures, existing approved identities with real DB roles and transaction-local claims; no Auth changes, every fixture/audit rolled back. This is DB-context verification, not a claim of two real student JWT browser sessions. Postflight confirms private table ACL/RLS, helper execute denial, fixed function search paths, and zero leftover fixture rows. Actual content import/assignment activation still requires the Admin to review its source packet and publish/enable deliberately.

Rollback: restore the prior Admin UI build if needed; retain all new data/history. To suspend the new writer, use an additive follow-up migration revoking EXECUTE from authenticated on both new dispatcher/wrapper. Keep private tables and source/history intact. No drop/reset, no deletion of submissions, no re-opening student key/grade access. If a trigger defect is proven, repair only that function/trigger with a new forward migration after testing; used content/grades stay immutable. The existing local backup remains ignored and is not uploaded.

Remaining work is Speaking/MP3/Drive (separate CP2), background timeout sweeper, lifecycle/graduation/certificates/public verification (CP3). Generator support beyond the four safe contexts requires new explicit rules/version and quality tests, not random fallback.
