# D-3.7 Cross-system integration report

## Baselines and Pull Requests

| Repository | Baseline | Delivery |
|---|---|---|
| `tasiling/Lumen-Dojo` | `master` `06adf98cd38af82047b3986ca39fd590680fc037` | [PR #73](https://github.com/tasiling/Lumen-Dojo/pull/73) |
| `tasiling/lumen-context-room` | `main` `5870f105e072abbbd68a6de1bd2cc6e6b090138c` | [PR #23](https://github.com/tasiling/lumen-context-room/pull/23) |

Neither PR was merged or deployed while preparing this report. No production source, Project, Unit, Source Item, receipt, note, session, Notion result, or VocabForge record was written.

## Final data flow

1. Dojo loads the authorized Handoff v2 Project/Unit catalog, including receiver-authoritative Unit→source record IDs.
2. The user selects one active `learning_project` and 1–20 EnglishImageEntries.
3. Dojo persists a versioned generation snapshot and produces an external-GPT prompt. It contains stable source IDs and controlled text only—never secrets or temporary image URLs.
4. `context-room-unit-arrangement/v1` is parsed with strict fields, scope, coverage, smart-quote tolerance and snapshot checks.
5. The user edits and partially accepts human-readable Unit groups. Cancelled groups return sources to pending.
6. Dojo freezes the approved snapshot, fixed group identity, per-source dispatch IDs and canonical fingerprints.
7. Every accepted group calls the receiver’s protected ensure/claim endpoint. PostgreSQL atomically records the group→Unit mapping and source reservations; a new Unit and its five pending placeholders are created only when necessary.
8. Each source independently uses `context-room-source-handoff/v2` with the stable existing Unit UUID. One EnglishImageEntry remains one Source Item with its ordered attachments.
9. Dojo updates only integration projection fields and preserves concurrent source edits and other destinations. Partial success remains visible and resumable.

## Identity mapping

| Concept | Stable identity / rule |
|---|---|
| GPT pack | server `packId` + `snapshotHash` |
| Proposed group | `groupRef`, scoped only to that pack |
| Unit ensure | owner + arrangement ID + group reference + request fingerprint |
| Source reservation | owner + `lumen-dojo` + source record ID |
| Formal source | Handoff owner + source system + permanent record ID |
| Formal delivery | fixed dispatch ID + canonical request fingerprint |
| Source→Unit link | existing Context Room `source_item_units` uniqueness |

## Persistence and recovery

- Draft/proposal/execution state is persisted in Dojo’s existing Notion JSON repository, not React state or localStorage.
- Context Room adds only `unit_arrangement_units` and `unit_arrangement_sources`; it reuses `material_batches`, topics and all existing Handoff v2 tables.
- Advisory locks and unique constraints make double clicks, double tabs, response loss and concurrent proposals safe at the business-data boundary.
- A successful ensure with a lost response returns the same Unit UUID on retry.
- A successful Handoff with failed Dojo writeback becomes `unknown`; retry uses the same dispatch and receipt.
- Existing successful items are not resent. Cancelling stops pending work and never deletes completed work.

## Compatibility

- Original one-by-one Dojo dispatch remains available.
- Handoff v1 and v2 behavior remains available.
- The new batch UI requires both arrangement capability flags and never silently falls back to creating one Unit per source.
- Project catalog role, archive/delete/tombstone rules, cross-type confirmation and owner checks remain enforced.
- Existing Learning Notes, Topics, Micro Practices, Practice Sessions, Notion sync data and VocabForge data are not modified by arrangement drafts.
- Placeholder topics do not count as practice completion.

## Verification completed

| Check | Result |
|---|---|
| Dojo `npm run test:unit-arrangement` | PASS — 4 parser cases plus contract checks |
| Dojo `npm run test:english-images` | PASS |
| Dojo `npm run build` | PASS — production build and TypeScript |
| Dojo changed-file ESLint | PASS |
| Dojo repository-wide ESLint | One unrelated pre-existing `<img>` warning in `app/plurk/page.tsx` |
| Context static contract/regression tests | Added; CI/repository execution pending |
| Context PostgreSQL uniqueness test | Added; skipped without `TEST_DATABASE_URL` |
| True cross-repository PostgreSQL/API E2E | NOT TESTED — no isolated database was available |
| Railway / real Notion image / physical iPhone | NOT TESTED; requires authorized staging or post-deploy verification |

Static or mocked checks are not reported as PostgreSQL acceptance.

## Deployment order and rollback

1. Merge and deploy Context Room PR #23 first.
2. Confirm migration `0014_unit_arrangement_units.sql` and authorized capability flags.
3. Run an isolated ensure retry and Handoff v2 write test.
4. Merge and deploy Dojo PR #73.
5. Run iPhone Safari acceptance with non-production or explicitly authorized sources.

Rollback in reverse operational order: disable/revert Dojo first, then Context Room code if required. The additive tables can remain safely. Do not drop them while saved retries may still arrive. No historical backfill is required.

## User acceptance path

Select several English image sources → choose one existing Project → generate/copy the pack → paste a fixed GPT fixture or real GPT result → adjust groups and pending sources → confirm → execute → verify Context Room shows the expected Unit count, individual Source Items and links. A three-source new group must create exactly one Unit and three separate Source Items; retrying must not change those counts.

The user does not need to re-run OCR, re-upload images, create Learning Notes, generate Full Practice/Micro Practice, configure templates, or complete practice before using this flow.
