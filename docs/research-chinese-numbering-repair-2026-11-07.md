# Chinese-numbered B research intake repair

The user's natural GPT reply contained a `研究參考` section with two studies headed `一、…` and `二、…`. The preview displayed the section verbatim but reported zero research records. This was a parser defect, not a missing source or an author decision against citation.

## Reproduction and cause

Added a synthetic-manuscript fixture preserving the reported heading/field structure. Before the fix, the new regression failed `0 !== 2`; the other twelve existing cases passed. `parseReply` correctly found the section. `entries` only accepted R-prefixed numeric records. Previous checks covered R1/R2, including bare headings, but did not cover Chinese numbering; their success did not justify a claim that natural replies were fully supported.

## Change

Research entries now also accept Chinese and Arabic numbered headings, including Markdown heading prefixes and fullwidth digits. This alternative is scoped to research, leaving A/D candidate parsing unchanged. Existing labelled-field handling preserves title, source, mechanism, limitations and article relation. Studies remain unchosen background candidates until the author decides; no source is scientifically verified by this parser. Full original replies and manuscript adoption boundaries are unchanged.

## Verification scope

- Pure/API regression suite: `npm run test:creative-studio` passed; natural handoff group 14/14. Includes old R formats, Chinese/Arabic/fullwidth/Markdown numbering, prose negative case, duplicate prevention and immutable history/body boundaries.
- HTML browser handoff 8/8: both realms, preview shows two studies, confirmation, selection, exact next task sources, explicit integration/adoption and reopen.
- HTML recovery 10/10: previously saved B with empty research list, recover in place, preserve body/candidate/raw/historic tasks, select studies into next task, reload and 320/390/430 widths.
- Scoped ESLint, TypeScript and production build passed.
- HTML updater pins the reviewed version 13 hash; only compiled reply module changes. Media and offline persistence modules remain byte-identical.

Phone Safari, native phone clipboard, private user backup and scientific correctness of the supplied research remain outside these automated checks. No production deployment or legacy removal is authorized by this repair.

## Scoped correction and future guard

Explicit user correction: repeated zero-research output despite two visible studies. When validating natural AI output, exercise multiple ordinary numbering schemes through preview, confirmed list, selected source task and reopen. A visible raw section is not successful structured intake. Keep failed regression evidence before changing code, and distinguish found candidate count from author-approved citation count. This lesson is recorded here without copying the user's private manuscript into the repository.
