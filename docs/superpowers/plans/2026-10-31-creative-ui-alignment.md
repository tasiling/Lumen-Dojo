# Creative UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, Native execution already authorized.

**Goal:** Align the two real creative realms across native and retained workspaces without changing persisted contracts.
**Architecture:** Correct the existing creative-interface.css shared primitives and studio.css local layouts; reuse SVG icons and actual React components. Keep the shared bottom navigation and version/save logic.
**Tech Stack:** Existing Next.js 16.2, React 19, TypeScript, CSS, isolated React render QA.
**Spec:** docs/superpowers/specs/2026-10-31-creative-ui-alignment-design.md

## Global Constraints
- Preserve approved colors, gradients, icons, native workflow/data IDs and other realms.
- No UI toolkit, no rebrand, no production data mutations or unreviewed deployment.
- At least 44px control hit areas, 16px fields, red-outline-only current step, 320px usability and 1024px expansion.

## Review Focus
- Generic field rules must not stretch checkbox/radio controls or style the global nav as content buttons.
- Long Chinese titles, ID strings, date/time fields and two-column controls must not escape cards.
- Low-height and text enlargement must keep sticky actions and last field reachable.
- Route entry must keep separate realm accent even after another tool CSS loads.
- UI rearrangement must retain all editable A/B/C/D fields, fixed completion and save/leave behavior.

### Task 1: Shared visual and native workspace corrections
**Files:** creative/creative-interface.css; creativeStudio/studio.css and StudioHome/StudioWorkspace; illustrated/TypographyControls; targeted legacy step styles.
- [ ] Render baseline and record concrete geometry/style defects.
- [ ] Consolidate realm primitives, spacing, responsive shell and action/field/icon rules; improve home signposting and graphic controls.
- [ ] Run exact-width, low-height and enlarged-text native render checks, typecheck and production build; commit.

### Task 2: Verify complete views and deliver
**Files:** scripts/test-creative-ui-alignment.mjs; docs/creative-ui-alignment-delivery.md; docs/creative-build-progress.md.
- [ ] Inspect actual native screenshots and same-source managed preview; test save/step/navigation controls without production writes.
- [ ] Fresh whole-branch review of this UI delta; correct material findings and rerun affected checks.
- [ ] Push to existing PR107 with expected_sha/nonforce, record evidence, pending real-device/production checks and self-improving correction.
