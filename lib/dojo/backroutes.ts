// 返回導航的靜態階層(擁有者指示:點擊回到「上一層」,不是回首頁,且不依賴
// 實際瀏覽紀錄——不管使用者從哪裡進來,場域子頁一律回到該場域首頁、場域首頁
// 一律回到今天)。這份對照表就是那個固定的「上一層」定義。
//
// 對照依據:各頁面掛在哪個場域底下,沿用委派書與各頁面既有的頁籤/連結關係
// (聊解室→任務管理站/組稿台/序列展開/日上三更/噗浪蓋樓;織光堂→生產日工作台;
// 收光→快速評分)。部分頁面(如任務管理站)同時被多處連結,取其中一個文件上
// 明訂的「主要掛載場域」當作固定上一層,不做「依實際點擊路徑動態判斷」的
// 複雜邏輯——那需要追蹤來源,超出這次要求的範圍。
export const PARENT_ROUTE: Record<string, string> = {
  "/overview": "/calendar",
  "/calendar": "/",
  "/add": "/",
  "/bingo": "/",
  "/backstage": "/map",
  "/map": "/",
  "/review": "/",
  "/assistant": "/",
  "/practice": "/",
  "/reading": "/practice",
  "/reading/visits": "/reading",
  "/reading/cards": "/reading",
  "/forage": "/",
  "/weaving": "/",
  "/liaojie": "/",
  "/dao": "/",
  "/closing": "/",
  "/sanko": "/backstage",
  "/plurk": "/liaojie",
  "/sessions": "/backstage",
  "/generate": "/backstage",
  "/expand": "/backstage",
  "/feedback": "/backstage",
  "/production-day": "/backstage",
};

export const ROUTE_LABEL: Record<string, string> = {
  "/": "今天",
  "/overview": "行事曆",
  "/calendar": "行事曆",
  "/add": "新增",
  "/bingo": "週盤",
  "/backstage": "工作後台",
  "/map": "場域",
  "/review": "回看",
  "/assistant": "執事",
  "/practice": "修習所",
  "/reading": "閱讀萃取",
  "/reading/visits": "今日回訪",
  "/reading/cards": "洞察卡片庫",
  "/forage": "野採",
  "/weaving": "織光堂",
  "/liaojie": "聊解室",
  "/dao": "道藏",
  "/closing": "收光",
  "/sanko": "日上三更",
  "/plurk": "噗浪蓋樓",
  "/sessions": "任務管理站",
  "/generate": "組稿台",
  "/expand": "序列展開",
  "/feedback": "快速評分",
  "/production-day": "生產日工作台",
};

// 這些頁面是跨場域的工具頁,任何場域都能開啟,沒有單一固定的邏輯上層——用
// 瀏覽器實際返回(router.back(),回到真正呼叫它的那一頁)比套一個固定父層更
// 符合直覺。
export const USE_BROWSER_BACK = new Set<string>(["/timer"]);

// 不顯示返回鍵的頁面:今天本身,以及登入前的門禁頁。
export const NO_BACK_BUTTON = new Set<string>(["/", "/unlock"]);
