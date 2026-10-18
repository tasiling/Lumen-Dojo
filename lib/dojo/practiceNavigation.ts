import type {Definition} from './assessments/model';
import type {AttemptSummary} from './assessments/progress';
import type {LearningEntity} from './learningFoundation/model';

export function practiceFlowLinks(learningItem?:string){
  const query=learningItem?'?'+new URLSearchParams({learningItem}).toString():'';
  return [
    {id:'emotion',href:'/practice/emotion',title:'心・情私人整理',detail:'留下覺察與探索，不自動轉成能力或學成卡。'},
    {id:'records',href:'/practice/records'+query,title:'學習紀錄',detail:'保留作品與來源；寫完紀錄不等於學會。'},
    {id:'external',href:'/practice/records',title:'跨站成果與待關聯來源',detail:'在完整歷程明確同步、核對或關聯語境修習室與 VF 成果。'},
    {id:'assessments',href:'/practice/assessments'+query,title:'能力規準與驗收',detail:'明確選證據、逐項評核，再確認具體能力。'},
    {id:'mastery',href:'/dao/mastery'+query,title:'道藏學成卡',detail:'明確收藏已確認成果，保留階級與回訪歷史。'},
    {id:'atlas',href:'/practice/atlas',title:'光行・光法圖鑑',detail:'選填、不計分的實踐標記，與能力五階分開。'},
  ];
}
export function assessmentScope(definitions:Definition[],attempts:AttemptSummary[],learningItem?:string){
  const scoped=definitions.filter(d=>!learningItem||d.scope.learningItemId===learningItem);
  const latest=scoped.filter(d=>!scoped.some(other=>other.capabilityId===d.capabilityId&&other.definitionVersion>d.definitionVersion));
  return {latest,attempts:learningItem?attempts.filter(a=>scoped.some(d=>d.capabilityId===a.capabilityId)):attempts};
}
export function assessmentStartItem(entities:LearningEntity[],requested?:string){
  const resolved=resolvePracticeItem(entities,requested);
  return entities.find(e=>e.kind==='item'&&e.status==='active'&&(!resolved||e.id===resolved))?.id??'';
}
export function resolvePracticeItem(entities:LearningEntity[],requested?:string){return requested?entities.find(e=>e.kind==='item'&&(e.id===requested||e.legacyKey===requested))?.id??requested:undefined;}

export const WORKSPACES = [
  "learning",
  "records",
  "manage",
  "legacy",
  "journal",
  "body",
  "emotion",
  "intention",
  "spirit",
  "context",
  "grammar",
  "topic",
  "rhythm",
  "vocabulary",
  "logs",
  "atlas",
] as const;
export function legacyPracticeTarget(
  params: Record<string, string | string[] | undefined>,
) {
  const workspace = params.journal
    ? "journal"
    : params.manifestation
      ? "intention"
      : params.vision
        ? "spirit"
        : params.learningItem
          ? "learning"
          : null;
  if (!workspace) return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const v of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, v);
  return `/practice/${workspace}?${query}`;
}
export function canLeavePractice() {
  return window.dispatchEvent(
    new Event("practice-before-leave", { cancelable: true }),
  );
}
