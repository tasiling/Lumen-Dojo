# Bank amount recovery — 2026-10-02

Scope: tolerate visible OCR amount formatting; recover unresolved missing amounts in place; simplify bank matching; keep transfers outside automatic income/expenses.

## Changes
- Both OCR adapters accept finite decimal numbers and positive AUD/TWD currency-formatted decimal strings with properly grouped thousands. Conflicting currency markers, malformed grouping, negative/ambiguous/excess-precision amounts remain null. No floating-point ledger accumulation.
- Focused recovery matches unique descriptions/references only; repeated merchant names remain for human review.
- Retrying an existing batch fills only missing amounts/currency on uniquely matching unresolved candidates with visible amount evidence. It never replaces existing amounts, decisions or ledger entries. Skipped/recorded/linked rows remain untouched. No automatic ledger posting on this recovery path.
- Retry control appears on batches with unresolved missing amounts. Transfer batch skip changes only unresolved transfer candidates, persists skipped state and is idempotent. It creates no ledger entries. New ambiguous overlapping screenshots still require review; no date-plus-amount assumption.
- Existing transaction and payroll controls are folded into optional details. Opening/adjustment transactions are excluded in the picker and rejected by the server. Matching exchange/transfer options display the corresponding account leg, not the other currency's transaction headline amount.
- Pending purchase status remains pending; existing recorded-pending to completed tests remain passing. Pending purchases reduce projected available funds, not posted balance.

## Validation
Luminara: timeout 180s npm run check, 101 passed / 0 failed / 0 skipped, Vite build and syntax checks pass.
Dojo: timeout 180s npm run check:wealth-bank, 15 passed / 0 failed / 0 skipped, eslint 0 errors with one existing img warning, Next production build pass.
Isolated actual frontend callbacks -> authenticated HTTP API -> pg-mem -> readback: 9 checks pass (expense correction, reserve/payment, backup, vision savings, performance correction and signed LINE performance). This is not Safari/browser layout or real PostgreSQL verification.

## Remaining verification and release
Actual original bank screenshot OCR has not been rerun: supplied attachment is the review screen, not the source bank transaction image. No real-image OCR success claimed. No production candidate, financial transaction, secret, migration or deployment changed. No migrations/config changes required. Keep WEALTH_BANK_AUTO_POST_ENABLED=false. Release receiver/UI first then OCR adapter after review; retry old missing-amount batches deliberately, without reuploading/duplicating them. Roll back application code if needed; retain ledger/images/candidate decisions. Never clear the database.
