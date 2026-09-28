# WORK STATE — HÁN NGỮ CÙNG BÁCH HỮU

## Snapshot

- Status: ACTIVE
- Last updated: 2026-09-28
- Current phase: REPOSITORY RECONCILIATION REQUIRED
- Current task: Phiên làm việc tiếp theo phải thực hiện một lần Repository Reconciliation đầy đủ trước khi sửa application.
- Continuity confidence: MEDIUM

## Repository baseline at installation

- Repository: hanngubachhuu/han-ngu-cung-bach-huu
- Source branch: main
- Latest source commit inspected before continuity install: f0ae3823fbda08d7c0c4bd189ed7e0d8044162ae
- Root structure observed: static HTML pages, data/, study/, server/, api/, supabase/, scripts/, tests/, admin/, audio/, sources/, and documentation/config files.
- package.json observed: Node 24.x, ESM, esbuild; build/test/lint/validate/browser-test scripts.
- Architecture docs observed: main is source, gh-pages is artifact; Vercel + Supabase are part of the current application/backend architecture.
- Current lesson/data files observed: data/lesson-manifest.js and data/lesson-registry.js.

## Last verified success

- What works: Repository is reachable and current main branch can be inspected. The continuity layer has been prepared for installation.
- Verification: GitHub repository metadata, root listing, recent commit history, package.json, ARCHITECTURE.md, SECURITY_ARCHITECTURE.md, vercel.json, lesson registry and manifest inspected.
- Evidence: commit f0ae3823fbda08d7c0c4bd189ed7e0d8044162ae and current main artifacts.

## Current unfinished state

- Symptom: continuity state has not yet been reconciled end-to-end with runtime/database/deployment evidence.
- Expected: WORK_STATE should describe the actual current architecture, lesson access model, public/private build, Supabase schema/RLS, Google Docs sync path, and deployment state.
- Actual: several high-level facts are known, but exact runtime contracts remain partially unverified.
- Scope: repository baseline only.

## Signals that MUST be resolved in reconciliation

1. lesson-registry.js reports SCHEMA_VERSION = 1 while its content preparation/validation follows the newer content structure. Determine the actual canonical schema contract and migration boundary.
2. Security architecture says lessons from bài 4 onward are private. The observed manifest gives hsk1_bai4 a student visibility flag, but hsk1_bai5... also have data paths without the same flag. Determine whether visibility is controlled elsewhere and inspect the produced public artifact before calling this a bug.
3. Some architecture/security documentation contains older pilot/deployment statements that may be stale relative to the latest merged commits. Classify each as VERIFIED, STALE, or CONTRADICTED.
4. Current Supabase schema and RLS must be inspected rather than inferred.
5. Current Google Docs sync implementation and actual error/verification path must be inspected rather than inferred.
6. Current deployment status must be checked from workflow/deployment evidence.

## Exact next action

1. File/system: repository + deployment + Supabase-related project structure.
2. Action: Execute .project/continuity/RECONCILIATION_PLAN.md from start to finish. Produce .project/continuity/RECONCILIATION_REPORT.md and update this file with verified facts, conflicts and one safe next action.
3. Expected: a verified baseline with evidence and no unresolved ambiguity about the current working architecture.
4. Stop condition: if any R3/R4 boundary remains contradictory, stop broad changes and leave a precise discrepancy-focused next action.

## Files protected during reconciliation

- application source code
- lesson content
- Supabase data/schema/RLS
- private/public asset boundaries
- approved UI/navigation/footer structure
- deployment configuration

Continuity documents may be updated. Product behavior should not.

## Known failed attempts

- None in this continuity installation.
- Historical debugging paths exist in prior conversations but are not safe to classify without current artifact verification.

## Handoff

A new session should continue by:

> Read this WORK_STATE, read SKILL.md and RECONCILIATION_PLAN.md, then perform Repository Reconciliation before changing any application code. Use evidence from current repository/runtime/deployment/database where available. Update the report and this state file. Do not ask Bách to restate the project history.

## Resume checksum

- Current task: Repository Reconciliation
- Next action: execute RECONCILIATION_PLAN.md
- Critical files: ARCHITECTURE.md, CODE_RULES.md, SECURITY_ARCHITECTURE.md, package.json, data/lesson-manifest.js, data/lesson-registry.js, workflow files, supabase/
- Critical constraint: reconcile first; remediate later; never invent schema/access rules
