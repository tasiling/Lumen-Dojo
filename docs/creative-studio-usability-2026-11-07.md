# Creative studio copy and layout revision

## User request and limits

The user has tested the functions successfully, but the wording, hierarchy and layout require too much interpretation and make accidental actions feel likely. This revision applies the already-approved plain-language naming rules to the existing prototype. Keep realm identity, eight method names, data, prompt protocols, source checks, version/history semantics and external ChatGPT copy/paste intact. Do not deploy or remove legacy tools.

## Audit findings

1. Several buttons name the intended AI task instead of the immediate website action: `整理目前討論` and `將採用重點整合進文章` actually copy a prompt. Labels must say copy, and explain the external ChatGPT step.
2. `採用 B 為可編寫稿` sometimes previews and sometimes changes the body immediately. Use one explicit review/confirmation path and place the article-selection action with the article it affects.
3. `候選／當輪／快照／固定／交接／主閉合／判讀` are mixed with reader-facing prose. Keep necessary concepts, translate the UI into article choices, saved drafts and author decisions; preserve protocol headings and storage keys.
4. Source metadata, archive actions, raw instruction text, histories and file imports compete with current writing actions. Group them by purpose and collapse occasional controls; keep research choices and the author's answers directly accessible.
5. Deeply nested bordered sections consume phone width. Use section hierarchy with fewer nested borders, consistent label spacing, full-width long actions and readable line lengths. Preserve both realm palettes and the app navigation.

## Implementation plan

1. Record wording changes by existing component; distinguish copying, adding a reply to this draft, selecting research, replacing article text, saving and marking completion.
2. Refine entry guidance, work navigation, B intake, research discussion, C/D descriptions and instruction transfer. Give the B article-replacement action a consistent preview plus explicit confirmation.
3. Group occasional source/file/history controls. Show the common next action before advanced controls; preserve all existing routes and functions.
4. Apply scoped mobile layout changes and inspect actual Chinese rendering, normal/150% text, 320–430 px, landscape and desktop. Verify labels, contrast, touch size, focus visibility and spacing.
5. Update browser assertions for deliberate label changes while retaining data/provenance/clipboard/backup assertions. Check selection/preview cannot overwrite the body, explicit confirmation can, and copy buttons emit the expected task.
6. Patch the reviewed media HTML without rebuilding older media adapters, publish the same file as the next draft version, and report test scope plus phone acceptance limits.

## Design decisions

Use plain action-and-result language, one primary action per local task, existing realm colors and system CJK fonts. Changing the confirmed function model or re-skinning the whole app would introduce unrelated risk; a label-only pass would leave the misleading duplicate actions and vertical hierarchy intact. This is a focused revision of the existing interface, not a new workflow design requiring new product decisions.


## Verification and limits

- The final source passed scoped ESLint, TypeScript and Next production build. The existing creative-studio data/API suite passed without changing domain instructions, storage models or raw reply protocols.
- New usability browser checks passed 8/8 in native and HTML: even an already-reviewed article opens preview; cancel leaves the body unchanged; final confirmation preserves the old body/raw reply; secondary steps begin closed; copy emits the real saved prompt; small phone widths remain usable.
- That new check exposed a real consequence of the new confirmation path: the old preview initializer preferred the AI article over an author's already-edited candidate. It now preserves the author's candidate when its reply binding is current. The regression was observed failing before correction.
- Native data-boundary, research recovery/discussion, clipboard, B return, dual-C/integration, completion/D/handoff, conflict/unsaved-input and entry checks passed. Tests were updated to use the new visible labels, open the clearly labelled instruction drawer and click the now-required confirmation; data, clipboard and history assertions were retained.
- HTML supported suites passed: usability 8; research recovery 10; natural return 10; discussion entry 10; discussion 13; research integration/backup 13; clipboard 7; B repair/backup 11; retained media/backup 3. Three native-only test scripts were initially attempted against file mode and rejected connection to their required fixture server; they were subsequently run in the native environment, not counted as HTML results.
- Final HTML layout audit: 210 realm/state/viewport cases, 0 undersized controls, 0 spacing/label gaps, 0 horizontal overflows, 0 unnamed fields, no uncaught errors or covered focus targets; tested text/placeholder contrast passed. It covers 320/375/390/430 px, 150% type, landscape and desktop, plus existing media views.
- Reviewed actual Chinese screenshots using Noto Sans CJK TC in the test runtime. Existing realm colors/navigation remain in place. This does not substitute for the user's iPhone/Safari or prove subjective ease of use.
- All updates remain draft-only. Existing media adapters, eight named creation methods, private material, authored prose and external ChatGPT copy/paste remain intact. No publication or automatic AI was added.

## Scoped correction retained

A technically working action can still mislead when its label describes an eventual AI task instead of the immediate website result. Name the immediate action, distinguish selecting content from changing the article, and preserve user edits when adding a review screen. A spacing audit alone is not an ease-of-use review.
