# R2 release readiness — 2026-10-08

This checkpoint integrates production master `49bcc461ce29dbd9f5ea1ca8dcc8aaefa3b6c943` into the original R2-1 → R2-2 → R2-3 stack. It preserves existing PRs #72, #75 and #76, their dependencies, and the bank automatic recording / unified image dispatch / short example sentence updates already deployed on master. Only package.json required manual conflict resolution; both sets of test scripts were retained, with current master script values.

## Fresh verification

| Package | Fresh checks | Result |
| --- | --- | --- |
| R2-1 | learning-foundation, learning-foundation-api, wealth-bank, image-routing, english-images, unit-arrangement, capture-exploration, weekly, html-entity-overflow, lint, production build | PASS |
| R2-2 | learning-foundation, learning-foundation-api, lint, production build | PASS |
| R2-3 | learning-records, practice-events, r2-3-api, learning-foundation, learning-foundation-api, wealth-bank, image-routing, weekly, lint, production build | PASS |
| Current Chromium UI | Browser failed to launch: process singleton socket denied (EPERM), before interactions | BLOCKED; prior UI evidence is historical |
| Native iPhone Safari | No physical device available | NOT RUN |
| Live Notion / Railway mount and persistence / production write acceptance | No live test performed | NOT RUN |

The R2-2 practice-workspaces test is a browser test; it is not included in fresh PASS results. Build checks include TypeScript. Lint retains the existing Plurk image warning. Shared external node_modules symlinks initially blocked Turbopack; local npm ci resolved that tooling problem without code changes.

## Deployment state and next steps

All three packages remain NOT MERGED / NOT DEPLOYED. Official production was observed on master `49bcc461ce29dbd9f5ea1ca8dcc8aaefa3b6c943`, deployment `755a8a9a-2fc4-424c-b404-2c2abab5a9f8` (SUCCESS).

The existing preview-only maintenance draft was reviewed: two services, 14 changed fields, no resource deletion, volume or variable changes. Its deployment submission returned **“Cancelled — the user did not approve this action. No changes were made.”** Both old previews therefore remain live; no retry or alternate live deployment was attempted.

The production maintenance draft was aligned to the same current master SHA and read back: five staged fields, no destructive changes, status STAGED. This draft has not been applied. A draft is not a deployed maintenance process, and a health response would not prove writer drain.

Resume the existing Production Enablement checklist in #72: establish old/background/external writer drain, switch the two old previews to maintenance, maintain production during cutover, attach the authorized 5 GB persistent /data volume and server-only LEARNING_WRITE_LOCK_DIR=/data/learning-locks, verify runtime filesystem and marker persistence over distinct deployments, then merge exact reviewed heads in order. Recheck each child PR base/diff against master after its parent merges. Deploy the actual merge SHA using the fixed app command `node node_modules/next/dist/bin/next start`; perform the finite authorized write acceptance. Preserve unknown-outcome mutexes and intents. Do not substitute /tmp, retry uncertain writes, or restore an old incompatible writer.

No production Notion writes, migrations, initialization, LINE startup side effects, main-branch merges, force pushes or live Railway configuration changes occurred in this checkpoint. Git HTTPS lacked credentials; connected Git Data operations preserve exact content trees and existing parent histories. Local and remote commit IDs differ because commit metadata differs.
