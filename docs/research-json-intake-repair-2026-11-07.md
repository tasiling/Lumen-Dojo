# B research JSON contract and tolerant intake

## User-visible failure

Version 14 fixed numbered research headings but still reported zero for a valid research JSON array surrounded by introductory discussion and source notes. This was another input-path defect. The existing research-judgement parser already tolerated surrounding prose; B reply intake used a separate parser requiring a pure array or the first code fence. Its prompt only said an array was optional. Previous numbered-heading tests did not establish general natural-output compatibility.

## Repair

- B instructions require exactly one JSON array under `研究參考`, with string fields title/source/mechanism/scope/relation; an empty result is explicitly `[]`. Research search status and limits remain separate. Explanations may precede/follow the array. Candidate manuscript instructions exclude framework/closure/editorial metadata from the article field.
- B intake scans balanced arrays inside each already-isolated section, respecting escaped strings and nested brackets/braces. It accepts the relevant record shape, ignores unrelated arrays, and does not execute input or repair invalid JSON. The scan has input/work limits. Multiple matching arrays are unresolved rather than silently choosing the first.
- Failed research parsing raises a visible alert and replaces the misleading zero-research summary with a pending-parse message. The discussion list also says pending instead of zero when unresolved B research awaits recovery. Explicit empty arrays remain ordinary empty results.
- Full raw replies, candidate manuscript, old body, author decisions and historic tasks remain separate. Parsing or confirming research never means source verification or approval to cite it.

## Evidence

- New prose+JSON regression failed `0 !== 2` before implementation; prompt-contract assertion also failed before correction. Later explicit empty-array test exposed and corrected the initial overly broad unresolved warning.
- Full `npm run test:creative-studio` passed; natural-handoff group 18/18 covers prior numbered formats plus prose-wrapped JSON, code fences, quoted brackets/escapes, unrelated arrays, malformed/competing arrays and explicit empty results.
- Browser handoff tests use the new prose+JSON fixture, with synthetic manuscript and equivalent five-field studies. They assert visible count, preserved fields/body, author selections into frozen tasks, explicit integration, reload and unresolved-error handling. Recovery tests start from saved B with no structured studies.
- Scoped ESLint, TypeScript and Next production build passed. HTML retains reviewed version 14 as its base; only intended compiled modules may change, with unrelated media/persistence modules verified unchanged.

No private user manuscript is committed. Scientific correctness, private backup migration and actual iPhone/Safari behaviour are not validated by these tests. This is a draft repair, not deployment or permission to remove legacy tools.

## Correction retained for this project

When natural AI output changes shape, verify the entire output contract against every receiving surface. A fix in research judgement does not fix B intake. Test prose around structured data as well as numbering, and keep extraction failure distinct from an empty result and from author non-adoption. Record the failing counterexample before repair; do not characterize a narrow fixture pass as full natural-output support.
