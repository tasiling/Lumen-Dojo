import type {ReadingBook, ReadingNote} from './types';
/** All saved structured fields, with labels; original excerpts and reflections stay separate. */
export function readingNoteContent(note:Pick<ReadingNote,'kind'|'text'|'metadata'>):string {
 const m=note.metadata;
 const field=(label:string,value?:string)=>value?.trim()?`${label}：${value}`:'';
 if(note.kind==='preview')return [field('目前理解',m.currentUnderstanding||note.text),field('想確認',m.verificationFocus)].filter(Boolean).join('\n\n');
 if(note.kind==='review')return [field('理解改變',m.changedUnderstanding||note.text),field('仍想查證',m.openQuestion),field('接下來',m.nextStep)].filter(Boolean).join('\n\n');
 return note.text;
}

// Labels retained by the first Magic Shop trial before selectionLabel was stored on excerpts.
const trialTitles = new Map([
  ["露絲告訴我焦慮是白白浪費時間", "焦慮與努力"],
  ["詹姆斯，是你的思想創造你的現實，如果你不自己創造就會變成由別人來創造你的現實。", "思想與現實"],
]);

export function readingSelectionLabel(book: ReadingBook, note: ReadingNote, archiveLabel?: string) {
  const savedLabel = note.metadata.selectionLabel || archiveLabel;
  if (savedLabel) return savedLabel;
  if (note.kind === "excerpt" && book.readCount === 1 && book.title.includes("是最強大的魔法")) {
    const text = note.text.trim().replace(/^「|」$/gu, "");
    const title = trialTitles.get(text);
    if (title) return title;
  }
  return note.kind === "excerpt" ? "書中摘錄" : note.kind === "thought" ? "我的想法" : "我的筆記";
}
