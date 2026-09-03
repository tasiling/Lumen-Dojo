import { notion, withNotionRateLimit } from "./client";
import {
  DATA_SOURCES,
  SESSION_STATUS_ORDER,
  DETAIL_STATUS_ORDER,
  DETAIL_STATUS_DEFAULT,
  FEEDBACK_SCORE_FIELDS,
  FEEDBACK_SCORE_MIN,
  FEEDBACK_SCORE_MAX,
  type SessionStatus,
  type DetailStatus,
  type Feedback對象類型,
  type SankoUpdateType,
} from "./schema";
import {
  titleProp,
  richTextProp,
  selectProp,
  multiSelectProp,
  numberProp,
  dateProp,
  relationProp,
  urlProp,
} from "./properties";
import {
  queryAll,
  getSession,
  findJournalEntryByTitle,
  getTraceEntry,
  getReadingBook,
  nextReadingCount,
} from "./queries";
import { readTitle } from "./properties";
import {
  JOURNAL_QUESTIONS,
  journalRecordTitle,
  normalizeJournalAnswers,
  type JournalAnswers,
} from "@/lib/journal/notionFormat";
import type { SpaceKey, SourceType } from "@/lib/dojo/constants";
import { TRACE_ACCUMULATE_VIEW_THRESHOLD } from "@/lib/trace/rules";
import type {
  BookReason,
  BookStatus,
  InsightActionType,
  InsightStatus,
  InsightTopic,
  ProgramApplication,
  ReadingSubject,
} from "@/lib/reading/types";
import { serializeInsightSource } from "@/lib/reading/notes";

// Session 編號格式:S-YYYYMMDD-流水號(總綱 DB-03)。流水號以當日已存在筆數 +1 計算。
export async function nextSessionCode(dateISO: string): Promise<string> {
  const ymd = dateISO.replace(/-/g, "");
  const existing = await queryAll(DATA_SOURCES.DB03_抽牌Session, {
    property: "Session 編號",
    title: { starts_with: `S-${ymd}-` },
  });
  const serial = existing.length + 1;
  return `S-${ymd}-${String(serial).padStart(3, "0")}`;
}

export async function createSession(params: {
  dateISO: string; // 建立日期
  項目用途?: string; // 選填:序列展開產出的文案任務沒有對應選項可用時留空(見 docs/schema/項目用途落差說明.md)
  模式: "單筆" | "批次";
  狀態?: SessionStatus;
  備註?: string;
}) {
  const code = await nextSessionCode(params.dateISO);
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB03_抽牌Session },
      properties: {
        "Session 編號": titleProp(code),
        建立日期: dateProp(params.dateISO),
        ...(params.項目用途 ? { 項目用途: selectProp(params.項目用途) } : {}),
        模式: selectProp(params.模式),
        狀態: selectProp(params.狀態 ?? "已抽牌"),
        ...(params.備註 ? { 備註: richTextProp(params.備註) } : {}),
      },
    })
  );
  return { id: page.id, code };
}

// 寫入驗證 10(委派書 v1.6):新建 DB-04 明細一律寫入明細狀態=待產出。
export async function createDetail(params: {
  sessionId: string;
  sessionCode: string;
  對應日期: string;
  序: number; // 批次內第幾筆,用於組明細編號
}) {
  const 明細編號 = `${params.sessionCode}-${String(params.序).padStart(2, "0")}`;
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB04_抽牌明細 },
      properties: {
        明細編號: titleProp(明細編號),
        對應日期: dateProp(params.對應日期),
        "所屬 Session": relationProp([params.sessionId]),
        明細狀態: selectProp(DETAIL_STATUS_DEFAULT),
      },
    })
  );
  return { id: page.id, 明細編號 };
}

// 明細標題可自訂文字(用於序列展開任務,把節點內容類型編碼進標題,
// 因為 DB-04 明細沒有獨立欄位可記錄節點/內容類型 —— 見落差說明文件)。
export async function createDetailWithTitle(params: {
  sessionId: string;
  明細編號: string;
  對應日期: string;
}) {
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB04_抽牌明細 },
      properties: {
        明細編號: titleProp(params.明細編號),
        對應日期: dateProp(params.對應日期),
        "所屬 Session": relationProp([params.sessionId]),
        明細狀態: selectProp(DETAIL_STATUS_DEFAULT),
      },
    })
  );
  return { id: page.id, 明細編號: params.明細編號 };
}

// 日上三更・批次建立(委派書 v1.0,方案 B):比照 createDetail,多寫入「更次」
// 欄。維持「一個 Session 涵蓋整個日期範圍」的既有資料形狀——序號 1..N 正常
// 遞增,不因為要配合更次識別而拆成一天一個 Session。
export async function createSankoBatchDetail(params: {
  sessionId: string;
  sessionCode: string;
  對應日期: string;
  序: number;
  更次: SankoUpdateType;
}) {
  const 明細編號 = `${params.sessionCode}-${String(params.序).padStart(2, "0")}`;
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB04_抽牌明細 },
      properties: {
        明細編號: titleProp(明細編號),
        對應日期: dateProp(params.對應日期),
        "所屬 Session": relationProp([params.sessionId]),
        明細狀態: selectProp(DETAIL_STATUS_DEFAULT),
        更次: selectProp(params.更次),
      },
    })
  );
  return { id: page.id, 明細編號 };
}

// 抽牌輸入:寫入抽出牌卡(relation)+ 抽出順序(權威順序文字,如 "MP-15, MP-17, MP-09")
export async function writeDraw(params: {
  detailId: string;
  cardPageIds: string[];
  orderText: string;
}) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: params.detailId,
      properties: {
        抽出牌卡: relationProp(params.cardPageIds),
        抽出順序: richTextProp(params.orderText),
      },
    })
  );
}

// 狀態機只允許順序推進;跳步需呼叫端先取得二次確認(allowSkip=true)才放行。
export function canAdvance(
  current: SessionStatus,
  next: SessionStatus,
  allowSkip: boolean
): { ok: boolean; reason?: string } {
  const curIdx = SESSION_STATUS_ORDER.indexOf(current);
  const nextIdx = SESSION_STATUS_ORDER.indexOf(next);
  if (curIdx === -1 || nextIdx === -1) return { ok: false, reason: "未知狀態" };
  if (nextIdx <= curIdx) return { ok: false, reason: "只能往前推進,不可回退或停留" };
  if (nextIdx > curIdx + 1 && !allowSkip) {
    return { ok: false, reason: "跳步需二次確認(allowSkip)" };
  }
  return { ok: true };
}

export async function updateSessionStatus(sessionId: string, newStatus: SessionStatus) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: sessionId,
      properties: { 狀態: selectProp(newStatus) },
    })
  );
}

// 明細狀態機(委派書 v1.6,寫入驗證 10):只允許順序推進,待產出→已產出→已交付。
// 明細狀態只有三階,不像表頭狀態機那樣需要「跳步二次確認」的中間步驟夠多的情境,
// 但仍套用同一套「只能往前一步」的收斂規則,不開放任意跳轉。
export function canAdvanceDetailStatus(
  current: DetailStatus,
  next: DetailStatus
): { ok: boolean; reason?: string } {
  const curIdx = DETAIL_STATUS_ORDER.indexOf(current);
  const nextIdx = DETAIL_STATUS_ORDER.indexOf(next);
  if (curIdx === -1 || nextIdx === -1) return { ok: false, reason: "未知狀態" };
  if (nextIdx <= curIdx) return { ok: false, reason: "只能往前推進,不可回退或停留" };
  return { ok: true };
}

export async function updateDetailStatus(detailId: string, newStatus: DetailStatus) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: detailId,
      properties: { 明細狀態: selectProp(newStatus) },
    })
  );
}

// 日上三更・批次建立(委派書 v1.0 §4.4):日期卡的快速勾選,直接勾選完成→
// 已產出、取消勾選→待產出。這是刻意允許往回走的唯一例外路徑——目的是「勾選
// 方塊」的直覺(勾了可以反悔取消),不是正式審核流程的倒退,所以不經過
// canAdvanceDetailStatus() 的單向限制。只在 待產出/待審核 ⇄ 已產出 之間切換;
// 已交付是更終局的歷史紀錄,不開放這個入口去動它——呼叫端(quick-toggle API)
// 需自行擋下已交付的情況,不能無條件呼叫這支函式。
export async function setDetailQuickDone(detailId: string, done: boolean) {
  await updateDetailStatus(detailId, done ? "已產出" : "待產出");
}

// 日上三更・批次刪除(擁有者 2026-08-03 追加指示):只能刪除明細狀態=待產出的
// 明細——待審核已經有草稿投入、已產出/已交付是紀錄層歷史,只增不改,一律不
// 開放從 App 刪除,真要刪請在 Notion 手動處理。呼叫端(API route)需自行先
// 驗證狀態再呼叫,這裡保持純寫入的職責,不重複檢查。
// 用 archived:true(Notion 的軟刪除,移到該資料庫的垃圾桶,擁有者仍可在
// Notion 端復原)而不是真的刪除頁面——比照 lib/plurk 既有的 archiveKnowledgeEntry
// 慣例,對「無法復原」的 UI 警示留一層真實的安全網。
export async function archiveDetail(detailId: string) {
  await withNotionRateLimit(() => notion().pages.update({ page_id: detailId, archived: true }));
}

// 明細日期編輯/批次平移(擁有者 2026-07-13 追加指示):只允許明細狀態=待產出者變動
// 日期——已產出/已交付是歷史紀錄,只增不改,呼叫端在此之前須先驗證狀態。
export async function updateDetailDate(detailId: string, newDateISO: string) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: detailId,
      properties: { 對應日期: dateProp(newDateISO) },
    })
  );
}

// Session 表頭「備註」追加一行異動軌跡(不覆蓋既有備註,append),用於日期平移/
// 單筆日期編輯後留下可追溯的紀錄。
export async function appendSessionNote(sessionId: string, line: string) {
  const session = await getSession(sessionId);
  const existing = session.備註?.trim();
  const updated = existing ? `${existing}\n${line}` : line;
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: sessionId,
      properties: { 備註: richTextProp(updated) },
    })
  );
}

// 「產出連結」欄位檢視與編輯(擁有者 2026-07-12 追加指示):支援內容完成後手動補登記連結,
// 純粹欄位覆寫,不牽動狀態機。允許清空(傳空字串代表撤銷誤填的連結),Notion url 屬性
// 清空須寫 null,不能寫空字串(空字串會被 API 判為不合法 URL 格式而拒絕)。
export async function updateSessionOutputLink(sessionId: string, url: string) {
  const trimmed = url.trim();
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: sessionId,
      properties: { 產出連結: trimmed ? urlProp(trimmed) : { url: null } },
    })
  );
}

// 日上三更・指令產生器(2026-08-01,DB-04 新增「草稿」「產出連結」欄位)。
// 草稿一律存 Notion,不存瀏覽器暫存——App 掛掉時擁有者必須能在 Notion 直接看到
// 草稿並手動接手,這是不可協商的邊界。
export async function updateDetailDraft(detailId: string, draftText: string) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: detailId,
      properties: { 草稿: richTextProp(draftText) },
    })
  );
}

// 明細層級的產出連結(與 DB-03 Session 表頭的產出連結是不同欄位):批次一次多篇時
// 每篇各自一則貼文,Session 表頭單一欄位裝不下,改用這裡。允許清空(傳空字串)。
export async function updateDetailOutputLink(detailId: string, url: string) {
  const trimmed = url.trim();
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: detailId,
      properties: { 產出連結: trimmed ? urlProp(trimmed) : { url: null } },
    })
  );
}

// DB-14 知識庫的通用建立/更新/歸檔(噗浪・蓋樓台的範本與草稿都存這裡,2026-08-02
// 擁有者裁決,不新增欄位:來源=原創、狀態=存貨、核可狀態=免審皆既有選項)。
export async function createKnowledgeEntry(params: { 標題: string; 內容: string }) {
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB14_知識庫 },
      properties: {
        標題: titleProp(params.標題),
        內容: richTextProp(params.內容),
        來源: selectProp("原創"),
        狀態: selectProp("存貨"),
        核可狀態: selectProp("免審"),
      },
    })
  );
  return { id: page.id };
}

export async function updateKnowledgeEntry(id: string, patch: { 標題?: string; 內容?: string }) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: id,
      properties: {
        ...(patch.標題 !== undefined ? { 標題: titleProp(patch.標題) } : {}),
        ...(patch.內容 !== undefined ? { 內容: richTextProp(patch.內容) } : {}),
      },
    })
  );
}

export async function archiveKnowledgeEntry(id: string) {
  await withNotionRateLimit(() => notion().pages.update({ page_id: id, archived: true }));
}

export async function findSessionCodeById(sessionId: string): Promise<string> {
  const page = await withNotionRateLimit(() => notion().pages.retrieve({ page_id: sessionId }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return readTitle(page as any, "Session 編號");
}

// --- DB-18 日記庫:收光改版 3.4/3.5(寫下今天展開日記、帶回明天也提供日記入口) ---
// 一天一筆,標題「日記-YYYYMMDD」,當日已有紀錄則覆蓋(比照收光紀錄慣例)——
// 七題一律全寫(normalizeJournalAnswers 把沒填的正規化成空字串),不是只補
// 有值的欄位。呼叫端(POST /api/closing)已先用 hasAnyJournalAnswer() 判斷
// 這次有沒有真的寫東西,沒寫就不會呼叫這支函式,不會建立空白日記列。
export async function upsertJournalEntry(dateISO: string, answers: JournalAnswers) {
  const title = journalRecordTitle(dateISO);
  const normalized = normalizeJournalAnswers(answers);
  const properties: Record<string, ReturnType<typeof richTextProp>> = {};
  for (const q of JOURNAL_QUESTIONS) properties[q.key] = richTextProp(normalized[q.key]);

  const existing = await findJournalEntryByTitle(title);
  if (existing) {
    await withNotionRateLimit(() => notion().pages.update({ page_id: existing.id, properties }));
    return { id: existing.id };
  }
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB18_日記庫 },
      properties: { 標題: titleProp(title), 日期: dateProp(dateISO), ...properties },
    })
  );
  return { id: page.id };
}

// --- DB-19 生活痕跡庫:寫入(補充裁決04/05) ---
// 建立時只寫必要欄位:traceLevel/traceStatus/viewCount 一律初始值(比照
// DojoEntry 現行慣例,不留空值 fallback 的路徑),最後動靜時間寫入當下——這
// 本身就是「建立」這個動靜(補充裁決04「什麼算動靜」表)。頻率/強度建立當下
// 一律不填,測頻是後續獨立動作。
export async function createTraceEntry(params: {
  標題: string;
  內容?: string;
  space: SpaceKey;
  sourceType: SourceType;
}) {
  const nowISO = new Date().toISOString();
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB19_生活痕跡庫 },
      properties: {
        標題: titleProp(params.標題),
        ...(params.內容 ? { 內容: richTextProp(params.內容) } : {}),
        space: selectProp(params.space),
        sourceType: selectProp(params.sourceType),
        traceLevel: selectProp("daily"),
        traceStatus: selectProp("一般"),
        viewCount: numberProp(0),
        最後動靜時間: dateProp(nowISO),
      },
    })
  );
  return { id: page.id };
}

export async function updateTraceEntry(
  id: string,
  patch: { 標題: string; 內容?: string; space: SpaceKey; sourceType: SourceType }
) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: id,
      properties: {
        標題: titleProp(patch.標題),
        內容: richTextProp(patch.內容 ?? ""),
        space: selectProp(patch.space),
        sourceType: selectProp(patch.sourceType),
        最後動靜時間: dateProp(new Date().toISOString()),
      },
    })
  );
}

export async function archiveTraceEntry(id: string) {
  await withNotionRateLimit(() => notion().pages.update({ page_id: id, archived: true }));
}

// 回看:重新計時 7 天(補充裁決04 §一)+ 回看次數 +1;累積到門檻
// (TRACE_ACCUMULATE_VIEW_THRESHOLD)自動升級 traceLevel 為 accumulated
// (補充裁決05 實作順序第4項)。已經是 accumulated/permanent 的不重複判斷
// 升級,單純更新次數與時間——這兩層本來就已經在下區、免淡,升級與否不影響
// 顯示位置。
export async function registerTraceView(id: string) {
  const current = await getTraceEntry(id);
  const nextViewCount = current.viewCount + 1;
  const shouldUpgrade = current.traceLevel === "daily" && nextViewCount >= TRACE_ACCUMULATE_VIEW_THRESHOLD;
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: id,
      properties: {
        viewCount: numberProp(nextViewCount),
        最後動靜時間: dateProp(new Date().toISOString()),
        ...(shouldUpgrade ? { traceLevel: selectProp("accumulated") } : {}),
      },
    })
  );
  return { viewCount: nextViewCount, traceLevel: shouldUpgrade ? "accumulated" : current.traceLevel };
}

// 標記頻率／強度本身也是一種動靜(補充裁決04「什麼算動靜」表),所以跟收光
// 復盤測頻的既有規則一樣——只寫入這次指定的欄位；null 代表使用者明確
// 清除標記。同時更新最後動靜時間。標記之後這筆痕跡會落入下區、永久免淡
// (補充裁決04 §2.2)；那個「落入下區」的判斷屬於讀取端
// (listPersistentTraces 的查詢條件已經涵蓋),這裡只
// 負責寫值。
export async function markTraceMeasure(id: string, patch: { 頻率?: number | null; 強度?: number | null }) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: id,
      properties: {
        ...(patch.頻率 !== undefined ? { 頻率: { number: patch.頻率 } } : {}),
        ...(patch.強度 !== undefined ? { 強度: { number: patch.強度 } } : {}),
        最後動靜時間: dateProp(new Date().toISOString()),
      },
    })
  );
}

// --- DB-09 回饋紀錄:P6 回饋快填 ---

// 回饋編號格式比照 Session 編號慣例:FB-YYYYMMDD-流水號。
export async function nextFeedbackCode(dateISO: string): Promise<string> {
  const ymd = dateISO.replace(/-/g, "");
  const existing = await queryAll(DATA_SOURCES.DB09_回饋紀錄, {
    property: "回饋編號",
    title: { starts_with: `FB-${ymd}-` },
  });
  const serial = existing.length + 1;
  return `FB-${ymd}-${String(serial).padStart(3, "0")}`;
}

// 寫入驗證(委派書五之 1):四維評分限 1–5,App 端強制檢查(Notion number 欄位無法內建範圍限制)。
export function validateFeedbackScore(value: number): { ok: boolean; reason?: string } {
  if (!Number.isFinite(value) || value < FEEDBACK_SCORE_MIN || value > FEEDBACK_SCORE_MAX) {
    return { ok: false, reason: `評分須介於 ${FEEDBACK_SCORE_MIN}–${FEEDBACK_SCORE_MAX}` };
  }
  return { ok: true };
}

export async function createFeedback(params: {
  dateISO: string;
  對象類型: Feedback對象類型;
  targetId: string; // 對象類型=規則 時填 DB-05 頁面 id,=Session 時填 DB-03 頁面 id
  準確度: number;
  語感: number;
  轉換效果: number;
  可複用性: number;
  問題類型標籤: string[];
  短評?: string;
}) {
  for (const field of FEEDBACK_SCORE_FIELDS) {
    const check = validateFeedbackScore(params[field]);
    if (!check.ok) throw new Error(`${field}:${check.reason}`);
  }
  const code = await nextFeedbackCode(params.dateISO);
  const targetProp = params.對象類型 === "規則" ? "對象-規則" : "對象-Session";
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB09_回饋紀錄 },
      properties: {
        回饋編號: titleProp(code),
        對象類型: selectProp(params.對象類型),
        [targetProp]: relationProp([params.targetId]),
        // P6 為擁有者手動快填的當下評分,對應「個人評價時填」的四維評分欄位。
        來源: selectProp("個人評價"),
        日期: dateProp(params.dateISO),
        準確度: numberProp(params.準確度),
        語感: numberProp(params.語感),
        轉換效果: numberProp(params.轉換效果),
        可複用性: numberProp(params.可複用性),
        ...(params.問題類型標籤.length ? { 問題類型標籤: multiSelectProp(params.問題類型標籤) } : {}),
        ...(params.短評 ? { 短評: richTextProp(params.短評) } : {}),
      },
    })
  );
  return { id: page.id, code };
}

// --- DB-21／DB-22 閱讀萃取 ---
export async function createReadingBook(params: {
  title: string;
  author?: string;
  readCount?: number;
  subject?: ReadingSubject | null;
  reason?: BookReason | null;
  question?: string;
  status: BookStatus;
  todayISO: string;
}) {
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB21_書籍庫 },
      properties: {
        書名: titleProp(params.title.trim()),
        讀次: numberProp(Math.max(1, params.readCount ?? 1)),
        狀態: selectProp(params.status),
        ...(params.author?.trim() ? { 作者: richTextProp(params.author.trim()) } : {}),
        ...(params.subject ? { 學科: selectProp(params.subject) } : {}),
        ...(params.reason ? { 選書理由: selectProp(params.reason) } : {}),
        ...(params.question?.trim() ? { 帶著什麼問題讀: richTextProp(params.question.trim()) } : {}),
        ...(params.status === "閱讀中" ? { 開始日期: dateProp(params.todayISO) } : {}),
      },
    })
  );
  return { id: page.id };
}

export async function rereadBook(params: { sourceBookId: string; question: string; reason?: BookReason | null; todayISO: string }) {
  const source = await getReadingBook(params.sourceBookId);
  const readCount = await nextReadingCount(source.title);
  return createReadingBook({
    title: source.title,
    author: source.author,
    readCount,
    subject: source.subject,
    reason: params.reason,
    question: params.question,
    status: "閱讀中",
    todayISO: params.todayISO,
  });
}

export async function updateReadingBook(
  bookId: string,
  patch: {
    status?: BookStatus;
    question?: string;
    subject?: ReadingSubject | null;
    reason?: BookReason | null;
    todayISO: string;
  }
) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: bookId,
      properties: {
        ...(patch.question !== undefined ? { 帶著什麼問題讀: richTextProp(patch.question.trim()) } : {}),
        ...(patch.subject ? { 學科: selectProp(patch.subject) } : {}),
        ...(patch.reason ? { 選書理由: selectProp(patch.reason) } : {}),
        ...(patch.status ? { 狀態: selectProp(patch.status) } : {}),
        ...(patch.status === "閱讀中" ? { 開始日期: dateProp(patch.todayISO) } : {}),
        ...(patch.status === "已萃取" || patch.status === "已製作成內容"
          ? { 萃取完成日: dateProp(patch.todayISO) }
          : {}),
      },
    })
  );
}

export async function appendReadingNote(bookId: string, text: string) {
  const response = await withNotionRateLimit(() =>
    notion().blocks.children.append({
      block_id: bookId,
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: richTextProp(text).rich_text },
        },
      ],
    })
  );
  const created = response.results[0];
  if (!created) throw new Error("筆記沒有成功建立");
  return { id: created.id };
}

export async function updateReadingNote(noteId: string, text: string) {
  await withNotionRateLimit(() =>
    notion().blocks.update({
      block_id: noteId,
      type: "paragraph",
      paragraph: { rich_text: richTextProp(text).rich_text },
    })
  );
}

export async function archiveReadingNote(noteId: string) {
  await withNotionRateLimit(() => notion().blocks.delete({ block_id: noteId }));
}

export async function createInsightCard(params: {
  bookId: string;
  insight: string;
  action: string;
  actionType: InsightActionType;
  todayISO: string;
  nextVisitISO: string;
  sourceNoteId?: string;
  sourceText?: string;
}) {
  const status: InsightStatus = params.actionType === "觀察型" ? "觀察中" : "待行動";
  const page = await withNotionRateLimit(() =>
    notion().pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCES.DB22_洞察卡片庫 },
      properties: {
        洞察: titleProp(params.insight.trim()),
        來源書籍: relationProp([params.bookId]),
        行動型態: selectProp(params.actionType),
        行動化: richTextProp(params.action.trim()),
        狀態: selectProp(status),
        下次回訪日: dateProp(params.nextVisitISO),
        節目應用: selectProp("未定"),
        萃取日期: dateProp(params.todayISO),
        順延次數: numberProp(0),
      },
      ...(params.sourceNoteId && params.sourceText?.trim() ? {
        children: [
          {
            object: "block" as const,
            type: "quote" as const,
            quote: {
              rich_text: richTextProp(serializeInsightSource(params.sourceNoteId, params.sourceText.trim())).rich_text,
            },
          },
        ],
      } : {}),
    })
  );
  return { id: page.id };
}

export async function updateInsightCard(
  cardId: string,
  patch: {
    actionType?: InsightActionType;
    action?: string;
    status?: InsightStatus;
    nextVisitAt?: string;
    result?: string;
    postponementCount?: number;
    programApplication?: ProgramApplication;
    topics?: InsightTopic[];
  }
) {
  await withNotionRateLimit(() =>
    notion().pages.update({
      page_id: cardId,
      properties: {
        ...(patch.actionType ? { 行動型態: selectProp(patch.actionType) } : {}),
        ...(patch.action !== undefined ? { 行動化: richTextProp(patch.action.trim()) } : {}),
        ...(patch.status ? { 狀態: selectProp(patch.status) } : {}),
        ...(patch.nextVisitAt ? { 下次回訪日: dateProp(patch.nextVisitAt) } : {}),
        ...(patch.result !== undefined ? { 感悟與結果: richTextProp(patch.result) } : {}),
        ...(patch.postponementCount !== undefined
          ? { 順延次數: numberProp(Math.max(0, patch.postponementCount)) }
          : {}),
        ...(patch.programApplication ? { 節目應用: selectProp(patch.programApplication) } : {}),
        ...(patch.topics ? { 主題標籤: multiSelectProp(patch.topics) } : {}),
      },
    })
  );
}
