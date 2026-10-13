# R2-4 recovery and delivery

Base: `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef` (`master`).
Branch: `codex/r2-4-reflection-light-codex`.

This is a recovery delivery. The original local repositories disappeared during workspace maintenance. Five existing reflection/codex client and template files were recovered from surviving Next source maps. Missing model, filesystem repository, service and API were rebuilt against the surviving real-filesystem test contract. This does not recover the original commit SHA or constitute recovery of R2-6/R2-7.

## Behavior

- Six tools preserve fixed question IDs and saved question/mode snapshots. Switching depth hides questions without deleting answers. Explicit completion needs at least one nonblank answer and creates no assessment, mastery card, score, AI request or weekly task.
- `/practice/emotion` supports draft/pending/completed notes, editing, private metadata lists, optional creative-role snapshots, and multiple light tags. `/practice/atlas` explains the existing ten names without replacing their definitions; legacy record entrances remain available.
- Daily highlight/block/insight handoff saves the daily draft before selecting a tool, and saves any subsequent edits before navigation. Repeated handoff requests reuse a stable ID; a second exploration is explicit. Only matching source fields prefill matching questions, and source cards remain editable without altering the daily record.
- Inputs are disabled while reflection mutations or the entire daily handoff run. Read-only result inspection remains available after an unknown commit, with an explicit warning before leaving unsaved homepage edits.

## Persistence and permissions

Notes live only at `${LEARNING_WRITE_LOCK_DIR}/private-reflections/<uuid>.json`. Production requires the existing durable shared POSIX volume; no temporary fallback is used. Files use restrictive permissions, synchronized temp writes, atomic rename, and directory sync under the existing shared writer lock. Unknown commit results retain that lock; GET can still inspect saved notes.

Owner is the existing configured knowledge data-source identity. Every reflection handler uses the existing ACCESS_KEY cookie/origin authorization; body-declared owners are ignored. Daily sources are independently checked against the owned saved daily ID, date lookup, revision and actual selected excerpt. Role selections come from the existing role profile. Private answers/source snapshots are absent from metadata lists, external exports and Notion writes. Responses use `private, no-store`; unexpected errors do not echo note contents.

No migration, production data changes, backfill, external dispatch, paid AI, merge or deployment. Rollback removes the client/API feature while retaining the private directory; do not delete persisted notes or automatically expire a writer lock.

## Verification commands

`npm run test:reflection` checks six templates/modes, hidden answers, completion, owner checks, restart, revisions, concurrent writers, semantic handoff, optional role, metadata privacy and retained unknown-outcome locks using a real disposable filesystem.

`npm run test:reflection-api` exercises the actual handlers with isolated Notion reads and forbids Notion mutations: login/origin, forged/stale sources, idempotency, revision conflict and private cache headers.

`npm run test:reflection-ui` exercises actual client components at 375/390/430 px with intercepted isolated APIs and a real filesystem service. It covers all six tools, long text, hidden answers, draft/reload/completion, codex, delayed PATCH/PUT input protection, saving edits made after handoff preparation, and read-only unknown-result inspection with cancel/confirm.

After `npm run build`, `npm run test:reflection-ui:production` runs the same browser suite against `next start` with sanitized server/test environment and synthetic access key. No LINE startup hook runs. Browser requests to other origins are aborted.

Also run `npm run test:r2-3-api`, `npm run lint`, and `git diff --check`. The pre-existing Plurk `<img>` lint warning remains. Real iPhone Safari and production credentials/storage are not used in these checks; those are not claimed as tested.

The recovery PR remains Draft until the larger R2 integration is completed. R2-5A/B/C remain on their existing remote branches; R2-6/R2-7 and final navigation/integration are separate outstanding packages.
