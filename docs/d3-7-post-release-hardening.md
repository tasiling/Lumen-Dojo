# D-3.7 post-release hardening

These follow-up cases do not block the usability release once the first arrangement, receiver UI/reload/learning entry, same-group retry and response-loss recovery pass.

- Large concurrent ensure pressure: all successful callers receive one authoritative Unit; mapping and reservation uniqueness remain intact.
- Executor takeover combinations: reject stale executors and fences before OCR, attachments, destination or job mutations.
- Repeated sender/receiver restart matrix: reconcile unknown dispatch identities and receipts; never redispatch succeeded jobs.
- Multi-stage cancellation and re-arrangement: retain succeeded/unknown identities and receipts, release only undispatched sources, and isolate reservation cleanup to its arrangement.
- Long lease expiry, heartbeat and renewal matrix: no expired or superseded writer can mutate receiver state.

Run future integration against explicitly disposable PostgreSQL and isolated fixtures, save database invariants and stop/clean up all temporary services and volumes within the cost limit. Do not use production business data for pressure tests.
