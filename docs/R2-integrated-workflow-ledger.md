# R2 integrated workflow checkpoint

Continuation of the approved existing work; no redesigned subsystem or production merge/deployment.

## Exact saved inputs

- R2-7 PR85 / `codex/r2-7-mastery-dao`: `821aeb07fa269b996b63b046f707487e2a691661`.
- R2-6 PR84 dependency: `e159b24cf8283690290438a77a655b03ce26f38c` (already inherited by R2-7).
- R2-4 PR83 / `codex/r2-4-reflection-light-codex`: `a10ff0e243190a9ab236cf18c150296493df4dc9`.
- R2-5C PR79 / `codex/r2-5c-external-results-bridge`: `07a9c0e1cb1d6deec43382046372afd47ed13c1c`.
- Master ancestor: `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef`.

No uncommitted work remained in the source worktree. Local/remote R2-7 commits have identical trees with different commit metadata; both retained. An isolated detached worktree starts from the actual remote R2-7 head. Initial shallow Git history lacked merge ancestors; fetched the bounded missing ancestry, without resetting existing heads. Local merge checkpoints `a82646b` and `58e762e` preserve R2-4/5C ancestry. Publish back to the original R2-7 branch/PR with all source parents; no new external branch or PR.

Ruling: integrate saved packages in the original R2-7 Draft PR while keeping original PR83/79/84 intact — the user authorized completing all functionality before UI polish — cost: PR85 now reviews the combined stack and release must resolve/retarget its current R2-6 base; this is not an independently deployed card-only change.

Ruling: merge script maps and private namespace arrays additively, preserving all packages' test commands and exclusion rules — choosing one side would silently drop delivered behavior — cost: more scripts in the integrated manifest. Two inherited log files had trailing carriage-return whitespace/blank EOF normalized to pass diff check; their content remains evidence of the original run, not a current test result.

## Connected workflow

Existing private reflection and non-scored 光行/光法 remain separate from formal capability evidence. Existing external source completion enters one Completion Event/Learning Record, never an automatic assessment/card. The user explicitly chooses a saved excerpt, completes rubric assessment and confirmation, then explicitly collects one capability card.

Shared navigation added to the existing practice home, 心・知, learning-record, assessment and mastery components. Six explicit entry links preserve selected item for records/assessment/collection; private reflection and atlas keep their own meaning. The global external-results inbox remains unscoped, since genuine completed results can be awaiting an owner-selected discipline. Selected scope filters latest rubrics and all historical attempts of those capabilities; archived/unknown requested scope does not silently choose another active item. Legacy aliases resolve readonly to their stable item ID. Server page keys prevent stale editor state surviving scope changes. Existing leave/reload guard remains active for draft edits; links do not perform writes/sync.

## Actual cross-package handler evidence

`test:r2-integration` includes behavior helpers, actual React SSR navigation and `test-r2-integrated-flow.mjs`. The latter runs actual reflection handlers + real private filesystem, actual external receiver/Notion serializer/store + isolated SDK and fixed-origin source HTTP fixture, actual learning-record handlers, assessment save/submit/evaluate/confirm, and actual mastery creation/read. Only transport is isolated; no production credentials or real source network.

Assertions include unauthorized zero reads/writes, private reflection completion causing no formal record/card, external completion causing no automatic mastery, unique event/body through replay, explicit item association and excerpt selection, original practicedOn, no raw source-private answers imported, confirmed collection exactly once, no writes/source fetch on readonly navigation, existing historical card surviving later source loss, and confirmed-but-not-yet-collected result refusing first grant after source withdrawal.

## Integration defects reproduced then fixed

1. The earlier assessment adapter checked record-local archive/content but missed R2-5C source completion/availability. Actual withdrawn source first still evaluated `meets`; now withdrawn/unverified yields unverified, source archived/deleted yields archived/missing. New attempts/confirmation/collection fail closed, historical snapshots/card stay intact.
2. External receipt/checkpoint pages were still browsable as native evidence sources. Actual native-page GET first returned 200, then 403 after namespace exclusion before block access. The shared native verifier uses the same exclusion.
3. Independent review reproduced event-first withdrawal with failed body projection: sync 503, authoritative event withdrawn and record projection needs_retry, body still completed, outer writer lock safely released, yet new assessment/collection succeeded. Actual regression now injects the one body-query failure and first fails with meets, then passes insufficient after authoritative origin event verification. The verifier binds event ID/owner/learningRecordId/version/type, checks current source state, requires record projection applied and matching opaque sourceRevision. Completed-source refresh with stale/pending body is also refused; explicit sync retry can repair it. No source/read failure is treated as available or successful.
4. Display-only rename of the same source erroneously invalidated identical work. Actual record-title edit first made availability unverified. The adapter now compares owned ID, work and selected text, preserving the original named snapshot; existing substantive content-change regressions still apply.
5. Independent review found two actual links dropping scope: mastery “前往能力驗收” and 心・知 links before an item resolved. Actual component SSR first fails each URL expectation, then passes with requested scope retained. Unknown/archived scope remains explicit; no automatic fallback. Missing source `completionStatus:unverified` case added to real integration flow and passes.

Independent fresh reviewer performed read-only inspection and isolated reproduction. Important findings addressed in one RED/GREEN fix pass; no browser retry or production operation. No deferred Minor finding was reported.

Ruling: origin-event record projection is the evidence authority, not overall daily/weekly projection status — a failure projecting an unrelated daily counter does not invalidate a current owned learning body — cost: each externally originated evidence verification performs another readonly event query, and unprojected/stale bodies must be explicitly retried before new mastery.

## Verification and limits

PASS only after fresh output inspection: integration helper/actual-view/actual-handler flow, reflection filesystem/API, external adapter and actual R2-5C API, VF results/projection/weekly boundary, mastery and full assessment suites. Earlier in this same integrated tree: foundation/model+API, learning records, practice events and actual R2-3 API passed. Scoped ESLint, standard production build/TypeScript and diff check are rerun after final fixes.

SKIPPED: Chromium/WebKit/mobile, keyboard/back/refresh/safe-area interaction and iPhone Safari. Prior browser runtime failed on prohibited socket creation; no blind retry in this checkpoint. SSR is not mobile interaction acceptance. Existing source branches' screenshots/logs do not count as this integrated version's browser PASS.

SKIPPED: live Notion/source Bearer links, native PostgreSQL, production mounted-volume persistence and live attachment/media verification. Existing R2-5A/B source contracts/fixtures remain reused; this receiver-side integration is not a deployment of those separate source repositories.

No production data writes/backfill/cleanup/Repair, paid AI, external dispatch, GitHub PR merge or infrastructure deployment. Weekly configuration frozen. Private FS reflection requires the existing shared persistent LEARNING_WRITE_LOCK_DIR; Notion event/body/proof/card data remains additive under its existing prefixes. Missing settings fail closed, no in-memory fallback.

Remaining: native attachment new upload/playback, full phone/real-environment integration acceptance, then overall interface alignment/usability polish. Release integration/merge/deployment remain a separate concrete step. Saved checkpoints and original source branches remain recoverable.

Final inspected results: complete integrated/R2-4/R2-5C/VF/mastery/assessment commands PASS after the fix pass; old foundation/record/event/R2-3 API checks PASS on this stack; final scoped ESLint, standard build/TypeScript and diff check PASS. Browser/live source/storage acceptance remains SKIPPED, no model-capacity/full error occurred.

## 2026-10-14 native media continuation

Continued the exact saved integrated tree, clean workspace and remote head `9836e198fe0ff75f2a2327f0806002adc0bbf605`; original PR85 remains the destination. No redesign, production mutation or deployment.

Private native media is now implemented: authenticated GET uses server-owned page/block ancestry and private-source exclusion, a bounded native signature probe, stable object identity and an If-Match-protected range response. Signed source URLs never leave the server. Full responses, byte ranges and suffix seeking are checked for exact ETag/MIME/range/body length, redirects and unexpected sizes fail closed. Maximum source remains 25 MB. Viewing is readonly and does not grant assessment/proof/mastery status.

Saved evidence uses its original native identity and refuses changed content; catalog preview uses current owner-verified content without claiming saved verification. Audio controls preload none and do not autoplay; PDF/image/file links open separately so the unsaved workspace is retained. Unavailable saved sources show historical snapshots instead of playable content.

New native upload is still not implemented. This checkpoint completes delivery of existing attachments; it does not claim upload or iPhone Safari playback acceptance. Remaining build work: new upload/recovery/unsaved-file handling, then the deferred overall UI/usability pass. Remaining acceptance/release work: mobile interaction, live Notion/media/source credentials/persistent volume checks, resolve the combined PR base and merge/deploy.

Final fresh review found no Critical/Important issues; its Minor audio alert persistence was fixed by clearing the error after successful metadata load. One final review and one fix pass, no rereview loop. Fresh media suites, complete assessment suite and integrated handler/navigation suite PASS; scoped ESLint, standard production build/TypeScript and diff check PASS. Browser/live media/mobile acceptance remains unexecuted. No model-capacity/full error occurred.
