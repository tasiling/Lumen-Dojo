# Weekly mobile v2.5 integration

Goal: integrate the approved weekly HTML into /bingo using existing Notion records and completion flow.
Architecture: retain native React page and APIs; add scoped CSS, versioned template migration, checklist/lifecycle fields, and a separate continuation ledger so archived snapshots remain immutable.
Spec: approved weekly-preview.html v2.5 and weekly-vocabforge-tasks.txt.
Constraints: no changes to other pages; 5x5 square centered cells; full gold connected cells with thick gold border and foreground line; preserve existing board IDs, completion sources, reflections and custom templates; no demo tasks inserted into real boards.

- [x] Test and implement template migration: 27 routines, four projects, 36 detailed VF candidates in six groups, retired templates accessible, custom edits and project status preserved.
- [x] Test and implement checklist normalization and explicit pause/cancel/continuation guards, retaining old completion modes and daily synchronization.
- [x] Integrate native selection, one-off/optional reusable save, project editing, room checklist and continuation controls.
- [x] Apply weekly-only layout, icons, wording and measured line geometry. Check 320–430px widths where browser tools permit.
- [ ] Run weekly tests, boundary tests, type checks, production build and review focused diff. Commit/push PR, merge approved scope, publish exact commit through existing Railway service, verify terminal deployment state.

Review focus: legacy custom edits; full/archived carry targets and retry; stale versions; checklist undo through daily flow; source snapshots after carry.
