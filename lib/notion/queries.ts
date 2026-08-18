import { notion, withNotionRateLimit } from "./client";
import {
  DATA_SOURCES,
  PLURK_TEMPLATE_TITLE_PREFIX,
  PLURK_DRAFT_TITLE_PREFIX,
  TRACE_QUERY_WINDOW_DAYS,
  type SankoUpdateType,
} from "./schema";
import {
  readTitle,
  readRichText,
  readSelect,
  readMultiSelect,
  readNumber,
  readDateStart,
  readRelationIds,
  readUrl,
} from "./properties";
import { JOURNAL_QUESTIONS, type JournalQuestionKey } from "@/lib/journal/notionFormat";
import { FORMAL_STATE_TITLE_PREFIXES } from "@/lib/dojo/formal";
import type { SpaceKey, SourceType, TraceLevel, TraceStatus } from "@/lib/dojo/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFilter = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QuerySorts = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NotionPage = any;

// 分頁抓取整個 data source 的查詢結果(節流 + 重試由 withNotionRateLimit 處理)。
export async function queryAll(
  dataSourceId: string,
  filter?: QueryFilter,
  sorts?: QuerySorts
): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await withNotionRateLimit(() =>
      notion().dataSources.query({
        data_source_id: dataSourceId,
        filter,
        sorts,
        start_cursor: cursor,
        page_size: 100,
      })
    );
    results.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return results;
}

// --- DB-01 牌組表 ---
export async function listDecks() {
  const pages = await queryAll(DATA_SOURCES.DB01_牌組表);
  return pages.map((p) => ({
    id: p.id,
    牌組代碼: readTitle(p, "牌組代碼"),
    牌組名稱: readRichText(p, "牌組名稱"),
    總張數: readNumber(p, "總張數"),
  }));
}

// --- DB-02 牌卡表:依識別碼(如 MP-15)查單張卡,用於抽牌輸入驗證與 P8 組稿 ---
export function mapCard(p: NotionPage) {
  return {
    id: p.id,
    卡片識別碼: readTitle(p, "卡片識別碼"),
    牌名: readRichText(p, "牌名"),
    短義: readRichText(p, "短義"),
    長義: readRichText(p, "長義"),
    關鍵字: readMultiSelect(p, "關鍵字"),
  };
}

export async function findCardByIdentifier(identifier: string) {
  const pages = await queryAll(DATA_SOURCES.DB02_牌卡表, {
    property: "卡片識別碼",
    title: { equals: identifier },
  });
  if (pages.length === 0) return null;
  return mapCard(pages[0]);
}

// --- DB-03 抽牌 Session ---
export function mapSession(p: NotionPage) {
  return {
    id: p.id,
    Session編號: readTitle(p, "Session 編號"),
    狀態: readSelect(p, "狀態"),
    模式: readSelect(p, "模式"),
    項目用途: readSelect(p, "項目用途"),
    建立日期: readDateStart(p, "建立日期"),
    抽牌明細: readRelationIds(p, "抽牌明細"),
    產出連結: readUrl(p, "產出連結"),
    使用規則: readRelationIds(p, "使用規則"),
    備註: readRichText(p, "備註"),
  };
}

export async function listSessionsCreatedBetween(startISO: string, endISO: string) {
  const pages = await queryAll(DATA_SOURCES.DB03_抽牌Session, {
    and: [
      { property: "建立日期", date: { on_or_after: startISO } },
      { property: "建立日期", date: { on_or_before: endISO } },
    ],
  });
  return pages.map(mapSession);
}

export async function getSession(sessionId: string) {
  const p = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: sessionId }));
  return mapSession(p as NotionPage);
}

// --- DB-04 抽牌明細:依「對應日期」查區間,用於行事曆與今日待辦 ---
export function mapDetail(p: NotionPage) {
  return {
    id: p.id,
    明細編號: readTitle(p, "明細編號"),
    對應日期: readDateStart(p, "對應日期"),
    抽出順序: readRichText(p, "抽出順序"),
    所屬Session: readRelationIds(p, "所屬 Session")[0] ?? null,
    明細狀態: readSelect(p, "明細狀態"),
    // 日上三更・指令產生器(2026-08-01 擁有者於 Notion 新增):草稿文字與明細層級的
    // 產出連結。批次一次多篇時,每篇各自一則貼文,Session 表頭的產出連結欄裝不下
    // 多篇,改用這裡——Session 表頭的產出連結留給單筆模式或不使用。
    草稿: readRichText(p, "草稿"),
    產出連結: readUrl(p, "產出連結"),
    // 日上三更・批次建立(2026-08-03 擁有者於 Notion 新增):只有這次批次流程
    // 建立的明細會有值,其餘明細此欄留空(不是缺陷,代表不屬於這個批次系統)。
    更次: readSelect(p, "更次") as SankoUpdateType | null,
  };
}

export async function listDetailsForSession(sessionId: string) {
  const pages = await queryAll(DATA_SOURCES.DB04_抽牌明細, {
    property: "所屬 Session",
    relation: { contains: sessionId },
  });
  return pages.map(mapDetail).sort((a, b) => a.明細編號.localeCompare(b.明細編號));
}

export async function getDetail(detailId: string) {
  const p = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: detailId }));
  return mapDetail(p as NotionPage);
}

export async function listDetailsInRange(startISO: string, endISO: string) {
  const pages = await queryAll(DATA_SOURCES.DB04_抽牌明細, {
    and: [
      { property: "對應日期", date: { on_or_after: startISO } },
      { property: "對應日期", date: { on_or_before: endISO } },
    ],
  });
  return pages.map(mapDetail);
}

// 日上三更指令產生器:進入頁面先列出全部待產出明細(依對應日期排序)。
// 空值一律視同「待產出」(既有的防禦性 fallback 規則),用 or 條件把「明細狀態=待產出」
// 與「明細狀態未填」都納入,避免舊資料或任何管道漏寫的空值明細變成黑數,清單看不到。
// 待審核者一併列入(2026-08-01 擁有者新增此狀態):已存草稿、等擁有者確認發布的
// 明細也要能在清單中找到、接續完成,不是只能在建立瀏覽器那次的當下完成。
export async function listPendingDetails() {
  const pages = await queryAll(DATA_SOURCES.DB04_抽牌明細, {
    or: [
      { property: "明細狀態", select: { equals: "待產出" } },
      { property: "明細狀態", select: { equals: "待審核" } },
      { property: "明細狀態", select: { is_empty: true } },
    ],
  });
  return pages.map(mapDetail).sort((a, b) => (a.對應日期 ?? "").localeCompare(b.對應日期 ?? ""));
}

// 日上三更・批次建立與產出清單:抓所有「更次」有值的明細(不限狀態,已產出/
// 已交付也要,才能算出每天 N/3 的完成度),依所屬 Session 分組還原成一批一批,
// 前端再依對應日期展開成日期卡。
export async function listSankoBatchDetails() {
  const pages = await queryAll(DATA_SOURCES.DB04_抽牌明細, {
    property: "更次",
    select: { is_not_empty: true },
  });
  return pages.map(mapDetail).sort((a, b) => (a.對應日期 ?? "").localeCompare(b.對應日期 ?? ""));
}

// --- DB-06 固定項目註冊表 ---
export function mapEvent(p: NotionPage) {
  return {
    id: p.id,
    事件類型: readTitle(p, "事件類型"),
    事件型態: readSelect(p, "事件型態") as "單日" | "多日" | null,
    狀態: readSelect(p, "狀態"),
    宣傳期長度: readNumber(p, "宣傳期長度"),
    場次節奏說明: readRichText(p, "場次節奏說明"),
  };
}

export async function listActiveEvents() {
  const pages = await queryAll(DATA_SOURCES.DB06_固定項目註冊表, {
    property: "狀態",
    select: { equals: "啟用" },
  });
  return pages.map(mapEvent);
}

export async function getEvent(eventId: string) {
  const page = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: eventId }));
  return mapEvent(page as NotionPage);
}

// --- DB-07 序列節點表:依所屬事件查節點模板 ---
export function mapNode(p: NotionPage) {
  return {
    id: p.id,
    節點編號: readTitle(p, "節點編號"),
    錨點: readSelect(p, "錨點") as "首場" | "每場" | "末場" | null,
    相對天數: readRichText(p, "相對天數"),
    內容類型: readRichText(p, "內容類型"),
    目的: readRichText(p, "目的"),
    發布平台: readMultiSelect(p, "發布平台"),
    CanvaTemplateNo: readRichText(p, "Canva 模板編號"),
  };
}

export async function listNodesForEvent(eventPageId: string) {
  const pages = await queryAll(DATA_SOURCES.DB07_序列節點表, {
    property: "所屬事件",
    relation: { contains: eventPageId },
  });
  return pages.map(mapNode);
}

// --- DB-15 場次表:依所屬事件查場次,依場次序排序 ---
export function mapSlot(p: NotionPage) {
  return {
    id: p.id,
    場次編號: readTitle(p, "場次編號"),
    場次序: readNumber(p, "場次序"),
    日期: readDateStart(p, "日期"),
    狀態: readSelect(p, "狀態"),
    當場主題: readRichText(p, "當場主題"),
  };
}

export async function listSlotsForEvent(eventPageId: string) {
  const pages = await queryAll(
    DATA_SOURCES.DB15_場次表,
    { property: "所屬事件", relation: { contains: eventPageId } },
    [{ property: "場次序", direction: "ascending" }]
  );
  return pages.map(mapSlot);
}

export async function listSlotsInRange(startISO: string, endISO: string) {
  const pages = await queryAll(DATA_SOURCES.DB15_場次表, {
    and: [
      { property: "日期", date: { on_or_after: startISO } },
      { property: "日期", date: { on_or_before: endISO } },
    ],
  });
  return pages.map(mapSlot);
}

// --- DB-05 解讀規則庫:P8 組稿用,找「適用項目」對應的現行版規則 ---
export function mapRule(p: NotionPage) {
  return {
    id: p.id,
    規則代碼: readTitle(p, "規則代碼"),
    規則名稱: readRichText(p, "規則名稱"),
    適用項目: readSelect(p, "適用項目"),
    狀態: readSelect(p, "狀態"),
    牌位定義: readRichText(p, "牌位定義"),
    解讀邏輯: readRichText(p, "解讀邏輯"),
    輸出格式: readRichText(p, "輸出格式"),
    版本號: readNumber(p, "版本號"),
  };
}

export async function listCurrentRulesFor適用項目(適用項目: string) {
  const pages = await queryAll(DATA_SOURCES.DB05_解讀規則庫, {
    and: [
      { property: "適用項目", select: { equals: 適用項目 } },
      { property: "狀態", select: { equals: "現行" } },
    ],
  });
  return pages.map(mapRule);
}

// P6 回饋快填用:對象=規則時,選單列出全部現行版規則(不分適用項目)。
export async function listCurrentRules() {
  const pages = await queryAll(DATA_SOURCES.DB05_解讀規則庫, {
    property: "狀態",
    select: { equals: "現行" },
  });
  return pages.map(mapRule);
}

// P6 規則選單兩段式(擁有者裁決):最近 N 天內有 Session 使用過的規則置頂,其餘收進
// 「更多」。純前端分組用的輔助清單,不改變 listCurrentRules() 回傳的資料本身。
// 依 DB-03「使用規則」關聯,取最近 N 天建立的 Session 用過的規則 id 聯集。
export async function listRecentlyUsedRuleIds(days: number): Promise<string[]> {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sessions = await listSessionsCreatedBetween(start, end);
  const ids = new Set<string>();
  for (const s of sessions) {
    for (const ruleId of s.使用規則) ids.add(ruleId);
  }
  return [...ids];
}

// --- DB-09 回饋紀錄 ---
export function mapFeedback(p: NotionPage) {
  return {
    id: p.id,
    回饋編號: readTitle(p, "回饋編號"),
    對象類型: readSelect(p, "對象類型"),
    對象Session: readRelationIds(p, "對象-Session"),
    對象規則: readRelationIds(p, "對象-規則"),
    來源: readSelect(p, "來源"),
    準確度: readNumber(p, "準確度"),
    語感: readNumber(p, "語感"),
    轉換效果: readNumber(p, "轉換效果"),
    可複用性: readNumber(p, "可複用性"),
    問題類型標籤: readMultiSelect(p, "問題類型標籤"),
    短評: readRichText(p, "短評"),
    日期: readDateStart(p, "日期"),
  };
}

// 問題類型標籤累積次數統計(P6「達三次原則」提示用)——全量掃描 DB-09,
// 資料量小(手動快填累積),不特別分頁優化。
export async function countFeedbackTags(): Promise<Record<string, number>> {
  const pages = await queryAll(DATA_SOURCES.DB09_回饋紀錄);
  const counts: Record<string, number> = {};
  for (const p of pages) {
    for (const tag of readMultiSelect(p, "問題類型標籤")) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

// --- DB-08 月主題包:P8 組稿用 ---
export function mapMonthlyTheme(p: NotionPage) {
  return {
    id: p.id,
    月份: readTitle(p, "月份"),
    主題名: readRichText(p, "主題名"),
    深度討論題目: readRichText(p, "深度討論題目"),
    每日互動方向: readRichText(p, "每日互動方向"),
    當月三款主題服務: readRichText(p, "當月三款主題服務"),
    能量關鍵字: readRelationIds(p, "能量關鍵字"),
  };
}

export async function listMonthlyThemes() {
  const pages = await queryAll(DATA_SOURCES.DB08_月主題包);
  return pages.map(mapMonthlyTheme).sort((a, b) => b.月份.localeCompare(a.月份));
}

export async function getMonthlyThemeByMonth(monthKey: string) {
  const pages = await queryAll(DATA_SOURCES.DB08_月主題包, {
    property: "月份",
    title: { equals: monthKey },
  });
  return pages.length > 0 ? mapMonthlyTheme(pages[0]) : null;
}

// --- DB-14 知識庫:P8 組稿用,找語氣指引現行版 ---
// 讀取規則(擁有者 v1.5 補丁明訂):標題以「語氣指引」開頭、核可狀態=已核可,取最新版本筆。
export function mapKnowledge(p: NotionPage) {
  return {
    id: p.id,
    標題: readTitle(p, "標題"),
    內容: readRichText(p, "內容"),
    來源: readSelect(p, "來源"),
    核可狀態: readSelect(p, "核可狀態"),
    連結: readUrl(p, "連結"),
    主題標籤: readRelationIds(p, "主題標籤"),
    狀態: readSelect(p, "狀態"), // 存貨/已排入/已發布(P3 知識庫比對用,勿與「核可狀態」混淆)
  };
}

export async function listToneGuideCandidates() {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫, {
    and: [
      { property: "標題", title: { starts_with: "語氣指引" } },
      { property: "核可狀態", select: { equals: "已核可" } },
    ],
  });
  return pages.map(mapKnowledge);
}

// P8-0(委派書 v1.6):服務導流占卜配對表候選——只取已核可者,App 只撈料不代選。
export async function listApprovedKnowledgeEntries() {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫, {
    property: "核可狀態",
    select: { equals: "已核可" },
  });
  return pages.map(mapKnowledge);
}

// P3 生產日工作台第 3 步「知識庫比對」用:不篩核可狀態,依主題標籤交集比對
// (見 lib/match.ts),只列清單供參考,擁有者自行判斷排入。
export async function listAllKnowledgeEntries() {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫);
  // DB-14 同時承載少量 App JSON 狀態。個人今天／週盤／行程／快速紀錄不是
  // 內容生產素材，不得進入生產日的知識庫比對候選。
  return pages
    .map(mapKnowledge)
    .filter((entry) => !FORMAL_STATE_TITLE_PREFIXES.some((prefix) => entry.標題.startsWith(prefix)));
}

// 噗浪・蓋樓台(2026-08-02 擁有者裁決):範本/草稿都存 DB-14,用標題前綴區分,
// 不新增欄位。見 lib/plurk/notionFormat.ts 的序列化格式。
export async function listPlurkTemplates() {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫, {
    property: "標題",
    title: { starts_with: PLURK_TEMPLATE_TITLE_PREFIX },
  });
  return pages.map(mapKnowledge);
}

export async function listPlurkDrafts() {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫, {
    property: "標題",
    title: { starts_with: PLURK_DRAFT_TITLE_PREFIX },
  });
  return pages.map(mapKnowledge);
}

// 依標題精確比對找單一 DB-14 資料列(收光紀錄一天一筆,靠標題「收光紀錄-
// YYYYMMDD」精確比對找出當天/昨天那一筆,不是前綴掃描整批)。
export async function findKnowledgeEntryByTitle(title: string) {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫, {
    property: "標題",
    title: { equals: title },
  });
  return pages[0] ? mapKnowledge(pages[0]) : null;
}

// 行光道場正式版的個人流程資料沿用 DB-14 JSON 紀錄模式,以穩定前綴隔離
// 每一種資料。查詢端只取指定前綴,不掃描或解碼其他知識庫內容。
export async function listKnowledgeEntriesByPrefix(prefix: string) {
  const pages = await queryAll(DATA_SOURCES.DB14_知識庫, {
    property: "標題",
    title: { starts_with: prefix },
  });
  return pages.map(mapKnowledge);
}

// 依 id 直接取單一 DB-14 資料列(「標記已處理」按鈕用:前端已經從居所接續
// 卡片拿到對應的 Notion page id,不需要再靠標題比對重新找一次)。
export async function getKnowledgeEntry(id: string) {
  const p = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: id }));
  return mapKnowledge(p as NotionPage);
}

// --- DB-11 服務原子庫:P3 第 2 步「服務組合」支援,依月主題包能量關鍵字比對 ---
export function mapAtom(p: NotionPage) {
  return {
    id: p.id,
    原子項名稱: readTitle(p, "原子項名稱"),
    狀態: readSelect(p, "狀態"),
    能量屬性標籤: readRelationIds(p, "能量屬性標籤"),
    可組合性: readRichText(p, "可組合性"),
    價格: readNumber(p, "價格"),
  };
}

export async function listActiveServiceAtoms() {
  const pages = await queryAll(DATA_SOURCES.DB11_服務原子庫, {
    property: "狀態",
    select: { equals: "啟用" },
  });
  return pages.map(mapAtom);
}

// --- DB-18 日記庫:收光改版 3.4/3.5,一天一筆,標題「日記-YYYYMMDD」 ---
export function mapJournal(p: NotionPage) {
  const answers = {} as Record<JournalQuestionKey, string>;
  for (const q of JOURNAL_QUESTIONS) answers[q.key] = readRichText(p, q.key);
  return {
    id: p.id,
    標題: readTitle(p, "標題"),
    日期: readDateStart(p, "日期"),
    answers,
  };
}

export async function findJournalEntryByTitle(title: string) {
  const pages = await queryAll(DATA_SOURCES.DB18_日記庫, {
    property: "標題",
    title: { equals: title },
  });
  return pages[0] ? mapJournal(pages[0]) : null;
}

// --- DB-19 生活痕跡庫:居所兩區(上區/下區)與淡去邏輯的資料層 ---
// (補充裁決04/05)。淡去的實際判斷(7 天門檻)在 lib/trace/rules.ts,不在
// 這裡——這裡只負責把候選集合縮小到查詢窗口內(補充裁決05 §2.1)。
export function mapTrace(p: NotionPage) {
  return {
    id: p.id,
    標題: readTitle(p, "標題"),
    內容: readRichText(p, "內容"),
    space: readSelect(p, "space") as SpaceKey | null,
    sourceType: readSelect(p, "sourceType") as SourceType | null,
    traceLevel: readSelect(p, "traceLevel") as TraceLevel | null,
    traceStatus: readSelect(p, "traceStatus") as TraceStatus | null,
    viewCount: readNumber(p, "viewCount") ?? 0,
    最後動靜時間: readDateStart(p, "最後動靜時間"),
    頻率: readNumber(p, "頻率"),
    強度: readNumber(p, "強度"),
  };
}

// 上區(最近的痕跡)候選:補充裁決05 §2.1 硬規則——查詢條件寫在 Notion filter
// 裡,不是撈回來才篩。只取 traceLevel=daily 且未標記頻率/強度的候選(一標記
// 就免淡,屬於下區,見補充裁決04 §2.2),且最後動靜時間落在查詢窗口內;是否
// 真的「已淡」的 7 天門檻比較,交給呼叫端在讀到候選之後即時算(補充裁決04
// §1.1,尚未實作,見本檔開頭註解)。
export async function listRecentTraceCandidates() {
  const cutoffISO = new Date(Date.now() - TRACE_QUERY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const pages = await queryAll(DATA_SOURCES.DB19_生活痕跡庫, {
    and: [
      { property: "traceLevel", select: { equals: "daily" } },
      { property: "頻率", number: { is_empty: true } },
      { property: "強度", number: { is_empty: true } },
      { property: "最後動靜時間", date: { on_or_after: cutoffISO } },
    ],
  });
  return pages.map(mapTrace);
}

// 下區(留著的)候選:累積層/永久層痕跡,以及標記過頻率或強度的痕跡——四個
// 條件用 or 併查,一次查詢就是最終候選集合,不在程式端另外過濾掉不該出現的
// 項目,也不限張數(補充裁決04 §2.2)。
export async function listPersistentTraces() {
  const pages = await queryAll(DATA_SOURCES.DB19_生活痕跡庫, {
    or: [
      { property: "traceLevel", select: { equals: "accumulated" } },
      { property: "traceLevel", select: { equals: "permanent" } },
      { property: "頻率", number: { is_not_empty: true } },
      { property: "強度", number: { is_not_empty: true } },
    ],
  });
  return pages.map(mapTrace);
}

// 依 id 直接取單一痕跡(回看/標記寫入前要先讀出目前的 viewCount/traceLevel
// 才能決定要不要升級,見 lib/notion/mutations.ts registerTraceView())。
export async function getTraceEntry(id: string) {
  const p = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: id }));
  return mapTrace(p as NotionPage);
}

// 正式版「回看」需包含整合前已存在的 DB-19 生活痕跡。這裡只提供資料層
// 全量讀取,實際顯示時仍排除 traceStatus=隱藏,並與 DB-14 新紀錄去重。
export async function listAllTraceEntries() {
  const pages = await queryAll(DATA_SOURCES.DB19_生活痕跡庫);
  return pages.map(mapTrace);
}

// --- DB-16 標籤詞庫:P3 比對結果顯示「命中標籤」名稱用 ---
export function mapTag(p: NotionPage) {
  return {
    id: p.id,
    標籤名: readTitle(p, "標籤名"),
    狀態: readSelect(p, "狀態"),
  };
}

export async function listAllTags() {
  const pages = await queryAll(DATA_SOURCES.DB16_標籤詞庫);
  return pages.map(mapTag);
}

// --- 讀取一般 Notion 頁面內容為純文字(用於語氣指引「連結」指向另一頁全文的情況) ---
// Notion 網址常見兩種 ID 格式:瀏覽器分享連結多為 32 碼無 dash 的十六進位字串;
// 部分工具(含本專案的 Notion 連接器)回傳的 URL 則帶 dash 的 UUID 格式,兩種都要能解析。
export function extractNotionPageId(url: string): string | null {
  const dashed = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (dashed) return dashed[0];
  const plain = url.match(/[0-9a-f]{32}/i);
  return plain ? plain[0] : null;
}

// table/table_row 區塊的文字不在 `block[block.type].rich_text`(改放在 table_row 的
// `cells`,每格是一個 rich_text 陣列),一般 walk 邏輯抓不到,需另外處理,否則頁面內任何
// 表格(如語氣指引的方法對照表)全文擷取時會被靜默漏掉。
function tableRowText(block: NotionPage): string {
  const cells = (block.table_row?.cells ?? []) as { plain_text: string }[][];
  return cells.map((cell) => cell.map((t) => t.plain_text).join("")).join(" | ");
}

export async function fetchNotionPagePlainText(pageId: string): Promise<string> {
  async function walk(blockId: string): Promise<string[]> {
    const lines: string[] = [];
    let cursor: string | undefined = undefined;
    do {
      const res = await withNotionRateLimit(() =>
        notion().blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 })
      );
      for (const block of res.results as NotionPage[]) {
        if (block.type === "table_row") {
          const text = tableRowText(block);
          if (text) lines.push(text);
          continue;
        }
        const richText = block[block.type]?.rich_text;
        if (Array.isArray(richText)) {
          const text = richText.map((t: { plain_text: string }) => t.plain_text).join("");
          if (text) lines.push(text);
        }
        if (block.has_children) {
          lines.push(...(await walk(block.id)));
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return lines;
  }
  return (await walk(pageId)).join("\n");
}

// 讀取頁面內所有 table 區塊,回傳結構化的列x欄(第 0 列=表頭),供需要依欄位標題比對
// 解析的場景使用(如語氣指引「方法對照表」),不必自行重新走一次區塊樹。
export type NotionTable = string[][];

export async function fetchNotionPageTables(pageId: string): Promise<NotionTable[]> {
  const tables: NotionTable[] = [];

  async function walkRows(tableBlockId: string): Promise<NotionTable> {
    const rows: NotionTable = [];
    let cursor: string | undefined = undefined;
    do {
      const res = await withNotionRateLimit(() =>
        notion().blocks.children.list({ block_id: tableBlockId, start_cursor: cursor, page_size: 100 })
      );
      for (const block of res.results as NotionPage[]) {
        if (block.type === "table_row") {
          const cells = (block.table_row?.cells ?? []) as { plain_text: string }[][];
          rows.push(cells.map((cell) => cell.map((t) => t.plain_text).join("")));
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return rows;
  }

  async function walk(blockId: string): Promise<void> {
    let cursor: string | undefined = undefined;
    do {
      const res = await withNotionRateLimit(() =>
        notion().blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 })
      );
      for (const block of res.results as NotionPage[]) {
        if (block.type === "table" && block.has_children) {
          tables.push(await walkRows(block.id));
          continue;
        }
        if (block.has_children) {
          await walk(block.id);
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  await walk(pageId);
  return tables;
}
