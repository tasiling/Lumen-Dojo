# Today and Calendar Approved Design Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Preserve existing application behavior while integrating the approved visual reference.

**Goal:** Bring the approved Today/calendar mobile prototype v1.6 into the existing application.

**Architecture:** Keep the current React state, authenticated APIs, daily/weekly records, and existing components. Add route-scoped CSS and decorative SVG components; reuse the existing calendar PATCH API for the missing edit affordance. A separate shared palette records the approved surface/ink roles without recoloring other page owners' work.

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript, CSS, native SVG and dialog.

**Spec:** `docs/today-calendar-approved-design.md` (approved design and integration ledger).

## Global Constraints

- Only Today `/` and Calendar `/calendar`, including their shell, receive the new styling.
- Preserve all daily fields, depth modes, continuations, task colors, English rhythm, milestones, measurement panels, and formal data endpoints.
- Pink `#F2C8D1` → lavender `#DDD9EF` → blue `#B9CCE8` is Today-only.
- Use the final glass sphere with no central ellipse, short highlights, and the large highlight inset at radius 66.
- Calendar uses continuous warm 1px grid lines, 3:4 cells, 42 Monday-first dates, and pale blue inset selection.
- Use system Chinese 16px/1.65 body, Songti TC headings, 22px phone gutters (16px below 360px), 24px block gaps, SVG 1.7 strokes, five bottom navigation items, safe area reserve.
- Approved six surface/ink pairs are listed in the spec. Never use the pale surface colors as white-text small-button backgrounds.

## Review Focus

- Month/week/day navigation across year/leap boundaries must move the selected period correctly.
- An existing event edit uses PATCH with its ID and retains its draft after a failed save.
- Input values, handlers and API calls must survive the visual integration unchanged.
- Both initial rendering and return navigation must show the approved motif and colors.
- Styles must not apply to practice, forage, weekly or other page owners' routes.

## Tasks

1. Add and run calendar navigation / edit payload validation tests; implement focused UI helpers. Keep shared domain models unchanged.
2. Add SVG/icon components, approved realm palette, Today jump links/anchors, and route-scoped shell/CSS. Replace presentation only.
3. Keep all calendar views and sources; add edit controls backed by the existing PATCH route and period-aware navigation. Validate errors before submitting.
4. Run meaningful component/controller checks, existing daily/weekly regressions, TypeScript and production build. Review the diff, then commit, push and open a draft PR. Do not merge or deploy without the user's publication instruction.

Browser QA is unavailable in this environment; do not substitute a rendered SVG for a browser screenshot or claim Safari verification.
