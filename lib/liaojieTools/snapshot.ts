export type ToolSnapshot = {
  version: 1; tool: string; storage: Record<string, string>;
  fields: Record<string, { value: string; checked: boolean }>;
  outputs: Record<string, string>; state: unknown;
};
export type ToolRecord = { id: string; revision: number; snapshot: ToolSnapshot };
type Data = Record<string, unknown>;
const object = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: Data, keys: string[]) => keys.every(key => typeof value[key] === 'string');
const numbers = (value: Data, keys: string[]) => keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]));
const messages = (value: unknown) => Array.isArray(value) && value.every(m => object(m) && strings(m,['side','name','avatar','text']) && ['left','right'].includes(m.side as string));
function validCarousel(state: unknown): boolean {
  if (!object(state) || !object(state.project) || !Array.isArray(state.fonts)) return false;
  const p=state.project;
  if (!strings(p,['series','handle','paper','teal','ink','fontTitle','fontBody']) || !numbers(p,['footY']) || typeof p.pageNo !== 'boolean') return false;
  if (!Array.isArray(p.pages) || !p.pages.length || p.pages.length>500) return false;
  return state.fonts.every(f=>object(f)&&strings(f,['name','data'])) && p.pages.every(page=>{
    if (!object(page) || !['chat','mag','arch'].includes(page.type as string)) return false;
    // Original Canvas pages contain primitive settings; reject nested values before native code can dereference them.
    if (Object.entries(page).some(([key,value])=>key!=='msgs' && value!==null && !['string','number','boolean'].includes(typeof value))) return false;
    if (page.type==='chat') return strings(page,['label','latin','pill']) && messages(page.msgs) && numbers(page,['size','lh','gap','pad','startY','radius']);
    return strings(page,['title','body']) && numbers(page,['titleSize','titleLH','titleY','size','lh','blockGap','bodyY']);
  });
}
function validMagazine(value: unknown): boolean {
  if (!object(value) || !strings(value,['seriesLabel','partnerName','topic','partnerMark','brandMark','bg','green','photo','rawSource','disclaimer'])) return false;
  if (!Array.isArray(value.turns) || !value.turns.every(t=>object(t)&&strings(t,['speaker','text']))) return false;
  if (!Array.isArray(value.pages) || !value.pages.length || !Number.isInteger(value.current) || (value.current as number)<0 || (value.current as number)>=value.pages.length) return false;
  return value.pages.every(p=>object(p)&&['cover','dialogue','feedback','quote'].includes(p.type as string)&&strings(p,['title','body','footer'])&&numbers(p,['titleSize','bodySize','bubbleGap','topOffset'])&&Array.isArray(p.bubbles)&&p.bubbles.every(b=>object(b)&&strings(b,['speaker','text'])));
}
function validBatch(value: unknown): boolean {
  if (!object(value) || !Array.isArray(value.days) || value.days.length>30 || !strings(value,['batchDays','startDate'])) return false;
  const branches=(x:unknown)=>Array.isArray(x)&&x.every(b=>object(b)&&strings(b,['label','card'])&&numbers(b,['count']));
  return value.days.every(d=>object(d)&&numbers(d,['day'])&&strings(d,['date','station','method'])&&(d.date===''||/^\d{4}-\d{2}-\d{2}$/.test(d.date as string))&&object(d.morning)&&strings(d.morning,['intro'])&&branches(d.morning.branches)&&object(d.daylight)&&strings(d.daylight,['method','question'])&&(d.daylight.branches===null||branches(d.daylight.branches))&&(d.daylight.tiers===null||branches(d.daylight.tiers)));
}
export function validSnapshot(value: unknown, tool: string): value is ToolSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.tool !== tool || !v.storage || !v.fields || !v.outputs) return false;
  const record = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
  const state = v.state as Record<string, unknown> | null;
  if (tool === 'diamond' && (!record(state) || !Array.isArray(state?.nodes) || state.nodes.some(n => !record(n) || typeof n.desc !== 'string' || typeof n.axis !== 'string' || typeof n.source !== 'string' || typeof n.checked !== 'boolean'))) return false;
  if (tool === 'carousel' && !validCarousel(state)) return false;
  try {
    const storage=v.storage as Record<string,string>;
    if (tool==='magazine' && storage['xingguang-magazine-dialogue-v0-3'] && !validMagazine(JSON.parse(storage['xingguang-magazine-dialogue-v0-3']))) return false;
    if (tool==='sanko-batch' && storage.qgen_state_v13 && !validBatch(JSON.parse(storage.qgen_state_v13))) return false;
  } catch { return false; }
  return record(v.storage) && Object.values(v.storage as object).every(x => typeof x === 'string')
    && record(v.outputs) && Object.values(v.outputs as object).every(x => typeof x === 'string')
    && record(v.fields) && Object.values(v.fields as object).every(x => record(x) && typeof x.value === 'string' && typeof x.checked === 'boolean');
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('lumen-original-tools-v1', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('無法開啟裝置儲存'));
  });
}
export async function readTool(id: string): Promise<ToolRecord | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const q = tx.objectStore('drafts').get(id);
    tx.oncomplete = () => { db.close(); resolve(q.result ?? null); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('讀取失敗')); };
  });
}
export async function saveTool(id: string, revision: number, snapshot: ToolSnapshot): Promise<number> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
    let conflict = false;
    const q = store.get(id);
    q.onsuccess = () => {
      if ((q.result?.revision ?? 0) !== revision) { conflict = true; tx.abort(); return; }
      store.put({ id, revision: revision + 1, snapshot });
    };
    tx.oncomplete = () => { db.close(); resolve(revision + 1); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error(conflict ? '另一個視窗已保存新版。目前內容仍保留，請先下載備份，再讀取裝置版本。' : '保存失敗，目前內容仍保留；請下載備份後再重試。')); };
  });
}
