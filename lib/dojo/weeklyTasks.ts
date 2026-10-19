import { type BingoCell, type WeeklyBoard, mondayOf } from './formal';
export function assertTaskActive(cell:BingoCell,continuedTo?:string){
 if(!cell.text.trim()||cell.index===12)throw new Error('這一格沒有可操作的任務。');
 if(cell.disposition)throw new Error('請先恢復暫停或取消的任務。');
 if(continuedTo)throw new Error(`這項任務已續排至 ${continuedTo}，請到後續週盤記錄進度。`);
}
export function carryToWeek(source:WeeklyBoard,target:WeeklyBoard,index:number):WeeklyBoard{
 const cell=source.cells[index];if(!cell)throw new Error('找不到原任務。');assertTaskActive(cell);
 if(cell.completed||!cell.taskInstanceId)throw new Error('只能續排尚未完成的任務。');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(target.weekStart)||Number.isNaN(Date.parse(target.weekStart+'T12:00:00Z'))||mondayOf(target.weekStart)!==target.weekStart||target.weekStart<=source.weekStart)throw new Error('請選擇原週之後的有效週一日期。');
 if(target.archivedAt)throw new Error('目標週盤已封存。');
 if(target.cells.some(c=>c.taskInstanceId===cell.taskInstanceId))return target;
 const slot=target.cells.find(c=>c.index!==12&&!c.text.trim());if(!slot)throw new Error('目標週盤已滿，請先留一個空白格。');
 const next=structuredClone(target);next.cells[slot.index]={...structuredClone(cell),index:slot.index,assignedDate:null,assignedCategory:null,carriedFrom:cell.carriedFrom||source.weekStart};next.colorsConfirmedAt=null;return next;
}
export const carryRecordTitle=(week:string,id:string)=>`行光續排-${week}-${id}`;
export type WeeklyCarryLink={weekStart:string;taskInstanceId:string;targetWeek:string;status:'pending'|'complete'};
