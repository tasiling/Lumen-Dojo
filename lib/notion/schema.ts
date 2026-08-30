// 資料對接表:實際 data source ID 與欄位名(全繁體中文,逐庫拉 schema 驗證後填入)
// 依委派書規定:App 不得憑記憶硬編欄位名——此檔案的值皆來自實際 fetch 結果,不是猜測。
// 若日後 Notion 端 schema 變動,必須重新 fetch 驗證並更新此檔,不得自行改 schema 本身。

export const DATA_SOURCES = {
  DB01_牌組表: "c32e70b3-0cc0-4eae-9d5c-b77e9e445ee9",
  DB02_牌卡表: "3ebc19fc-383c-462e-a472-947ef61cad28",
  DB03_抽牌Session: "ba73d9a7-f810-4995-b82e-942d35a61bcc",
  DB04_抽牌明細: "37f8adaf-4eab-434e-8b91-faf295b7a668",
  DB05_解讀規則庫: "cbb9b742-ba3c-4477-ae5d-972dd47a20ab",
  DB06_固定項目註冊表: "828267ac-5fe0-4ac0-a06e-d771f14e7b2f",
  DB07_序列節點表: "5c9e5be3-8d7d-4814-98e5-fb4cefb6a6cf",
  DB08_月主題包: "cbd9f0f4-2177-4293-bb0f-9755be96aeaf",
  DB09_回饋紀錄: "9951ad16-9c33-48d8-8448-fcd7e181a2ac",
  DB10_修正提案: "c607ad7b-8140-4e7d-87d4-cc530415278f",
  DB11_服務原子庫: "4f1a31ee-5ff5-4d46-b4b5-3f2d78ada842",
  DB12_素材庫: "ccad9bd5-4d66-44a5-a30d-9d61d7950097",
  DB13_精進區實驗庫: "9f2ac13e-daea-4d52-9d1b-2586f0598031",
  DB14_知識庫: "6b2ff51d-2e10-4cde-b9ea-4644702846fa",
  DB15_場次表: "e65a709f-c347-4c33-8936-a9da23571f53",
  DB16_標籤詞庫: "43f2bc26-2bac-45c8-9bc0-4d4ed2b87675",
  // 日記庫(收光改版 3.4/3.5,補充裁決03 §四之1 選項C,擁有者 2026-08-05 建庫)。
  DB18_日記庫: "5879b2b5-6f4d-4369-9493-a54fa085786d",
  // 生活痕跡庫(補充裁決04/05,擁有者 2026-08-05 建庫,App 只讀寫不建庫)。
  DB19_生活痕跡庫: "f626f227-1d6b-4849-ae73-96c1bc325c4c",
  // 閱讀萃取模組(擁有者 2026-08-29 建庫)。一列書籍代表一次閱讀；自由筆記
  // 寫在 DB-21 頁面區塊，只有能寫出具體行動化的洞察才另立 DB-22 卡片。
  DB21_書籍庫: "38ec72a1-48bf-43cc-9adf-0ae4f2c9d1f0",
  DB22_洞察卡片庫: "05fbc5ce-8ab6-4626-8c94-b8e35b3f05c6",
} as const;

// DB-03 抽牌 Session 狀態機(順序固定,終點=已交付)
export const SESSION_STATUS_ORDER = [
  "已抽牌",
  "已指定用途",
  "解讀中",
  "已產出",
  "已交付",
] as const;
export type SessionStatus = (typeof SESSION_STATUS_ORDER)[number];
export const SESSION_STATUS_DEFAULT: SessionStatus = "已抽牌";

// 防禦性 fallback(與 normalizeDetailStatus 對稱):讀到空值或非法值一律視同「已抽牌」
// (狀態機起點),不讓判斷/顯示卡在「未知狀態」。建立 Session 時本就強制寫入狀態
// (見 mutations.ts createSession),此 fallback 是額外一層防線,不是取代寫入時的預設值。
export function normalizeSessionStatus(status: string | null | undefined): SessionStatus {
  return status && (SESSION_STATUS_ORDER as readonly string[]).includes(status)
    ? (status as SessionStatus)
    : SESSION_STATUS_DEFAULT;
}

// v1.3(產線 A 委派書):擁有者已在 Notion 手動新增後 4 個選項,解決序列展開任務無處分類的落差。
export const SESSION_項目用途 = [
  "能量流",
  "大眾占卜",
  "日更",
  "個案",
  "實驗",
  "事件序列文",
  "邀請文",
  "心理測驗",
  "個人心得",
] as const;

// P2 序列展開引擎(讀 DB-07 序列節點表)產出的任務一律屬於事件宣傳序列,對應此分類。
export const EXPAND_ENGINE_項目用途 = "事件序列文" as const;
// 三更邀請文、二更心理測驗尚未有產生任務的功能(不在 P1/P5/P2 範圍內);
// 未來實作對應功能時,應分別使用以下分類,不得沿用 EXPAND_ENGINE_項目用途。
export const 三更_項目用途 = "邀請文" as const;
export const 二更_項目用途 = "心理測驗" as const;
export const SESSION_模式 = ["單筆", "批次"] as const;

// DB-07 序列節點表 錨點
export const NODE_ANCHOR = ["首場", "每場", "末場"] as const;
export type NodeAnchor = (typeof NODE_ANCHOR)[number];

// DB-06 固定項目註冊表
export const EVENT_TYPE_FORM = ["單日", "多日"] as const; // 事件型態
export const EVENT_STATUS = ["啟用", "停用"] as const;

// DB-15 場次表狀態
export const SESSION_SLOT_STATUS = ["預定", "已完成"] as const;

// DB-04 抽牌明細「明細狀態」(委派書 v1.6 新增,2026-08-01 擁有者於 Notion 新增
// 「待審核」選項擴充為四階):單筆明細的生產進度,順序固定,終點=已交付。
// 表頭 DB-03「狀態」不受影響——批次 Session 的實際進度改由此欄匯總顯示,表頭仍是 Session 整體生命週期。
export const DETAIL_STATUS_ORDER = ["待產出", "待審核", "已產出", "已交付"] as const;
export type DetailStatus = (typeof DETAIL_STATUS_ORDER)[number];
export const DETAIL_STATUS_DEFAULT: DetailStatus = "待產出";

// 防禦性 fallback:讀到空值(舊資料、任何管道漏寫)一律視同「待產出」,不讓儀表出現黑數。
// 推進動作照常寫入真值,下次讀取自然是真的值——不需要額外一次性回填腳本。
export function normalizeDetailStatus(status: string | null | undefined): DetailStatus {
  return status && (DETAIL_STATUS_ORDER as readonly string[]).includes(status)
    ? (status as DetailStatus)
    : DETAIL_STATUS_DEFAULT;
}

// DB-05 解讀規則庫「適用項目」(v2.5:六項擴為七項,新增服務導流占卜)
export const RULE_適用項目 = [
  "能量流",
  "大眾占卜",
  "心理測驗",
  "邀請文",
  "個人心得",
  "事件序列文",
  "服務導流占卜",
] as const;
export const RULE_STATUS = ["現行", "舊版", "待審"] as const;

// 七維度・七方法(總綱 v2.4 凍結封閉清單,供 R-服務導流占卜與 R-心理測驗共用)。
// P8-0 維度/方法選擇僅用「方法」清單提供可換選項;維度/方法配對本身屬擁有者職權,
// App 不得實作自動配對(委派書禁區)。
export const SEVEN_DIMENSIONS = [
  "身體/能量",
  "情緒",
  "信念",
  "行動/意志",
  "自我認同",
  "關係",
  "願景/價值",
] as const;
export const SEVEN_METHODS = [
  "程度量表法",
  "隱喻聯想法",
  "投射書寫法",
  "角色代入法",
  "配對圖卡法",
  "情境選擇法",
  "排序偏好法",
] as const;

// DB-09 回饋紀錄:四維評分欄位與範圍(Notion 端無法強制,App 端必須驗證 1–5)
export const FEEDBACK_SCORE_FIELDS = ["準確度", "語感", "轉換效果", "可複用性"] as const;
export const FEEDBACK_SCORE_MIN = 1;
export const FEEDBACK_SCORE_MAX = 5;

export const FEEDBACK_對象類型 = ["規則", "Session"] as const;
export type Feedback對象類型 = (typeof FEEDBACK_對象類型)[number];
export const FEEDBACK_來源 = ["數據", "個人評價"] as const;

// 問題類型標籤(DB-09「問題類型標籤」多選欄的實際註冊選項,逐字比對後才寫入——
// 目前 Notion 端僅一項。日後擁有者於 Notion 新增選項,須重新 fetch schema 更新此常數,
// App 不得自行新增選項)。
export const FEEDBACK_QUESTION_TAGS = ["語感偏硬"] as const;

// P6 回饋快填(委派書 §四):問題類型標籤累積次數達此門檻時提示「可發起提案」。
export const FEEDBACK_PROPOSAL_THRESHOLD = 3;

// DB-10 修正提案:新建預設狀態(App 端強制)
export const PROPOSAL_DEFAULT_STATUS = "待審" as const;

// DB-14 知識庫:來源=學習筆記時核可狀態強制待審(App 端強制)
export const KNOWLEDGE_SOURCE_REVIEW_REQUIRED = "學習筆記" as const;
export const KNOWLEDGE_REVIEW_STATUS_FOR_LEARNING_NOTE = "待審" as const;

// 日上三更・批次建立與產出清單(委派書 v1.0,2026-08-03 擁有者於 Notion 新增
// 「更次」單選欄,方案 B 裁決:語意明確,且維持「一個 Session 涵蓋整批」的既有
// 資料形狀,不必為了配合編號規則把一次批次動作拆成多筆 Session)。
// 只有透過這次的批次建立流程產生的明細會有值;既有/其他管道建立的明細此欄
// 留空,不是缺陷,單純代表「不屬於日上三更批次」,回看時不強制歸類。
export const SANKO_UPDATE_TYPES = ["晨光", "日光", "夜光"] as const;
export type SankoUpdateType = (typeof SANKO_UPDATE_TYPES)[number];

// 噗浪・蓋樓台(2026-08-02 擁有者裁決):範本與草稿都以資料列承載於 DB-14 知識庫,
// 不新增任何欄位或選項值——來源=原創、狀態=存貨、核可狀態=免審皆為既有選項。
// 以標題前綴區分兩種類型,查詢時用 starts_with 篩選;內容(main/樓層/排程/狀態)
// 序列化存進「內容」欄,見 lib/plurk/notionFormat.ts。
export const PLURK_TEMPLATE_TITLE_PREFIX = "噗浪範本-";
export const PLURK_DRAFT_TITLE_PREFIX = "噗浪草稿-";

// 收光(《收光三選項與居所接續 — 資料邏輯規格 v1.0》,2026-08-03 擁有者裁決:
// 「不要為此新增任何欄位」,零 schema 異動,沿用 DB-14 知識庫,比照噗浪・蓋樓台
// 先例)。一天一筆,標題「收光紀錄-YYYYMMDD」,寫入時若當日已有紀錄則覆蓋
// (擁有者可能改變主意),不累積多筆。內容欄序列化 DojoEntry 語意的
// space/kind/title/note/date,見 lib/closing/notionFormat.ts。
export const CLOSING_TITLE_PREFIX = "收光紀錄-";

// 生活痕跡的淡去規則(補充裁決04):以「最後動靜時間」即時計算,不寫入任何
// 淡去狀態欄位——真正判斷「是否已淡」的 7 天門檻比較,在讀取結果之後、顯示
// 邏輯那一步(補充裁決04 §1.1)才計算,不在這裡、也還沒實作(補充裁決05 實作
// 順序第3項,本輪只做第2項的讀寫層)。
//
// 補充裁決05 §2.1 硬規則:上區查詢只能撈「最近 N 天內有動靜」的候選,不得
// 撈全部再於程式端過濾。查詢窗口(10 天)刻意比之後要用的淡去門檻(7 天)寬,
// 是給時區/時間比較留餘裕,不是把淡去門檻改成 10 天。
export const TRACE_QUERY_WINDOW_DAYS = 10;
