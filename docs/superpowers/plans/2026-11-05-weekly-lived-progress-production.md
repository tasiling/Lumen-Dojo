# Weekly lived progress production implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish the approved HTML behavior in the existing Today and weekly pages.
**Architecture:** Keep the formal page components and storage APIs. Add bounded optional log context, derive English contributions from confirmed log evidence, and store flexible choices in the existing owner JSON store with optimistic concurrency. Read actual learning catalogs at runtime; no demo data or simulated integrations.
**Tech Stack:** Next.js 16.2.10, React 19, TypeScript, Notion JSON storage.
**Spec:** Approved `weekly-footprints-test.html`, Library libfile_d4f6b77591808191b5b4f63e1c0d1a5a version 5; decisions in this conversation.

## Global Constraints
- Preserve Today hero, section order, 25-cell weekly board, four weekly tabs and five navigation items.
- Life and unclassified are distinct. Classification optional, one capture at a time, common picker outside log rows.
- Melbourne record clocks only; keep Asia/Taipei day ownership and rollover.
- English lives inside practice; sources do not prove completion. Confirm actual input/output/vocabulary/transfer, union daily categories, VF rounds separate, canonical IDs prevent duplication.
- No prototype seed records, fake sources, altered original dates, automatic debt/carry, unrelated service changes or persistent volume changes.
- User explicitly authorized production implementation and publication; execute directly in this fresh clone on a feature branch, then review/test/merge/deploy.

## Review Focus
- Existing daily records and optimistic revisions survive both older and current clients.
- Clearing an English classification removes its derived contribution without deleting manual or journal completion evidence.
- Read failures must not become empty successful data; retries must not duplicate writes.
- Midnight Melbourne still belongs to original Taipei day; historical clocks never receive two offsets.
- Picker focus/scroll, labels and footnotes must not enlarge rows or replace original layout.

### Task 1: Persistent capture/clock domain
Files: lib/dojo/formal.ts, lib/dojo/livedProgress.ts, app/api/dojo/daily/route.ts, tests/lived-progress.test.ts, scripts/test-lived-progress.mjs.
Interfaces: optional DayLog.context; normalizeCaptureContext; reconcileEnglishProgress; recordClock; displayedLogClock.
- [x] Test classification roundtrip, Life/unclassified, confirmed source unions/removal, existing output and rollover boundaries; observe RED.
- [x] Implement additive model and reconcile in locked daily save, retain original timestamp/date ownership.
- [x] Verify tests GREEN and existing daily/weekly/event regression tests.

### Task 2: Catalog, choices and actual records
Files: app/api/dojo/lived-progress/route.ts, lib/dojo/livedProgressStore.ts, app/components/livedProgress/*.
Interfaces: owner-authenticated GET catalog/weekly days/choices; PUT choices with revision. Canonical daily logs remain one record.
- [x] Test choices conflicts, source IDs, actual record dedup and catalog mapping.
- [x] Implement dynamic catalog, bounded choices, optional reminders and weekly actual records.
- [x] Verify tests, failed-fetch behavior and optimistic save handling.

### Task 3: Existing UI integration
Files: app/page.tsx, app/bingo/page.tsx, app/lived-progress.css, app/layout.tsx.
- [x] Add picker/UI tests preserving formal sections and original controls.
- [x] Integrate capture context, aligned compact labels, Melbourne clock and English details; integrate actual tab and choices in original weekly sections.
- [x] Verify TypeScript, lint, relevant regression suites and build; review full branch.

### Task 4: Release
- [ ] Commit, push feature branch, review, merge approved feature without unrelated branches.
- [ ] Pin only Lumen-Dojo source to merged SHA, deploy existing service, wait for SUCCESS.
- [ ] Verify deployed revision, health and owner authorization behavior; report exact limitations.

## Validation evidence
- New domain and isolated real-route API tests pass: classification roundtrip, owner/origin protection, revision conflicts, failed reads, old-client field preservation, source/manual overlap, distinct topic/template reminders and DST clocks.
- Actual browser tests pass at 320/390/430 px: aligned labels, optional capture, Life and live catalog topic, external picker, English confirmation undo, failed-save draft recovery, reload, actual pin dedup and flexible choices.
- Existing weekly mobile suite passes at 320/375/390/430/1024 px; weekly model, personalized weekly API, Today/calendar, practice events and learning records pass.
- Next type generation, TypeScript, changed-file ESLint and production build pass. Full-repository lint has one pre-existing set-state-in-effect error in LearningRecordWorkspace.tsx:41 and six unrelated warnings; no new lint diagnostics.
- Independent review findings on manual English overlap, revoking confirmation, and distinct reminders were reproduced and fixed with regression coverage.
- A pre-existing server/browser zh-TW spacing mismatch in the Today header was fixed with deterministic date text while retaining the Taipei date key.
