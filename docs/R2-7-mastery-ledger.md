# R2-7 mastery / dao checkpoint

Approved specification: current `R2-7_codex.md`, read 2026-10-14 Melbourne time.
Original planned branch: `codex/r2-7-mastery-dao`.
Dependency/base: published R2-6 `e159b24cf8283690290438a77a655b03ce26f38c` (tree `ee597ba73123a339ae8a3a4c2edea66fc4427db1`).
Master remains `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef`.

## Continuity and decisions

The R2-6 local checkpoint `171a7f8` and remote connector commit `e159b24` have identical source trees but different commit metadata. Both are retained; no reset, force-push or redundant merge was used. R2-7 has no published branch/source checkpoint to recover, so only its missing functionality is implemented on its original planned branch in an isolated worktree.

Ruling: develop R2-7 against the verified, unmerged R2-6 dependency and deliver a stacked Draft PR targeting that branch — the user authorized continuing all remaining functionality before UI polish, while merge/deployment remain separate — cost if wrong: retarget/integrate the dependency before release; this checkpoint is not independently deployable onto current master.

Ruling: canonical new rubric/card ranks are stone/bronze/silver/gold/diamond (石/銅/銀/金/鑽石), as required by R2-7. Existing platinum snapshots remain readable, with an explicit legacy form option and refusal of new platinum saves/collections; there is no silent conversion — cost: a legacy platinum result needs an explicitly corrected new rubric/attempt before collection.

Ruling: save one immutable event per grant, association or withdrawal/restoration; derive the card from its complete events instead of rewriting a growing card/history JSON — this avoids a two-write grant/card synchronization boundary and preserves the existing Notion lock/intent mechanism — cost: projection reads all owner events and should gain an index if history scale makes that expensive. The API separately pages public-to-owner metadata; it never substitutes a last-N history for full identity/rank computation.

## Delivered behavior

- Only the actual R2-6 server operation `collectionAttempt` supplies collection snapshots; it checks confirmed result and fresh criterion/oral/professional evidence without rewriting historical assessment data. Existing historical `confirmedMastery` remains readonly and stable. Client owner/rank/result/snapshot input is ignored.
- Stable owner + capability card identity; stable assessment attempt grant identity. Same names with different scopes remain different capabilities/cards. Duplicate/concurrent retries do not duplicate grants. A retry of an already recorded grant remains readonly even if the source is currently unavailable or card withdrawn.
- Immutable attempt/rubric/evidence snapshots per grant; highest attained rank retained for lower revisits, no manufactured lower-tier dates. Latest name is selected by actual definition version; history retains all earlier names and standards. CEFR reference, capability goal and rank remain separate; no overall language certification or professional qualification claim.
- Existing capability primary scope remains immutable. Multiple owner learning-item associations alter one card and retain its original item, with stale revision and owner/archive gates.
- Explicit whole-card withdrawal/restoration requires reason and immutable audit. Grant retry cannot silently restore a withdrawn card; new grants require explicit restoration first. Withdrawal retains historical highest tier and all events.
- Actual `/api/dojo/mastery` handlers use the existing owner/origin authentication, shared filesystem writer lock, tracked Notion serializer and durable card-revision/event intents. Unknown response after dispatch retains the writer lock; acknowledged but invisible event rows cannot be recreated. SDK repeated cursor, duplicate IDs, incomplete projection revisions and wrong owner fail closed.
- No SQL/schema migration or new service. Storage is additive DB14 knowledge rows titled `行光學成事件-<eventId>` with `mastery-event/v1`; card identity is a derived `mastery-card/v1` projection. Namespace excluded from ordinary/approved knowledge export and native attachment discovery/verification.
- `/dao` retains original entry and Claim workflows and gains the `/dao/mastery` entry. Collection is explicit from a confirmed assessment. Card list filters rank/scope/status, pages metadata, displays textual rank/reviewer/date, and does not include private goal/answer/evidence/feedback. Card history metadata is paged; individual private event snapshots require explicit opening and can be closed. The original attempt remains linked; all failed/successful attempts and optional revisits remain distinguishable.
- Association and audit drafts join the leave/reload guard. Saving one operation cannot silently discard an edited other operation; cancel is explicit. Stable request IDs are retained across matching operation retries.

## RED / GREEN and review

Missing stone rank failed domain and actual-form SSR; fixed canonical choices and preserved legacy snapshots. Missing collection-current-evidence gate failed then passed; archived source refuses a new collection but historical result remains readable.

Missing mastery service failed first, then domain tests passed: owner/scope, confirmed-only results, canonical ranks, highest tier and same-name isolation, no invented dates, retry/concurrency, associations, immutable withdrawal/restoration audit, metadata privacy and zero-write reads.

Missing actual API failed first. Actual handler + store + serializer tests use isolated SDK, real R2-6 definition/draft/submit/evaluate/confirm flow and filesystem intents. They cover forged client state ignored, metadata/detail privacy, namespace exclusions, native private-source refusal (first returned 200 then fixed to 403), stale audit revisions, matching retries, card/history cursors, 121+ events/full SDK pagination and repeated cursor refusal, invisible acknowledged writes and lost-response writer lock.

Missing card component and pending-operation helper failed first, then actual React SSR and editor tests passed. These verify textual rank/scope/reviewer/date, independent CEFR disclaimer, long-name wrapping declarations, withdrawn state and mutual protection of association/audit drafts. They are not browser interaction acceptance.

Independent read-only review found one Important same-rank revisit date issue: replacing the highest snapshot changed the first attainment date. The Sept 1 / Oct 1 same-gold-v1 regression first failed, then passed after retaining earliest actual confirmation date for the highest attained rank separately from latest snapshot and recent confirmation date. No Critical privacy/persistence issue reported. Final suites are rerun after this fix.

## Verification boundary / remaining work

PASS commands are recorded only after their outputs are inspected: `npm run test:mastery`, `npm run test:assessments`, scoped ESLint, Next production build/TypeScript, `git diff --check`.

Initial standalone tsc failed existing RouteContext names because a new worktree had no generated Next route types; unchanged standard build generated them, and standalone tsc subsequently passed. No product source workaround for that environment prerequisite was needed.

Added `npm run test:mastery-ui` with isolated Chromium scenarios at 375/390/430 for long names, explicit private-detail open/close, no writes on reads/cancel, pending operation guards, withdrawal refresh/persistence and overflow. SKIPPED: not executed under the known socket restriction; no browser retry or Chromium/Safari pass is claimed. Actual iPhone keyboard, safe-area, back/refresh and visual acceptance remain pending.

No production Notion writes, live media requests, paid AI calls, backfill/Repair, merge or deployment. Recovery is remove new entry/actions/routes while leaving immutable private rows and all existing records intact; deleting old achievements or rewriting historical rank is not a rollback.

Remaining: multi-package integration/navigation acceptance across R2-4/R2-5C/R2-6/R2-7, live owner/evidence verification in an authorized test environment, phone browser acceptance and overall interface polish after functionality. Native new upload/playback remain outside this completed card workflow. This is a saved functional checkpoint, not a release claim.

Final checkpoint results: mastery 3-script suite PASS; complete 10-script assessment suite PASS; standalone TypeScript after generated route types, scoped ESLint, standard build, UI scenario syntax and diff check PASS. Browser/live integration SKIPPED for the documented environment boundary. No model-capacity/full error occurred.
