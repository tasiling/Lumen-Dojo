import 'server-only';
import { notion, withNotionRateLimit } from '@/lib/notion/client';
import { DATA_SOURCES } from '@/lib/notion/schema';
import { getKnowledgeEntry } from '@/lib/notion/queries';
import { createResolver } from '../readingKnowledge/adapters';
import { sameId } from '../readingKnowledge/model';
import { getKnowledgeClaim } from '../knowledgeClaimStore';
import { activeClaimVersion, knowledgeClaimCanUse } from '../knowledgeClaims';
import { CAPTURE_TITLE_PREFIX, normalizeCaptureEntry } from '../formal';
import { parseSourceRef, sourceHref, type SourceRef, type PolicySource } from './model';
/** A white-listed single-record read, never a database/library scan. */
export async function resolvePolicySource(value:SourceRef):Promise<PolicySource|null>{
  const ref=parseSourceRef(value),[book,note,fragment]=ref.sourceId.split(':');
  try{
    if(ref.sourceType==='forage_capture'){
      const page=await withNotionRateLimit(()=>notion().pages.retrieve({page_id:ref.sourceId}));
      if(!('parent' in page)||page.archived||page.in_trash||!('data_source_id' in page.parent)||!sameId(page.parent.data_source_id,DATA_SOURCES.DB14_知識庫))return null;
      const row=await getKnowledgeEntry(ref.sourceId);if(!row.標題.startsWith(CAPTURE_TITLE_PREFIX))return null;
      let value:unknown;try{value=JSON.parse(row.內容);}catch{return null;}
      const c=normalizeCaptureEntry(value,{id:ref.sourceId});
      if(!c||c.status!=='adopted'||!['C2','C3'].includes(c.creativeMaturity)||!c.destinations.includes('weaving'))return null;
      return{ref,label:c.title,text:c.forageSummary||c.excerpt||c.note,version:c.updatedAt,href:sourceHref(ref)};
    }
    const item=await createResolver().resolve(ref.sourceType==='reading_note'?{kind:'reading_note',recordId:note,parentBookId:book,...(fragment?{fragment:'reflection' as const}:{})}:{kind:ref.sourceType,recordId:ref.sourceId});
    if(!item)return null;
    if(ref.sourceType==='reading_insight'&&!['已驗證','不成立'].includes(item.status))return null;
    if(ref.sourceType==='knowledge_claim'){
      const {claim}=await getKnowledgeClaim(ref.sourceId);if(!knowledgeClaimCanUse(claim,'perspective'))return null;
      const active=activeClaimVersion(claim)!;return {ref,label:item.title,text:active.statement,version:active.id,href:sourceHref(ref)};
    }
    return {ref,label:item.title,text:item.text,version:item.sourceVersion,href:sourceHref(ref)};
  }catch(e){if(typeof e==='object'&&e&&'status' in e&&e.status===404)return null;throw e;}
}
