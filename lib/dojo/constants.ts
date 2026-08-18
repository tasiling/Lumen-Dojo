// 行光道場介面雛形 v1(擁有者提供的 HTML 原型)移植過來的靜態資料。
// 這些是雛形本身定義的展示用常數(七場域),直接沿用,不重新設計。
//
// 修正委派書 v1.0 三:原本的舊版單層五功法系統已作廢,改為兩層獨立選填標籤
// ——光行五(每日修行的運作方式)與光法五(光行成熟後自然發展的應用),兩層
// 互相獨立,不計分、不解鎖、不累積等級。

export type SpaceKey = "practice" | "forage" | "weaving" | "liaojie" | "dao" | "closing";

// [顯示名, 色彩 key, 一句話描述]
export const SPACES: Record<SpaceKey, [string, string, string]> = {
  practice: ["修習所", "pr", "專注、沉靜"],
  forage: ["野採", "fo", "好奇、探索"],
  weaving: ["織光堂", "we", "創造、流動"],
  liaojie: ["聊解室", "li", "信任、服務"],
  dao: ["道藏", "da", "珍藏、回望"],
  closing: ["收光", "cl", "放鬆、圓滿"],
};

export type GuangxingKey = "ning" | "lian" | "liu" | "xian" | "cang";

// 光行五:每日修行的五種運作方式。[顯示名, 意義, 真實對應]
export const GUANGXING: Record<GuangxingKey, [string, string, string]> = {
  ning: ["凝光", "把散亂的光重新聚回自己,開始前先安住當下", "深呼吸、冥想、今日意圖、感恩、回到此刻"],
  lian: ["煉光", "透過反覆實踐,使光逐漸穩定與純熟", "閱讀、按摩、抽牌、寫作、技能練習"],
  liu: ["流光", "決定生命的光真正流向何處;記錄投入程度而非完成率", "投入程度、專注感、真實參與感(測頻)"],
  xian: ["顯光", "讓內在的光成為世界能夠接住的存在", "發文、完成作品、發布、共振會、公開分享"],
  cang: ["藏光", "收回光,允許恢復;不是逃避,是重新蓄積", "睡眠、放鬆、收光、安靜、大休息"],
};

export type GuangfaKey = "ju" | "shou" | "yin" | "zhu" | "ying";

// 光法五:光行成熟後自然發展的應用。[顯示名, 意義, 真實對應]
export const GUANGFA: Record<GuangfaKey, [string, string, string]> = {
  ju: ["聚光", "將光集中於一個目標", "今天只完成一件重要的事"],
  shou: ["守光", "長時間維持穩定狀態", "長時間深度工作、主持活動、長時間創作"],
  yin: ["隱光", "暫時不對外展現,等待成熟而非停止", "停更、閉關、沉澱、醞釀新作品"],
  zhu: ["祝光", "讓自己的光帶著感謝與祝福,留存於作品中", "牌卡、文章、講義、Podcast 完成時的封存心意"],
  ying: ["映光", "讓世界開始回應自己的光,形成雙向互動而非單向輸出", "留言、討論、AI 論道、共振會互動"],
};

export type Privacy = "私人" | "限閱" | "公開";

// 行光牌與收光系統・地基實作(2026-08-04,補充裁決01):四個欄位讓收光、
// 行光牌與知識煉金站共用語意。正式版 DojoEntry 已改存 DB-14 JSON；非私人
// 紀錄另同步 DB-19 生活痕跡，型別必填可在寫入前擋下欄位遺漏。
export type SourceType = "practice" | "forage" | "work" | "service" | "archive" | "rest" | "alchemy";
export type TraceLevel = "daily" | "accumulated" | "permanent";
// 值域裁決(補充裁決01之2):一般／收納／隱藏。本輪只建欄位、只寫預設值
// 「一般」,不實作任何依賴它的行為(收納/隱藏的實際操作留待痕跡卡片那一輪)。
export type TraceStatus = "一般" | "收納" | "隱藏";

// space → sourceType 的對應(委派書只列了值域,沒給對應表,依各場域既有的
// 中文描述直接對應,無歧義):修習所=practice、野採=forage、織光堂=work、
// 聊解室=service、道藏=archive、收光=rest(委派書步驟三本身已明訂)。
// alchemy(知識煉金)沒有對應的 space,是這輪額外支援的第七個 sourceType 值,
// 目前沒有 UI 入口會寫入這個值。
export const SPACE_TO_SOURCE_TYPE: Record<SpaceKey, SourceType> = {
  practice: "practice",
  forage: "forage",
  weaving: "work",
  liaojie: "service",
  dao: "archive",
  closing: "rest",
};

export type DojoEntry = {
  id: string;
  title: string;
  space: SpaceKey;
  kind: string;
  privacy: Privacy;
  note?: string;
  date: string;
  // 光行／光法皆為獨立選填標籤:不填合法、可只標其一、也可兩者同時標記。
  guangxing: GuangxingKey | null;
  guangfa: GuangfaKey | null;
  // 測頻(三方協作規格書 v1.3 §2.3/§3.5.1):只在收光復盤階段填入,紀錄當下
  // 一律留空。undefined = 尚未標記,不是 0 分——0 不是合法的測頻值。
  freq?: number;
  // 強度(修正委派書 v1.0 四):1–10,與頻率並列、各自獨立可清除,規則同頻率。
  intensity?: number;
  // 以下四個是地基實作新增欄位:必填,不存在留空的合法路徑(委派書步驟二
  // 「必做」)——建立資料時一律寫入初始值,不靠空值 fallback 補救,型別上
  // 設成必填讓 TypeScript 在編譯期擋下任何遺漏的建立路徑。
  sourceType: SourceType;
  traceLevel: TraceLevel;
  traceStatus: TraceStatus;
  viewCount: number;
  // 對應 DB-19 生活痕跡庫的 Notion page id。私人項目不建立 DB-19 痕跡，
  // 只寫入受 ACCESS_KEY 保護的 DB-14 正式紀錄。
  traceId?: string;
  // DB-14 正式持久化紀錄的時間戳。舊 DB-19 痕跡沒有這兩欄,所以保持選填。
  createdAt?: string;
  updatedAt?: string;
};
