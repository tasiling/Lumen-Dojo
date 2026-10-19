import type {ReadingNote} from './types';
/** All saved structured fields, with labels; original excerpts and reflections stay separate. */
export function readingNoteContent(note:Pick<ReadingNote,'kind'|'text'|'metadata'>):string {
 const m=note.metadata;
 const field=(label:string,value?:string)=>value?.trim()?`${label}：${value}`:'';
 if(note.kind==='preview')return [field('目前理解',m.currentUnderstanding||note.text),field('想確認',m.verificationFocus)].filter(Boolean).join('\n\n');
 if(note.kind==='review')return [field('理解改變',m.changedUnderstanding||note.text),field('仍想查證',m.openQuestion),field('接下來',m.nextStep)].filter(Boolean).join('\n\n');
 return note.text;
}
