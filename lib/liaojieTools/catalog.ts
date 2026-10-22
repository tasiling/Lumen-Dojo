export const ORIGINAL_TOOLS = [
  { id: 'diamond', name: '知識鑽石框架', purpose: '把想法與草稿，逐步打磨成有觀點的文字。', detail: '保留知識鑽石 2.0、結構與意圖、研究與主文、長文／限動轉譯、心智脈絡網與候選節點。', icon: 'compass' },
  { id: 'sanko-prompt', name: '日上三更・指令產生器', purpose: '完成一篇大眾占卜的製作指令。', detail: '原方法、光站、抽牌與空／雨／傘結構完整保留。', icon: 'sun' },
  { id: 'sanko-batch', name: '日上三更・批次出題產生器', purpose: '安排多日題目、抽牌清單與解析。', detail: '保留日期、方法、逐日編輯、AI 回覆解析、抽牌回填與文字下載。', icon: 'calendar' },
  { id: 'magazine', name: '雜誌對話紀錄模板', purpose: '把對話整理成可發布的雜誌圖文。', detail: '保留 v0.3 的對話編排、逐頁預覽、圖片下載與專案存取。', icon: 'chat' },
  { id: 'carousel', name: 'IG 輪播圖文產生器', purpose: '用對話、雜誌與拱門頁，編排一組輪播。', detail: '保留自動拆頁、字型／圖片、逐頁調整、1080×1350 PNG 與原專案存取。', icon: 'layers' },
] as const;
export type OriginalToolId = typeof ORIGINAL_TOOLS[number]['id'];
export function originalTool(id: string) { return ORIGINAL_TOOLS.find(tool => tool.id === id); }
