# Discussion handoff correction — 2026-11-08

## Scope and reproduced failure

The user clicked “複製繼續討論的指令” and ChatGPT asked them to choose between discussion and reviewing the editing output. Current authoritative preview is Library version 18, SHA-256 `1dea259eaf80b7289fccaaec6d440f1ae2baa60ee51167f7b43cc76d9f506546`.

The actual discussion generator accepted an empty author question, included the entire imported B editing output, and ended with an empty “目前回覆” label. Its generic continuation instruction did not specify what to discuss when the question was empty. A synthetic execution of that real bundled generator reproduced these conditions. This explains a plausible handoff failure; it does not establish exactly what was in the user's clipboard or reproduce the external model's answer.

## Implementation

- One shared brief supplies the UI's visible copy purpose and the generated discussion task. It identifies the article/research/point task and included history, so users can inspect the next action before copying.
- Put the author's current question and pending or latest included answer to the selected turn before article/reference data. A pending answer saved by preparation has the same brief as before preparation. Excluded saved answers stay excluded.
- When neither question nor answer is present, give a concrete start: discuss selected research's relationship/limits, the selected point's use, or the article's intended meaning. Ask one content question, without re-asking whether the author wants discussion or review.
- Keep article/source data and full verbatim history in clearly labelled sections. End with the current task, instead of an empty reply field. Historical instructions/platform drafts are marked as background data.
- Natural discussion remains natural text. Summary and article-integration protocols, task/source digests, manual adoption, raw replies, old tasks, version checks, privacy gates and external copy/paste remain unchanged.
- Instruction-transfer headings identify discussion, discussion-summary or article-integration; the re-copy action repeats the saved instruction.

## Test evidence

- New domain regression was observed failing on the missing explicit task before implementation, then passed 6/6, covering empty questions, selected-only research, question priority, pending/saved answers, excluded history, immutability, backup normalization and source privacy.
- Entire `npm run test:creative-studio` passed (165 PASS lines, including suite summaries).
- New browser handoff checks passed 8/8 in HTML: visible purpose, actual copy equal to saved task, first-turn/continuation context, separate answer saves, correctly bound natural reply, body unchanged, reopen and phone/enlarged text.
- Existing HTML natural-discussion and research-adoption/backup suites passed 13/13 each; retained media creation/reopen/full-backup passed 3/3. Retained publication create/save/reopen, fixed review, platform formatting/preview and ready confirmation passed without actual publication.
- Final layout audit with actual Traditional Chinese font: 210 cases; zero small controls, spacing/label gaps, horizontal overflows or unnamed fields; contrast and uncovered focus passed. An earlier run without a CJK font reported undersized return links due to missing-glyph metrics; restored the real font and reran rather than changing the preserved links to fit broken rendering.
- Initial clean-checkout `tsc` lacked generated Next `RouteContext` declarations. After production build generated them, standalone TypeScript passed; scoped ESLint passed. Production build passed. Native browser suites also passed: handoff 8/8, discussion 12/12, research 12/12 and clipboard 7/7 (including real Chromium clipboard paste).

## Preview preservation and delivery limits

The v18→v19 updater replaces only compiled research workflow and workbench modules. All 101 other modules and every existing style block remain byte-for-byte, including the media adapter and newer review/publication workspace. No state schema migration, production deployment or legacy removal is performed.

This is a tested prompt/interface correction, not a guarantee about external ChatGPT behavior. The user's real clipboard, iPhone embedded browser and actual next ChatGPT reply remain acceptance checks. No private manuscript is included in these synthetic tests.

## Project lesson

Clipboard success and readable buttons do not establish that the next AI conversation will start with the intended task. Test the no-new-question/imported-editor-output starting point, show the immediate task before copying, and keep current author intent ahead of historical suggestions. This is a scoped project correction, not a new global preference or a claim of cross-conversation skill-state synchronization.
