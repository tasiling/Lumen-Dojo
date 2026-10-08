# LINE massage performance

## User operation
Send `10/2:255，4` or `業績 2026/10/2:255,4` to the existing LINE clipping bot. Amount is AUD gross performance; count is the number of card payments. Omitted year uses the current Melbourne year; future and invalid dates are rejected. Use explicit year across New Year.

Estimated weekly salary, Monday–Sunday: `(total gross minor units - 250 * total card count) / 2`, rounded half-up to AUD cents once per week. A daily estimate is informational; rounded daily estimates are not summed. The reply labels the number of recorded workdays, not a forecast for unrecorded days. Unknown historical card counts do not default to zero. Estimates never create cash income or ledger entries. Actual receipts remain the separate existing payroll flow.

## Safety and correction
The existing signed service endpoint adds POST `/api/integrations/lumen/bank/performance`; existing HMAC, nonce replay protection and hashed LINE-user ownership apply. A stable LINE event ID is the operation key even on retry. A new event with identical values for the same work date does not duplicate performance. Different values return 409 and must be explicitly corrected on the web. Web corrections compare original amount/count and reject stale edits; the owner lock and transaction are shared with the main workspace. Unknown old counts can be supplied through this correction form.

The webhook persists before acknowledging LINE, bypasses generic clipping for recognized performance text, and returns 503 for uncertain save results so LINE can retry. This does not change image routing, OCR or bank auto-posting. LINE reply-token failure can still prevent the summary from appearing despite a successful save: verify the web record before changing the values. Resending identical values is safe.

## Release and recovery
No production configuration or data was changed during development. Release requires approval. Keep WEALTH_BANK_AUTO_POST_ENABLED=false. Back up the database and verify recoverability before applying migration 005. It adds one nullable integer column with a nonnegative/count-limit constraint; no defaults, updates, destructive statements or financial backfill. Existing performance rows retain unknown card counts. Normal migration transaction/checksum handling is unchanged.

Deploy Luminara (migration 005 and receiver) first; check health, authenticated read and backup. Then deploy Dojo. Reuse existing LUMINARA_WEALTH_URL, LUMINARA_WEALTH_S2S_SECRET, WEALTH_S2S_SECRET and WEALTH_LINE_USER_ID_HASH; never expose values. Do not change LINE webhook, paid services or bank auto-post setting. Roll back application code if needed while retaining the additive column and recorded work; do not drop the column or clear the ledger. An old version can still record performance with an unknown count.

## Verification, 2026-10-02
Luminara `timeout 180s npm run check`: expected final report below in PR. New tests cover 255/4 => AUD 122.50; Monday–Sunday rounding; unknown card counts; duplicate/conflicting dates; card-fee/count validation; explicit correction and stale edits.
`timeout 90s` isolated HTTP harness runs actual front-end callbacks, authenticated write/readback, expense correction, reserves/payment, backup, vision reserve, performance create/correction, signed LINE service retry, forged signature and nonce replay. It uses pg-mem and synthetic data; it is not real PostgreSQL, Safari, browser-layout or production LINE verification.
Dojo `timeout 180s npm run check:wealth-bank`: includes new parser/routing tests plus existing OCR/image-routing tests, lint and Next production build. Real LINE message/production migration are deliberately not performed before release authorization.

## Existing today-use path
The existing `/workspace#flow` provides manual `記收支` and `記業績`. Until the new version is released, put the card count in the performance note (for example `刷卡 4 筆`); the old version does not calculate this new formula. Do not send the new LINE syntax expecting saved performance before both releases are verified. No real performance was created from the illustrative 255/4 example.

Final local results: Luminara npm run check PASS, 96/96 tests; Dojo npm run check:wealth-bank PASS, 13/13 tests, lint 0 errors (one existing img warning), Next production build PASS; isolated HTTP/frontend harness PASS 9/9. Production public /api/health/live responded HTTP 200 {ok:true}; this does not prove authenticated production writes or the new LINE flow. Source-hash comparison against the selected remote bases found only the intended changed tracked files; preexisting local Dojo proxy/routing-test modifications already match remote master and were not republished. New LINE production message flow and real PostgreSQL/Safari remain unverified.
