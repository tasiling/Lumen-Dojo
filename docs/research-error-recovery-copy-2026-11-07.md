# Research extraction failure: explicit error and recovery

The user correctly identified that `待解析` suggests a queued job. Research extraction is synchronous and nothing continues in the background after failure. Renaming a failed extraction to a pending state obscured the real problem.

## Resulting behaviour

- B preview and research-list recovery say **研究辨識失敗，原文已保留**, with a cause and the explicit explanation that the website will not continue recognition in the background.
- The extraction preview carries an optional `researchFailure` reason. Components use this state instead of matching translated warning wording. Explicit empty arrays still mean an empty result; failure is not displayed as zero studies.
- Both locations offer three actual recovery controls: focus the unchanged full B reply for editing, synchronously retry recognition, or open the existing manual research fields and focus the name/add control. Retry leaves any manually edited candidate preview intact.
- Manual fields remain the existing independent research editor, with default unchosen background use. No automatic citation, body adoption or manuscript change was added. Raw replies, body, candidate and prior tasks retain the same data boundaries.
- A/C/D's shared intake summary also avoids reporting zero for a known extraction failure. The discussion context labels its count as already-saved studies.

## Validation

- Updated the existing negative browser flow before implementation; version 15 failed to find the promised explicit error.
- Full creative-studio data/API suite passed, including natural handoff 18/18. Scoped ESLint, TypeScript and production build passed.
- Both realms are exercised from malformed B input through error display, original-text focus, immediate retry, manual editor reveal, correction to valid prose-wrapped JSON, and successful two-study preview. Existing selection, source-task binding, explicit integration and reopen remain exercised.
- The error actions are checked at 320/390/430 px for no horizontal overflow and minimum 44 px height. Initial internal screenshots exposed a missing CJK font in the test runtime; Noto Sans CJK TC was restored and the phone tests were rerun before visual review. The font is a test-runtime dependency, not a product style change.
- Updated HTML is based on reviewed version 15 SHA `6ff21046ac1263589fb83136d325fc8f2a7e8f517f680ca1c86779d08c7f839b`, with module 61 (existing manual research editor) explicitly included in the scoped merge. Unrelated media/persistence modules remain unchanged.

This is an isolated draft/HTML correction. Actual iPhone Safari and private user backup acceptance remain separate; production is not deployed.

## Project lesson

Use pending/waiting language only for an actual queued or running operation. A synchronous failure needs a truthful error state, preserved input, an actionable next step and reachable recovery controls. User-facing wording must not serve as the component's internal error-state discriminator.
