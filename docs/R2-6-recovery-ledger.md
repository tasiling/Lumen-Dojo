# R2-6 recovery ledger

Base: `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef`.
Branch: `codex/r2-6-assessment-evidence`.
Approved specification: `R2-6_codex.md` (current Library file read 2026-10-13).

The former local R2-6 source/commit was lost during workspace maintenance. The surviving review probes establish original concepts and API shapes; they are not a complete source backup. This branch rebuilds only the missing R2-6 functionality, in checkpointed stages.

## Stage 1: domain checkpoint

Files: `lib/dojo/assessments/model.ts`, `service.ts`, `scripts/test-assessment-domain.mjs`.

Independent deliverable: repository-independent domain operations for immutable capability/rubric versions; idempotent independent attempts; draft, submit, evaluate and explicit confirm; required criterion/evidence checks; oral/professional proof limits; manual selected export and read-only feedback preview; version-bound confirmed mastery output for R2-7. No UI, route or production adapter is claimed at this stage.

Ruling: feedback must match both definitionVersion and attemptRevision — unchanged rubric versions do not make feedback on old answers valid. Cost: manually imported feedback must retain the revision included in its export package.

Ruling: plain URLs or transcripts cannot establish verified native audio or professional proof — availability and stable native identity are supplied by a server-owned evidence adapter. Cost: the next stage must implement and test the real attachment verifier; current isolated tests inject it and do not claim live Notion/media verification.

Ruling: submitted/assessed works are immutable; retries and revisits create new attempts. Historical confirmed results remain intact. Scope changes require a different capability identity.

RED: `node scripts/test-assessment-domain.mjs` failed because the required service was absent.
GREEN: same test passed after implementation. Tests cover request collisions, blank submission, stale/concurrent writes, scope/version immutability, missing evidence, oral/professional restrictions, explicit confirmation, owner refusal, read-only preview/export, independent revisit and historical mastery.

The repository interface requires serialized mutations, verified evidence, and complete definition/attempt reads. It has no default fake production implementation. Inputs are bounded before persistence, and caller-supplied evidence availability/native identity is not accepted as proof.

## Remaining stages

1. Real Notion persistence and owned learning-record/file/audio evidence adapter; robust pagination and unknown-write lock handling; authenticated API handlers; exclude private assessment namespaces from production-day candidate/export queries.
2. Mobile workflow for rubric creation/versioning, answers/evidence, per-criterion review, GPT selected export/preview, explicit confirmation, optional revisits, editable example drafts and version-aware progress.
3. Actual handler, attachment, mobile/production-mode tests and independent branch review. Deliver original-branch Draft PR; no merge or deployment in this package.

No production data, Notion writes, attachment requests, schema migration, paid AI or external dispatch was performed for Stage 1. Its domain tests use an isolated repository port and do not represent native integration or iPhone Safari validation.

## Domain review and verification

Independent reviewer identified three Important defects. Each was reproduced with a failing assertion and fixed: changed text now gets a new matching snapshot; changed native media becomes unverified; topic/stage scopes require the corresponding IDs; professional confirmation cannot replace a teacher role with a professional role or accept an arbitrary declared name.

Ruling: professional proof needs a server-owned attestation bound to attempt ID, definition version, answer digest, evaluator type/name and native media identity. Client-supplied attestations are discarded by evidence-input normalization. Cost: a native attachment alone cannot enable formal professional confirmation; the later adapter must establish this proof correspondence or fail closed. This checkpoint does not claim a live examiner-verification mechanism.

Final Stage 1 checks: domain suite PASS; `tsc --noEmit` PASS after Next route-type generation; scoped ESLint PASS; `git diff --check` PASS. No interface, browser, native Notion or external PostgreSQL test is claimed for this checkpoint. The existing R2-4 branch remains separate and unchanged.

## Stage 2: persistence/API/native evidence checkpoint

Added the real Notion persistence adapter and authenticated `/api/dojo/assessments` handlers. Definition versions and independent attempts use the existing write lock and durable intent mechanism; a dispatched write with a lost response retains the lock. Reads fully paginate and reject repeated cursors and duplicate IDs. Private definition, attempt and proof namespaces are excluded from both general and approved knowledge queries.

Owned learning-record excerpts and Notion-hosted file/audio blocks are checked on the server. Native blocks must belong to the selected owner page, and bounded signed range responses must match supported media headers. Signed URLs are not saved. Renewed signed URLs preserve identity; changed object identity becomes unverified. Missing/archived sources retain truthful availability and their matching historical snapshot. Changing the referenced learning record cannot inherit another source's snapshot. Duplicate proof rows are refused.

Verification: `npm run test:assessments` PASS (domain, actual handlers + persistence + serializer with isolated SDK, and native verifier with isolated media responses); existing learning-foundation, learning-records, practice-events and R2-3 API suites PASS; scoped ESLint and TypeScript PASS; standard `npm run build` PASS. Initial build failed because worktree node_modules was a symlink outside Turbopack's filesystem root; replaced it with local dependency files and reran the unchanged build successfully.

Limits: these tests perform no production Notion writes or live media requests. No live examiner identity verification, proof-creation UI, mobile interface or Safari acceptance is claimed. Professional confirmation fails closed unless a trusted stored attestation matches the attempt, answer, rubric, examiner and native object. Mobile workflows, optional editable examples, version-aware progress and final integration remain for Stage 3. No merge/deployment performed.

Independent Stage 2 review identified one Important issue: persisted availability was returned as current on reads/exports. Added a read-only current availability companion to attempt/mastery API reads and refresh selected evidence before manual export, without changing stored historical results. Domain regression first failed for the missing operation, then passed; tests assert no writes and unchanged confirmed history. Actual API tests assert the companion contract.

Review follow-up reproduced a second Important read-path issue: a same-owner learning record edited to remove a previously selected excerpt blocked historical reads with 409. The adapter now retains the matching historical snapshot and reports current unverified (or archived/missing) availability; a new unmatched invalid excerpt still returns 409. Actual-handler tests reproduce edited-source attempt/mastery reads as 200 with unverified status and no writes. Source-content replacement also invalidates availability instead of silently presenting a different work as the original evidence.

## Stage 3a: rubric/progress interface checkpoint

Added `/practice/assessments` and the 心・知 navigation entry. Editable daily English-writing and single-concept example rubrics require explicit save; required criteria can be edited/added/removed, tasks/aids edited, and existing definitions saved as immutable new versions. Shows latest-version progress with separate historical confirmations and retained version history. Reuses the existing leave guard; starting another editor is disabled while an editor is open. No attempt/evaluation/GPT UI completion is claimed yet.

Progress regression passed after missing module RED: old-version confirmations do not imply current mastery; independent capabilities stay separate; current assessed-but-unconfirmed remains pending; editable examples have no stored pass. Review identified a multiline-aids input issue; added missing-helper RED then fixed preservation of trailing newline while editing, filtering blanks only in the save payload.

TypeScript, scoped ESLint and assessment backend/progress tests PASS. Standard build passed before the leave-guard/input fix and is rerun for final checkpoint verification. Browser tests were created for 375/390/430 widths and explicit save/version behaviors, but DID NOT PASS: initial Chromium runtime was absent; downloaded Chromium then launch failed on prohibited socket creation. No further browser retries or Safari claim. This is a partial UI checkpoint, not complete R2-6 or a deployment.

## Stage 3b: text attempt/review workflow checkpoint

Added independent attempt creation, refreshable attempt URLs and history, explicit answer-as-text evidence selection/deselection, draft save before submit, per-criterion self-evaluation, selected manual GPT export with a version-bound feedback template, read-only pasted AI preview, explicit assessment save and separate confirmation. Confirmed history has an optional new-attempt revisit using the current rubric. Existing evidence references remain preserved; this UI does not fabricate native attachments or professional attestations.

Review found two Important UI issues. Unsaved self-evaluation/pasted AI now participates in the shared leave/reload guard. A prepared GPT package is copyable only while its exact answer/evidence selections still match; deselecting private content hides the stale package. Missing helper tests RED then GREEN, alongside explicit evidence deselection regression. Route components are keyed by attempt ID to prevent the preceding attempt remaining interactive during route changes.

Remaining fabrication work: native file/audio and learning-record evidence picker; human/professional attestation review/recording workflow; full scope/stage/topic/rank/CEFR/required-evidence/confirmation-method configuration UI; R2-7 mastery/道藏 cards with histories; final multi-package navigation/integration. Existing phone tests are still blocked by environment socket restrictions; no mobile/Safari acceptance or deployment claimed. All previous remote checkpoints remain preserved on original PR84.

Stage 3b final checkpoint checks: `npm run test:assessments` PASS including domain/API/native/progress/editor; `tsc --noEmit`, scoped ESLint, standard `npm run build`, and `git diff --check` PASS. Added future mobile text-attempt UI scenarios for 375/390/430 but not executed because the previously established browser socket restriction remains; no UI PASS claimed. No production Notion write, AI call, merge, or deployment. Full UI polish remains deferred until functional integration as requested.
