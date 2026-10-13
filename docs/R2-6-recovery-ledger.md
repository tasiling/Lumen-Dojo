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
