# Weaving and Liaojie Native Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete native creative-to-publication workflow through two independent realm entrances, with owner service management and safe import.

**Architecture:** Extend the existing WeavingWork/WeavingShuttle records with versioned studio fields. Reuse existing operation receipts, Notion storage, completion versions, illustrated/media outputs, publication and release contracts. Sources and adopted understanding remain snapshots; standalone works use no fabricated shuttle. New native React UI shares the production components and CSS with the preview.

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript, existing Notion JSON records, durable operation receipts, Node tests, managed browser preview.

**Spec:** docs/superpowers/specs/2026-10-30-realm-integration-design.md; reviewed Page page_c45f05bfb8ec81919ca36683f890afe5.

## Global Constraints

- Preserve current master, existing media workflows, original tools, IDs and legacy URLs.
- Shuttles are optional topic containers; unlimited directions, each with understanding versions. A/B/C/D are editable text.
- Keep original sources, correction history and source-version references. Read, external-tool and public permission are separate.
- No automatic public posting, customer messages, billing, production Notion writes or deployment during isolated verification.
- Home is bounded; manager is searchable and paginated. Repeated operations recover original IDs; intentionally new works remain possible.
- Fixed completion and publication versions never follow mutable drafts. D must select a confirmed completion of the same work.
- Preserve pink/purple Weaving, blue Liaojie, native icons, global navigation; active step red outline only.
- External self-service booking, public knowledge base and workshops remain separate later packages, not implied by owner UI.

## Review Focus

- A same-title import with differing body/history must retain both works; repeated import cannot duplicate either.
- A second window or uncertain network write preserves local inputs and original operation until reconciled.
- A standalone work can complete, hand off, and feed all existing media without a fake shuttle or missing context.
- A work using direction V1 remains traceable after V2; old publication text and D analysis do not change.
- Customer questions/readings never appear in public proposals or voice samples; only actual public releases can seed voice preferences.

### Task 1: Domain and migration
**Files:** Create lib/dojo/creativeStudio/model.ts, migration.ts; modify weavingShuttle.ts; test scripts/test-creative-studio-domain.mjs.
**Interfaces:** normalizeStudio(value), studioForWork(work), importPreview(packet), planImport(existing, packet), normalizeDirections(value, legacyCoreVersions), adoptDirection(direction, versionId).
- [x] Write behavior tests for standalone works, preserved raw/corrections, independent text modules/research, 14 directions and immutable adoption, exact reimport and distinct same-title history, unsupported original backups retained without false conversion.
- [x] Run tests RED. Implement validators/import adapters, preserve entire import evidence and mappings. Run GREEN and existing weaving-domain tests. Commit.

### Task 2: Native persistence and fixed versions
**Files:** Create creativeStudio/store.ts and app/api/dojo/creative-studio/route.ts; modify weavingWorkflow/completions.ts, store.ts and media origin-context reads.
**Interfaces:** GET lists/work/completions; POST create/save/complete/topic/direction/import/handoff. All mutations consume operationId and expectedRevision. Existing work/completion/publication IDs are canonical.
- [x] Write isolated integration tests using real operation receipts and fake external Notion transport for retry, conflict, unknown outcome, standalone completion/handoff and import repeat. Run RED.
- [x] Implement receipt-backed operations and exact snapshot/permission validation. Keep existing APIs compatible. Run GREEN and weaving/API/completion suites. Commit.

### Task 3: Separate entrances and usable text workspace
**Files:** Create components/creativeStudio/{StudioHome,StudioWorkspace,StudioManager,StudioTopics,StudioImport}.tsx and studio.css; add weaving works/topics/import routes; modify two home pages and DojoShell navigation.
**Interfaces:** Components use Task 2 API; no second data store or embedded HTML app. Existing forage/proposals/sources and legacy tools remain linked.
- [ ] Write browser scenarios for empty/nonempty, source corrections, A/B/C/D, closure, save/reopen, conflict and bounded manager. Observe RED.
- [x] Implement native React UI, unsaved navigation guard and source-version displays. Preserve old URLs. Run browser checks and typecheck. Commit.


**Verification status:** Native UI and manual text/graphic/handoff journey passed. Full automated failed-save/conflict interaction scenarios remain pending a reachable browser environment; domain/receipt/buffer regressions passed. Do not redo implemented UI solely because this acceptance item remains open.

### Task 4: Graphic controls and publication bridge
**Files:** Extend illustrated/model.ts, render/editor controls; new work-context helper consumers; add native graphic tool links and voice workflow.
**Interfaces:** Existing completionId/deck/version/output/asset contracts; optional versioned per-page text controls. Voice sample references point to actual released text only.
- [x] Test legacy graphic migration, editable title/body position/font/spacing, 1080x1350 and 1080x1920, overflow, SVG/PNG render identity; fixed version handoff and voice exclusion. Observe RED.
- [x] Implement without regressing current media; inspect export files. Run affected media and publication tests. Commit.

### Task 5: Owner service workflow and calendar association
**Files:** Create creativeStudio/service model/store, /api/dojo/liaojie-services and /liaojie/services native UI.
**Interfaces:** Owner-only activities, manual capacity-controlled registrations, separate collective/per-person readings; same-origin work references. Stable linked calendar IDs, reschedule/cancel updates original; Melbourne and participant zones explicit.
- [x] Test concurrent capacity, blank question allowed, private delivery isolation, activity-to-work idempotency, stable calendar retry/reschedule/cancel and timezone. Observe RED.
- [x] Implement owner workflow only. External customer access explicitly remains unavailable. Run GREEN; isolated export verifies recipient separation. Commit.

### Task 6: Integration acceptance and handoff
**Files:** scripts/test-creative-studio-ui.mjs; docs/creative-build-progress.md; docs/creative-studio-acceptance.md.
**Interfaces:** Same native React/CSS preview and production; commit-pinned reviewable branch and PR.
- [x] Run 320/375/390/430/1024px actual rendering and complete isolated journey. Verify all new/affected tests, typecheck and production build.
- [x] Fresh whole-branch reviewer; reproduce important findings RED then GREEN; retain evidence and limitations.
- [x] Push branch, create reviewable PR, record actual results and outstanding deployment/customer-side work. No production data mutation.

**Delivery:** PR107 is open as draft; code checkpoint 28800b6d1a0ae3d2c2714dfad539b884f2e2e621, identical tested tree 1e2b58b28779b78d6ff0c7308c6707cf464c83c1. Remaining UI/production/customer acceptance is listed in docs/creative-studio-acceptance.md; this is not a full-roadmap completion claim.
