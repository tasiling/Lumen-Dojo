# 野採介面整合

Approved source: wild-collect-preview.html v1.1, dojo-design-handoff-v1 (orange realm).
Production baseline: master 6a04dce0109eb4b79eea98f5fe9c5f1a430883ef. The five shared design files are copied unchanged into forage-specific assets; page CSS remains route-scoped.

The standalone HTML was an offline prototype. Production uses existing /api/dojo/english-images, captures, knowledge-claims and unit-arrangement endpoints. No seed content, local preview receipts or simulated capabilities are imported into production.

All original classification, analysis, attachment retry, editing, vocabulary/context selection, partial receipt recovery, batch completion, arrangement resume/cancel, learning associations, K1/K2 safeguards and capture exploration remain available.

## Release verification

Production build and TypeScript pass. Real Chromium 141 (Playwright 1.56.1) exercised built release with isolated API transport at 320/375/390/430/1024 px. Coverage: per-material selection, manual usage, drafts across tabs, successful receiver locking and failed-only retry, capture create/adopt/faded deep links, full arrangement lifecycle, record dialog and overflow. No production writes or paid AI.

An independent branch review found three Important issues: reopening an unsaved capture from the list, canonical/fallback manual candidate matching, and an explicit claims-save action. Four focused reproductions were observed failing and then fixed; the built-release browser suite also covers list re-entry and claims-save visibility. No Critical findings. Minor deferred: the legacy unreachable arrangement renderer and obsolete thumbnail-loading note in EnglishImageInbox remain for later cleanup.

Shared source assets/tokens are unchanged; UI overrides are route scoped. No study area or weekly-board implementation changes and no schema migration.
