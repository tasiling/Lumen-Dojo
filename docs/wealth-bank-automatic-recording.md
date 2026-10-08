# Bank screenshot dates and LINE results

The OCR endpoint accepts optional `referenceDate` (YYYY-MM-DD) from Luminara. This is the original image receipt date in the owner's timezone, retained on retry. It resolves only the year of a visible calendar heading; neither upload day nor Today/Yesterday alone supplies a missing transaction date. Each row carries its own visible `date_header`, so October 7 purchases and an October 6 Medibank credit remain separate. Parsed headers validate calendar dates, visible weekdays and a bounded past-year range.

The optional second OCR pass now runs for missing date, account, direction or visibility evidence as well as missing amounts. A unique matching row may fill only compatible, visibly supported fields; conflicting dates, amounts, currencies, directions or account hints preserve the first result. Missing data remains reviewable.

LINE replies include linked history separately from newly recorded rows and report the receiver's recorded expense/income totals. Own transfers and already linked credits are excluded from these totals. The processing request has a 50-second budget for the 24-second OCR pass plus 14-second recovery and transport; unrelated calls retain their 20-second limit.

Release the matching Luminara receiver changes first, then this OCR/LINE change. No migration or new secret is required. Already pending candidates can be repaired using safe retry without reuploading. Same-day balance snapshots still require explicit included/after review when their relation to a purchase is unknown. No production data or deployment was changed during development.

Validation: `npm run check:wealth-bank` passed with 20 bank tests, repository-wide ESLint (one existing image warning), and a full Next production build including TypeScript checking. Targeted bank/route lint and strict TypeScript checks also passed. Tests simulate provider output and transport failures; live OCR against the supplied image and production LINE ingestion have not been run.
