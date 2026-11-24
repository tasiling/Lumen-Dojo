import "server-only";
import { listReadingBooks, listInsightCards } from "@/lib/notion/queries";
import { listManualCards, listStudioDiscussions } from "@/lib/reading/discussionStore";
import { discussionHref, evidenceFor } from "@/lib/reading/discussion";
import { sourcePolicies } from "../creativeSources/store";
import { sourceHref, type SourcePolicy } from "../creativeSources/model";
import { CAPTURE_TITLE_PREFIX, normalizeCaptureEntry, WEAVING_PROJECT_TITLE_PREFIX } from "../formal";
import { normalizeWeavingProject } from "../weavingProjects";
import { legacyBundle, type WeavingShuttle } from "../weavingShuttle";
import { studioTopics, studioWorks } from "../creativeStudio/store";
import { listJsonRecords } from "../notionStore";
import { DECK_PREFIX, DECK_VERSION_PREFIX } from "../illustrated/model";
import { COMIC_PREFIX, COMIC_VERSION_PREFIX } from "../comic/model";
import { VIDEO_PREFIX, VIDEO_VERSION_PREFIX } from "../shortVideo/model";
import { LONG_VIDEO_PREFIX, LONG_VIDEO_VERSION_PREFIX } from "../longVideo/model";
import { PODCAST_PREFIX, PODCAST_VERSION_PREFIX } from "../podcast/model";
import { WEAVING_OWNER } from "../weavingWorkflow/store";

type Card = { id:string; title:string; type:string; idea:string; quote:string; source:string; location:string; author:string; quoteLabel:string; sourceKey:string; context:string; url:string;
  /** The original line a 野採淬鍊 card answers, with its paragraph number. */
  basis?:string };
const shortTitle = (text:string) => {const line = text.split(/[\n。]/)[0].trim() || text; return line.length>46 ? line.slice(0,45)+"…" : line;};
const noteURL = (book:string,note:string) => "/reading/books/"+encodeURIComponent(book)+"?note="+encodeURIComponent(note);
function privacy(policies: SourcePolicy[]) {
  const hidden = new Set(policies.filter(p=>p.discovery==="private").map(p=>p.ref.sourceType+":"+p.ref.sourceId.toLowerCase()));
  return (type:string, id?:string|null) => !!id && hidden.has(type+":"+id.toLowerCase());
}

export async function studioCards() {
  const [manual, discussions, insights, books, policies, captures] = await Promise.all([
    listManualCards(), listStudioDiscussions(), listInsightCards(), listReadingBooks(), sourcePolicies.list(), listJsonRecords(CAPTURE_TITLE_PREFIX)
  ]);
  const blocked=privacy(policies), cards: Card[] = [], handled=new Set<string>();
  for(const c of manual){
    if(c.cardId) handled.add(c.cardId);
    if(!c.share || blocked("reading_note",c.bookId+":"+c.noteId) || blocked("reading_insight",c.cardId)) continue;
    cards.push({id:"manual:"+c.id,title:shortTitle(c.text),type:c.type==="觀點"?"觀點":"洞察",idea:c.text,quote:c.quote,
      source:c.bookTitle,location:c.locator,author:"本人確認的閱讀卡",quoteLabel:c.quoteLabel,sourceKey:"note:"+c.noteId,
      context:[c.text,c.action].filter(Boolean).join("\n"),url:noteURL(c.bookId,c.noteId)});
  }
  for(const thread of discussions) for(const round of thread.rounds){
    const refs=evidenceFor(round), source=round.source;
    for(const c of round.result?.candidates??[]){
      if(c.cardId) handled.add(c.cardId);
      if(c.state==="skipped" || c.evidenceError || !refs[c.anchor] || !c.quote || !c.text ||
        blocked("reading_note",source.bookId+":"+source.noteId) ||
        (c.anchor==="N" && blocked("reading_note",source.bookId+":"+source.noteId+":reflection")) || blocked("reading_insight",c.cardId)) continue;
      const ref=refs[c.anchor], owner=ref.label==="GPT 發言"?"GPT 延伸":ref.label;
      cards.push({id:"discussion:"+round.id+":"+c.id,title:shortTitle(c.text),type:c.type==="觀點"?"觀點":"洞察",idea:c.text,quote:c.quote,
        source:source.bookTitle,location:[source.label,c.anchor].filter(Boolean).join(" · "),author:owner+(c.state==="confirmed"?"，已確認":"，候選卡"),quoteLabel:ref.label,
        sourceKey:(c.anchor==="S"||c.anchor==="N"?source.noteId:round.id)+":"+c.anchor,context:ref.text,url:discussionHref({bookId:source.bookId,discussionId:thread.id,roundId:round.id},source.noteId)});
    }
  }
  const bookNames=new Map(books.map(b=>[b.id,b.title]));
  for(const c of insights){
    if(handled.has(c.id) || blocked("reading_insight",c.id) || !c.insight)continue;
    if(c.refine){
      // A 野採淬鍊 card: its own type, the owner's verbatim words, and the original line it answers.
      const words=c.refine.words||c.insight;
      cards.push({id:"insight:"+c.id,title:shortTitle(c.insight),type:c.refine.cardType||"洞察",idea:c.insight,quote:words,
        source:"野採淬鍊",location:c.refine.discussion,author:"本人原話",quoteLabel:"我的原話",
        sourceKey:"insight:"+c.id,context:[words,c.refine.quote].filter(Boolean).join("\n"),url:sourceHref({sourceType:"reading_insight",sourceId:c.id}),
        ...(c.refine.quote?{basis:c.refine.quote}:{})});
      continue;
    }
    cards.push({id:"insight:"+c.id,title:shortTitle(c.insight),type:"洞察",idea:c.insight,quote:c.insight,
      source:bookNames.get(c.sourceBookId??"")||"心知洞察卡",location:c.status,author:"已留存的洞察卡",quoteLabel:"卡片原文",
      sourceKey:"insight:"+c.id,context:[c.insight,c.action].filter(Boolean).join("\n"),url:sourceHref({sourceType:"reading_insight",sourceId:c.id})});
  }
  for(const row of captures){
    const c=normalizeCaptureEntry(row.value,{id:row.id});
    if(!c || c.status!=="adopted" || !c.destinations.includes("weaving") || !["C2","C3"].includes(c.creativeMaturity||"") ||
        blocked("forage_capture",c.id) || !/訪談|訪問/.test(c.title))continue;
    const quote=c.excerpt||c.forageSummary||c.note;
    if(quote)cards.push({id:"interview:"+c.id,title:c.title,type:"訪談重點",idea:c.forageSummary||quote,quote,source:"野採",location:c.title,
      author:"已送往織光堂的訪談素材",quoteLabel:c.excerpt?"原摘錄":"採集紀錄",sourceKey:"capture:"+c.id,context:c.note||quote,url:"/forage"});
  }
  return {cards};
}

function topic(s:WeavingShuttle){
  const versions=s.coreVersions.filter(v=>v.statement).map(v=>({n:v.number,text:v.statement,time:Date.parse(v.createdAt),from:v.changeNote}));
  return {id:s.id,title:s.title,core:s.coreVersions.find(v=>v.id===s.currentCoreVersionId)?.statement??"", coreVersions:versions,
    dirs:(s.studioDirections??[]).map(d=>({id:d.id,name:d.title,vs:d.versions.map(v=>v.statement)})),notes:[]};
}
const statusNames:Record<string,string>={selecting:"準備中",drafting:"製作中",producing:"製作中",reviewing:"待確認",completed:"已定稿",sent_to_liaojie:"已定稿"};
export async function studioCatalog(){
  const [topics,works,legacy]=await Promise.all([studioTopics(),studioWorks(),listJsonRecords(WEAVING_PROJECT_TITLE_PREFIX)]);
  const result=works.map(w=>({id:w.id,shuttle:w.shuttleId,title:w.title,type:w.format==="video"?"film":w.format,
    status:statusNames[w.status]||"製作中",updated:Date.parse(w.updatedAt),url:"/weaving/works/"+encodeURIComponent(w.id)}));
  for(const row of legacy){
    const p=normalizeWeavingProject(row.value,{id:row.id});if(!p||p.status==="archived"||works.some(w=>w.legacyProjectId===p.id))continue;
    topics.push(legacyBundle(p).shuttle);
    result.push({id:"legacy:"+p.id,shuttle:p.id,title:p.title,type:p.format==="video"?"film":p.format,status:statusNames[p.status]||"製作中",
      updated:Date.parse(p.updatedAt),url:"/weaving/"+encodeURIComponent(p.id)});
  }
  return {topics:topics.map(topic),works:result};
}
const mediaLists=[
  [DECK_PREFIX,DECK_VERSION_PREFIX,"page","illustrated"],[COMIC_PREFIX,COMIC_VERSION_PREFIX,"comic","comic"],
  [VIDEO_PREFIX,VIDEO_VERSION_PREFIX,"film","short-video"],[LONG_VIDEO_PREFIX,LONG_VIDEO_VERSION_PREFIX,"film","long-video"],
  [PODCAST_PREFIX,PODCAST_VERSION_PREFIX,"audio","podcast"]
] as const;
type MediaRow = {owner?:string;currentVersionId?:string;workId?:string;outputRefs?:string[];updatedAt?:string;completionId?:string;title?:string};
export async function studioMediaCatalog(){
  const groups=await Promise.all(mediaLists.map(async ([prefix,versionPrefix,type,path])=>{
    const projects=await listJsonRecords(prefix);
    if(!projects.length)return [];
    const versions=new Map((await listJsonRecords(versionPrefix)).map(r=>[r.id,(r.value as MediaRow)?.title]));
    return projects.flatMap(r=>{
      const item=r.value as MediaRow;
      if(item?.owner!==WEAVING_OWNER||!item.currentVersionId)return [];
      return [{id:"media:"+r.id,type,workId:item.workId,title:versions.get(item.currentVersionId)||"未命名作品",status:item.outputRefs?.length?"已定稿":"製作中",
        updated:Date.parse(item.updatedAt||"")||0,url:"/weaving/"+path+"?projectId="+encodeURIComponent(r.id)}];
    });
  }));
  return {works:groups.flat()};
}
