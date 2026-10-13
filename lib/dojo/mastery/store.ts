import 'server-only';
import {notion,withNotionRateLimit} from '@/lib/notion/client';
import {DATA_SOURCES} from '@/lib/notion/schema';
import {createKnowledgeEntry} from '@/lib/notion/mutations';
import {mapKnowledge} from '@/lib/notion/queries';
import {parseJson} from '../formal';
import {LearningError,uuidPattern} from '../learningFoundation/model';
import {withLearningWriteLock} from '../learningFoundation/fileLock';
import {createPracticeOnce} from '../learningFoundation/practiceWrite';
import {learningFoundation,learningOwner} from '../learningFoundation/store';
import {sourceIdentity} from '../practiceEvents/service';
import {assessments} from '../assessments/store';
import {masteryService} from './service';
import type {MasteryEvent,MasteryRepository} from './model';
export const MASTERY_EVENT_PREFIX='行光學成事件-';
function decode(p:Parameters<typeof mapKnowledge>[0]):MasteryEvent{
 const row=mapKnowledge(p),e=parseJson(row.內容) as MasteryEvent|null;
 if(!e||e.recordType!=='mastery-event/v1'||e.owner!==learningOwner||!uuidPattern.test(e.id)||!uuidPattern.test(e.cardId)||!uuidPattern.test(e.capabilityId)||!Number.isSafeInteger(e.revision)||e.revision<1||!['grant','associate','withdraw','reinstate'].includes(e.kind)||row.標題!==MASTERY_EVENT_PREFIX+e.id)throw new LearningError('學成事件 owner 或格式不符',403);
 return e;
}
export const masteryRepository:MasteryRepository={
 owner:learningOwner,exclusive:withLearningWriteLock,graph:async()=>(await learningFoundation.snapshot()).entities,confirmedAttempt:id=>assessments.collectionAttempt(id),
 async events(){const events:MasteryEvent[]=[],ids=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined;
  do{const page=await withNotionRateLimit(()=>notion().dataSources.query({data_source_id:DATA_SOURCES.DB14_知識庫,filter:{property:'標題',title:{starts_with:MASTERY_EVENT_PREFIX}},page_size:100,...(cursor?{start_cursor:cursor}:{})}));
   if(page.has_more&&(!page.next_cursor||cursors.has(page.next_cursor)))throw new LearningError('學成歷程分頁不完整，請稍後重試',503);
   for(const p of page.results){const e=decode(p);if(ids.has(e.id))throw new LearningError('學成事件 ID 重複',409);ids.add(e.id);events.push(e);}
   if(!page.has_more)break;cursors.add(page.next_cursor!);cursor=page.next_cursor!;
  }while(cursor);return events;
 },
 async event(id){if(!uuidPattern.test(id))throw new LearningError('學成事件 ID 不正確');const page=await withNotionRateLimit(()=>notion().dataSources.query({data_source_id:DATA_SOURCES.DB14_知識庫,filter:{property:'標題',title:{equals:MASTERY_EVENT_PREFIX+id}},page_size:2}));if(page.has_more||page.results.length>1)throw new LearningError('學成事件 ID 重複',409);return page.results.length?decode(page.results[0]):null;},
 async append(e){await createPracticeOnce(sourceIdentity(learningOwner,'mastery','card-revision',`${e.cardId}:${e.revision}`),()=>createPracticeOnce(sourceIdentity(learningOwner,'mastery','event',e.id),()=>createKnowledgeEntry({標題:MASTERY_EVENT_PREFIX+e.id,內容:JSON.stringify(e)},{retryCreate:false})));},
};
export const mastery=masteryService(masteryRepository);
