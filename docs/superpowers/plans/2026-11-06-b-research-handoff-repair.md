# B research handoff repair implementation plan

Goal: repair the actual natural-language B reply → author discussion → research judgement → paragraph integration → explicit body adoption, preserving original inputs and media.
Architecture: extend existing parsers and research task basis; do not rebuild the workbench or automate GPT. Discussion input and adopted manuscript remain separate.
Spec: docs/b-reply-real-format-audit-2026-11-06.md plus the already approved Q1–Q24 decisions.

## Analysis and choices
- A parser-only patch would recover research but continue discussing the wrong manuscript. An entry-only patch repeats v10's mistake. Repair the complete handoff within existing modules.
- The actual reply demonstrates seven recognizable headings, English labelled research, a direction table and natural experience bullets. Preserve fields and give missing-field/identifier warnings, not just entry counts. Incomplete records remain candidates, never verified evidence.
- No automatic bibliography inference. A visible DOI anchor without its identifier is incomplete. Prompt future replies to include literal DOI/URL and readable scope.
- Research article selection is explicit and visible. Default preserves old current-body behavior, and a candidate can be discussed/integrated without first becoming body. Task basis pins selected text and the body that adoption would replace. Old tasks and backups normalize unchanged.
- Integration adoption must protect against a changed current body even when working from candidate/original, retain the prior body, then return selection to current body.
- Suggestions are surfaced from the discussion section only; alternative candidate-table frameworks must not be mistaken for an approved setting. Separate author confirmation updates settings; intake alone never does.
- Reconfirming the same reply must not duplicate directions/examples/research, or overwrite authored research corrections. Recovered old empty records may fill missing fields only with explicit intake confirmation.
- Existing private article stays in temporary audit input. Commit synthetic fixtures with the same formats.

## Review focus
- Malformed/unknown fields and partial records must remain recoverable in raw, with warnings.
- Candidate digest mismatch and changed current manuscript must block stale integration.
- Preview confirmation cannot modify body or auto-adopt research/settings.
- Round-trip restore must retain source selection, tasks and answers; prior versions have defaults.
- Patch authoritative media HTML with unrelated modules unchanged; native and HTML must agree.

## Tasks
- [x] Add failing structural natural-format tests: research all fields, directions table, experience bullets, missing DOI, duplicate recovery and no auto settings/body adoption.
- [x] Repair reply parser and prompt; surface preview counts/fields/warnings and explicit framework/closure confirmation.
- [x] Add failing version-selection tests (candidate without adoption, stale candidate/body protection, source restore, adoption switch).
- [x] Implement article source normalization, immutable task basis, selection UI and native/offline adoption transition.
- [x] Run targeted, full creative-studio, build/types/lint and actual browser path across both realms; check 320/390/430 widths.
- [x] Patch the same authoritative HTML v10, test research/discussion/backup/media preservation, replace same preview identity, record actual evidence and pending phone acceptance.
