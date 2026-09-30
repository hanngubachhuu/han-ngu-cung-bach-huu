# REPOSITORY RECONCILIATION PLAN

Mục tiêu: tạo baseline có bằng chứng về repository hiện tại trước khi tiếp tục phát triển.

Đây là một audit/reconstruction pass, không phải refactor.

## Phase 0 — Freeze

Do not change:
- application code;
- lesson content;
- schema;
- RLS;
- private buckets;
- deployment architecture.

Chỉ cập nhật continuity report/state khi cần.

## Phase 1 — Repository inventory

Collect:
- latest main commit;
- package/runtime;
- root folders;
- source entry points;
- build scripts;
- test scripts;
- lint/validation;
- deployment workflows;
- Vercel config;
- Supabase folders/migrations;
- study data and lesson data;
- public/private asset directories.

Output:
a concise file map with purpose.

## Phase 2 — Architecture truth table

For each important statement in ARCHITECTURE.md, CODE_RULES.md, SECURITY_ARCHITECTURE.md:

- inspect the code/artifact it describes;
- record:
  VERIFIED / STALE / CONTRADICTED / UNKNOWN;
- cite file/commit evidence in the report.

Do not rewrite those documents during this pass unless Bách explicitly asks.

## Phase 3 — Lesson baseline

Choose:
- one known stable lesson;
- HSK1 Bài 4 as the private/access baseline;
- one additional private lesson;
- one HSK2 lesson representing current exercise behavior.

Trace:
manifest
→ data source
→ renderer/page
→ access check
→ exercises/questions
→ submit/completion
→ persistence.

Compare structural differences.

Important current questions:
- What exactly controls visibility?
- Is manifest visibility sufficient or only one layer?
- Which lesson schema is canonical?
- What is the working question payload shape?
- Which parts are local/static and which are Supabase-backed?

## Phase 4 — Auth and access

Trace:
signup
→ pending
→ approval
→ login
→ entitlement
→ lesson load.

Inspect:
- Supabase Auth integration;
- access queries;
- RLS policies;
- private content/storage path;
- anonymous behavior;
- authenticated-but-unapproved behavior;
- approved user behavior.

Do not modify policy.

## Phase 5 — Google Docs sync

Trace:
Google identity
→ server adapter
→ allowed fields
→ conflict/revision behavior
→ Supabase persistence
→ logging/status.

Inspect current tests and error mapping.

Verify what is actually supported versus only documented.

Do not run destructive sync operations.

## Phase 6 — Public/private deployment boundary

Verify:
- what goes into dist;
- what gets published to Vercel;
- what gets published to GitHub Pages;
- whether private lesson data/audio/video/PDF are excluded;
- whether direct URLs can bypass the intended access boundary;
- where API/server functions exist.

This phase is evidence gathering, not remediation.

## Phase 7 — Validation

Run the strongest non-destructive checks available:
- npm test;
- npm run lint;
- npm run build;
- npm run validate:study;
- targeted browser checks if the environment is available.

Record exact results, not "looks good".

## Phase 8 — Reconciliation report

Fill RECONCILIATION_REPORT.md with:
- Executive baseline;
- repository map;
- architecture truth table;
- lesson/access findings;
- Google Docs findings;
- deployment/public-private findings;
- tests;
- contradictions;
- unknowns;
- protected areas;
- recommended next action.

## Phase 9 — Update canonical state

Update:
WORK_STATE.md
PROJECT_MEMORY.md only for durable facts
DECISION_LOG.md only for actual durable decisions
BUG_LOG.md only for verified bugs
CHANGELOG_HANDOFF.md with the reconciliation milestone

Do not promote an observation to durable memory without evidence.

## Definition of done

Reconciliation is complete when a new session can answer:
- what the current stack is;
- where lessons/data live;
- how access actually works;
- where private boundaries are enforced;
- how Google Docs sync actually works;
- how deployment actually works;
- what contradicts the docs;
- what is unknown;
- what exact next action is safe.
