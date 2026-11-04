import { normalizeDirections, type StudioDirection } from './model';
export function nativeDirection(d: Record<string, unknown>): StudioDirection {
 return normalizeDirections([{id:String(d.id),title:String(d.title || '未命名方向'),question:String(d.question || ''),angle:String(d.angle || ''),details:structuredClone(d),versions:(Array.isArray(d.versions)?d.versions:[]).map(x=>{const v=x as Record<string,unknown>;return{id:String(v.id),statement:String(v.statement || ''),note:String(v.unresolved || v.note || ''),createdAt:String(v.createdAt || '')};})}])[0];
}
