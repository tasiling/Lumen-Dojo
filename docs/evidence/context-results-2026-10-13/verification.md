# R2-5C verification checkpoint 2026-10-13

Code checkpoint: remote PR79 `55aff4f0c6867a48114d4c0a6930a4e7b650831c`, tree `fb858cf3a69ae421478a0cfdf468b675b2a0a2b9`; native local `da1fcb119e17448108576ce2d7c5646885a23356` has exactly the same tree. Source/test evidence-only followup commits do not change that verified behavior. Parent Dojo master `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef` is a preserved merge parent. Original PR79 remains Draft, base master.

Git HTTPS push lacked credentials, so the GitHub API created identical trees with preserved original parents and advanced only the original feature ref with an expected-head lease and force=false. Its generated commit SHAs differ from native local author/time metadata; tree equality was verified by a fresh fetch. No reset, master merge, deployment or source/live Notion writes occurred.

## Tests actually run

| Command | Result |
|---|---|
| `npm run test:external-results` | PASS, including unchanged actual Context5A five-mode initial/archived/deleted reader envelopes |
| `npm run test:vocab-results` | PASS, including actual VF standard/short/other fixtures, invalid owner/date/metrics, event-first failure/retry and bounded reconciliation |
| `npm run test:vocab-projection` | PASS, unique standard rounds, daily set, cap5 with full provenance, manual maximum, old-form protection |
| `npm run test:vocab-weekly-boundary` | PASS, actual legacy weekly function excludes unbound external rounds while preserving explicit manual counters |
| `npm run test:r2-5c-api` | PASS, actual handlers/store with disk-backed isolated provider, VF daily rejection/retry, source-body subject references, no private bodies, GET no writes, unknown create retains lock/intent |
| `npm run test:learning-records` / `test:practice-events` / `test:r2-3-api` | PASS |
| `test:learning-foundation` / `test:learning-foundation-api` | PASS |
| `test:weekly` / `test:english-images` / `test:unit-arrangement` / `test:capture-exploration` / `test:html-entity-overflow` / `test:wealth-bank` / `test:image-routing` | PASS |
| `UI_CJK_FONT=<isolated Noto CJK> npm run test:r2-5c-ui` | PASS, actual Chromium375/390/430 Context + VF, refresh/back/cache, explicit operations, long text, safe area, reduced viewport |
| `npm run test:r2-3-ui` / `test:practice-workspaces` | PASS,375/390/430 |
| `npx next typegen` then `npx tsc --noEmit` | PASS; bare tsc initially lacked existing RouteContext globals before typegen |
| `npm run lint` | PASS; existing plurk img warning only |
| `npm run build` | PASS standard production build; final after-review build log `/tmp/r25c-final-after-review-build.log` |
| `git diff --check` | PASS |

RED→GREEN behavior evidence is recorded in the resumed execution ledger. Initial workspaces browser failure was environmental (missing Playwright1194); after installation the suite ran and passed. Actual rendered VF390 screenshot was inspected, with readable Chinese and no horizontal overflow; screenshots are isolated test output, not phone Safari evidence.

## Source evidence and limits

- Context PR24 final feature head `81127d02986b5c908e259117f806a52caf762dc2`; official migration/trigger/actual-reader supplemental embedded gate PASS1,0 skipped, full source npm test140pass/5native skipped. Native PG gate is explicitly blocked, not converted to PASS. Snapshot fixtures are unchanged actual reader output, including cascade deletion retaining previously valid completion and previous negative states remaining negative.
- VF source checkpoint `6210cad41441d190a88dbcf9c4eb35921e80fa7b`; genuine three-kind fixture compatibility passes. Source frontend9/9PASS includes true IndexedDB abort/offline/lost-response and no SRS replay. Source native DB gate still requires isolated DSN; no source production deployment was performed here.
- Receiver server-owned source namespace must be configured explicitly; no external source login or live bearer retrieval was tested.

SKIPPED: live Context/VF cross-site integration, production Notion, native source PostgreSQL end-to-end and iPhone Safari. Mock/provider fixtures and PGlite are labeled separately. Root owns fresh whole-branch review, source native gates, eventual integration/release and authorized live acceptance. This checkpoint does not claim those gates passed.

## Whole-stack review cursor/query fix verification

`VF_SOURCE_ROOT=/workspace/scratch/f3b6f396e824/vf-r2-5b npm run test:vocab-source-http` first RED3/3, then PASS3/3,0skipped against actual reviewed5B route/store implementation. Real source validates strict six-fraction after and emits/validates its native signed cursor; receiver now pads VF-only bounds textually and accepts the opaque boundedpayload.HMAC format.51events first50/second1, disk-backed restart, full reconciliation, exact cursor/after/windowUpper and original microseconds, unique51 event/body/provenance withcap5 all checked. SQL transport is isolated and explicitly not nativePostgreSQL acceptance. Source/domain/API, daily/weekly boundary and Context regressions rerun after the fix.
