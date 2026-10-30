import type { WorkflowStep } from './weavingWorkflow/model';

export type CreativeIconName = 'document'|'compass'|'pen'|'eye'|'handoff'|'layers'|'sprout'|'inbox'|'chat'|'clock'|'grid'|'sun'|'add'|'chevron'|'back'|'tools'|'calendar'|'diamond';
export const CREATIVE_STEPS: ReadonlyArray<{key:WorkflowStep;label:string;icon:CreativeIconName}> = [
  {key:'sources',label:'選素材',icon:'document'},
  {key:'concept',label:'定觀點',icon:'compass'},
  {key:'production',label:'製作內容',icon:'pen'},
  {key:'review',label:'預覽定稿',icon:'eye'},
  {key:'handoff',label:'準備發布',icon:'handoff'},
];
