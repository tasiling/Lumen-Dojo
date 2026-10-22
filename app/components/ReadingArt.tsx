import { ForageMotif } from "./ForageIcon";

type Kind = "book" | "cards" | "return" | "check" | "plus";
export function ReadingIcon({ kind }: { kind: Kind }) {
  return <svg className="reading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "book" && <><path d="M12 6C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/><path d="M5 8c2 0 3 .3 4 1m6 0c1-.7 2-1 4-1"/></>}
    {kind === "cards" && <><rect x="7" y="6" width="14" height="16" rx="3"/><path d="M16 3H6a3 3 0 0 0-3 3v11m8-6h6m-6 4h4"/></>}
    {kind === "return" && <><path d="M4 8V3m0 5h5M4 8a9 9 0 1 1-1 8"/><path d="M12 7v5l3 2"/></>}
    {kind === "check" && <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>}
    {kind === "plus" && <path d="M12 5v14M5 12h14"/>}
  </svg>;
}

export function ReadingHeaderArt({ kind }: { kind: "book" | "cards" | "return" }) {
  return <><ForageMotif/><span className="reading-heading-icon"><ReadingIcon kind={kind}/></span></>;
}
