# 全零的深耕聚光系統 — 產線 C 主控台

依《總綱 v2.5》《大生產日 SOP v0.9.2》《產線 C 委派書 v1.6》《產線 A 委派書 v1.6》建置(見 `docs/`)。
Notion 為唯一真實資料源,本 App 不儲存任何權威資料;App 關閉後,擁有者仍可直接在 Notion 手動完成一切操作。

## 已交付範圍

- **P1 主控台首頁**(`/`):月曆網格(當月/下月切換)、今日待辦。完成度儀表**分兩組呈現**(委派書 v1.6):單筆 Session 依 DB-03 狀態機(5 階),批次 Session 依 DB-04 明細狀態(3 階,待產出/已產出/已交付)匯總,兩者刻度不同不合併計算,整體進度條取兩者已交付數之和。
- **P5 Session 工作站**(`/sessions`):批次/單筆建立 Session+明細(新建明細一律明細狀態=待產出)、抽牌輸入與識別碼驗證(含逆位 R 後綴記法)。表頭狀態機只能順序推進(跳步需二次確認)。**明細狀態操作**(v1.6):逐筆或多選(所選須同狀態)推進明細狀態,清單上方即時顯示匯總(如「已產出 5/14」);全數明細已交付時出現確認按鈕,按下才推進表頭狀態,不自動執行。
- **P2 序列展開引擎**(`/expand`):讀 DB-06/07/15,依錨點(首場/每場/末場)計算實際日期,預覽清單勾選確認後才寫入 Notion。
- **P8 生成工作台・階段一・一鍵組稿**(`/generate`,委派書第 1.5 期):
  - **P8-0 組稿選項表單**(v1.6):封面(文字描述/Canva 模板編號,選填,皆空則提示詞明示「封面未指定」)、維度/方法選擇(僅心理測驗類 Session 出現,列出 DB-14 已核可的服務導流占卜候選清單供點選,方法可從七方法清單換,App 不代選)、其他臨場備註(選填一行)。內容只組進提示詞,不寫入任何資料庫。
  - 單筆 Session:自動取用唯一明細,組出一份提示詞。
  - 批次 Session(如一更 14 天占卜):支援**模式甲・整批一稿**(預設,一份提示詞含全部日期+牌卡,結尾加註請分篇產出)與**模式乙・逐篇分稿**(每天一份獨立提示詞,清單各自複製),組稿前可手動切換模式。逐筆讀牌卡資料時顯示「已完成 N/M 筆」進度,部分明細資料不全時列出未納入清單,不靜默跳過。
  - 五項輸入(牌卡資料、DB-05 對應規則現行版、DB-08 月主題包、DB-14 語氣指引現行版、規則輸出格式)缺一律報錯,不靜默省略;項目用途=大眾占卜時月主題包為選填。
  - 語氣指引讀取規則:DB-14 標題以「語氣指引」開頭、核可狀態=已核可,取版本最新者;若該筆「連結」有值,依連結取回該 Notion 頁面全文取代內容欄。
  - 純讀取、不寫入 Notion、零 API 成本。

P3 生產日工作台、P4 固定項目註冊器、P6 回饋快填、P7 提案審核台為第二、三期範圍(委派書 v1.6:**追加工作完成後,第二期正式開工**),P8 階段二・一鍵生成(Agent SDK)為第四期範圍,皆尚未實作,期間請直接在 Notion 操作(委派書七、分期交付)。

## 環境變數

在專案根目錄建立 `.env.local`(部署平台則於環境變數設定頁面),見 `.env.example`:

```
NOTION_TOKEN=你的 Notion Internal Integration Token
ACCESS_KEY=你自訂的一組存取金鑰(任意字串,建議夠長夠隨機)
VOCABFORGE_INTEGRATION_URL=你的 VocabForge Railway 網址
LUMEN_VOCABFORGE_SYNC_SECRET=兩個 Railway 服務共用的隨機串接密鑰
```

- `NOTION_TOKEN`:擁有者自行在 Notion 建立 Integration 並取得,**不得寫死在程式碼或提交進版控**(`.env.local` 已在 `.gitignore` 中)。Integration 需被分享(share)到本委派書「三、資料對接表」列出的 16 個資料庫,否則 API 會回傳 404/未授權。
- `ACCESS_KEY`:單一存取金鑰(委派書 v1.1 新增需求)。**不是登入系統、無帳號無多用戶**——只是一把鑰匙:沒設定這個環境變數,App 會拒絕所有請求;設定了但瀏覽器沒帶對的金鑰,頁面會被導去 `/unlock`、API 會回 401。在 `/unlock` 輸入一次金鑰後存進瀏覽器 cookie(1 年),之後不用再輸入。金鑰本身建議用亂數產生一段夠長的字串(例如 `openssl rand -hex 24`),不要用容易猜的詞。
- `VOCABFORGE_INTEGRATION_URL`:VocabForge 正式或預覽服務的根網址。只由後端用來傳送使用者在英文自譯工作台親自選中的 1–3 個表達。
- `LUMEN_VOCABFORGE_SYNC_SECRET`:伺服器對伺服器的串接密鑰,不得加上 `NEXT_PUBLIC_` 前綴。VocabForge 服務端需以 `LUMEN_INTEGRATION_SECRET` 設定相同內容。

## 本機開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000,第一次會被導去 `/unlock` 輸入 `ACCESS_KEY`。

## 部署到 Railway

1. 到 [railway.app](https://railway.app) 用 GitHub 帳號登入,New Project → Deploy from GitHub repo → 選這個 repo、這個分支。
2. Railway 會自動偵測 Next.js 專案。若沒有自動抓到,手動確認:Build Command `npm run build`,Start Command `npm run start`。
3. 專案 → Variables,新增兩個環境變數:
   - `NOTION_TOKEN`
   - `ACCESS_KEY`
4. Deploy。完成後 Railway 會給一個 `*.up.railway.app` 網址,開啟後先到 `/unlock` 輸入你設定的 `ACCESS_KEY`。

## 部署到 Vercel(替代方案)

1. 將本 repo 連接到 Vercel 新專案。
2. 在 Vercel 專案設定 → Environment Variables 新增 `NOTION_TOKEN` 與 `ACCESS_KEY`。
3. 部署。無需額外建置設定(標準 Next.js App Router 專案)。

其他平台(自架 Node 主機等)只需能執行 `npm run build` + `npm run start`,並提供上述環境變數即可。

## 驗證過的事項

- 16 個 Notion 資料庫 schema 已逐庫 fetch 驗證,欄位名與委派書描述一致(見 `lib/notion/schema.ts` 的實際 data source ID)。
- 序列展開引擎(`lib/date.ts` 的 `expandSequence`)已用「顯化共振會一期四場、跨月」案例驗證:首場錨點正確相對第一場、每場錨點對每一場各複製一組、末場錨點正確相對最後一場,跨月不斷裂。
- `npm run build`(TypeScript + ESLint + Next.js production build)通過。
- ACCESS_KEY 存取金鑰保護已本機驗證:無 cookie 訪問頁面會被導去 `/unlock`、訪問 API 回 401;錯誤金鑰回 401;正確金鑰後設 cookie 並放行;`/unlock` 本身不受保護(否則無法輸入金鑰)。
- 已在正式部署(Railway)上用測試資料實際跑過「批次建立 14 天 Session」與「序列展開預覽+確認寫入」,寫入結果與預期完全吻合(序列展開的錨點日期分毫不差),驗證後已清除測試筆。
- P8 組稿邏輯的純函式(`lib/generate/cards.ts` 逆位解析、`lib/generate/toneGuide.ts` 語氣指引版本挑選、`lib/notion/queries.ts` 的 `extractNotionPageId` 兩種網址格式解析)已用本機腳本驗證正確(見 `docs/schema/P8階段一組稿邏輯.md`)。因需要真實 Notion 資料組合(現行版規則+對應月主題包+語氣指引皆到位),尚未在部署環境實測完整成功路徑,包含批次組稿模式甲/乙、語氣指引連結取回全文的路徑。
- 服務導流占卜配對表解析器(`lib/generate/serviceDivination.ts`)已對照 DB-14 實際的 26 筆真實資料(含「型別:群體」的特例)手動驗證解析正確,包含正確排除不符格式的內容(如語氣指引本身)。
- DB-04「明細狀態」schema 已重新 fetch 驗證存在且選項與委派書逐字一致。

## 本期未涵蓋事項 / 待擁有者決定

1. ~~DB-03「項目用途」欄位落差~~:**已定案(v1.3)**。擁有者已在 Notion 手動新增「事件序列文、邀請文、心理測驗、個人心得」4 個選項,P2 序列展開引擎已改為寫入「事件序列文」。三更/邀請文、二更/心理測驗的對應規則已記錄於 `docs/schema/項目用途落差說明.md`,但三更、二更本身的自動產生功能不在本期範圍,尚未實作。
2. **DB-04 明細缺乏節點/內容類型欄位**:目前把節點資訊編碼進明細編號(標題)文字,不是結構化欄位,查詢/統計較不便。詳見 `docs/schema/項目用途落差說明.md`。
3. ~~P1 完成度儀表的月份歸屬~~:**已解決**。改為依明細的「對應日期」歸月(一個 Session 在本月有對應日期的明細就計入本月,跨月批次會分別計入涉及的每個月),不再用 Session「建立日期」。
4. ~~P1 行事曆呈現方式~~:**已解決**。改為月曆網格(當月/下月切換),格內顯示當天任務預覽,點格子看當天完整清單。
5. P3、P4、P6、P7 完全未實作(依委派書分期交付規劃,屬第二、三期);P8 階段二・一鍵生成屬第四期,需階段一實用驗證合格且擁有者明確批准才開工,本次未做。
6. 尚未做手機瀏覽器實測(驗收標準要求 P1、P6 手機可順暢操作;P6 本期未做,P1 已用 Tailwind 響應式版面但未經真機測試)。
7. **P8 組稿的「Session 項目用途 → DB-05 對應規則」映射有落差**:DB-05「適用項目」現為 7 個選項(能量流/大眾占卜/心理測驗/邀請文/個人心得/事件序列文/服務導流占卜),但 DB-03「項目用途」有 9 個選項(多出日更/個案/實驗)。若 Session 的項目用途是「日更」「個案」或「實驗」,P8 組稿會正確報「找不到現行版規則」而卡住——這不是程式錯誤,是規則庫(產線 B)尚未建立對應類別,詳見 `docs/schema/P8階段一組稿邏輯.md`。
8. ~~語氣指引尚未建立~~:**已解決**。擁有者已在 DB-14 登記「語氣指引 v0.1」(核可狀態=已核可),P8 讀取規則已依此調整(見上方「已交付範圍」)。
9. **P8 批次組稿的模式預判為簡化實作**:v1.5/v1.6 原意是「App 依 Session 結構預判全明細是否同規則」,但目前 schema 下同一 Session 的所有明細必定共用同一條規則(規則依 Session 項目用途查,DB-04 明細沒有可覆寫的規則欄位),因此預判邏輯目前恆為模式甲,使用者仍可手動切換模式乙。詳見 `docs/schema/P8階段一組稿邏輯.md`。
10. **P8 階段二・批次生成未實作**:委派書也定義了批次生成(逐篇佇列、額度守門)規格,但依分期交付,階段二需「階段一實用驗證合格且擁有者明確批准」才開工,本次僅完成階段一(組稿),階段二規格已記錄、程式碼未動。
11. ~~DB-04「明細狀態」欄位~~:**已到位(v1.6)**。擁有者已在 Notion 補上此欄,App 端已對接:新建明細一律待產出、明細狀態只能順序推進、P5 支援逐筆與多選操作、P1 完成度儀表已改吃此欄位(批次 Session 部分)。
12. **服務導流占卜配對表尚未有任何一筆核可**:DB-14 現有 26 筆配對表資料,核可狀態全部是「待審」,只有語氣指引已核可。P8-0 的維度/方法候選清單因此目前會顯示「沒有已核可的候選服務」,這是資料尚待擁有者逐項審核的正常狀態,不是程式問題。

## 程式碼結構

```
lib/notion/schema.ts      16 個資料庫的 data source ID 與選項常數(逐庫 fetch 驗證過)
lib/notion/client.ts      Notion client 單例 + 節流佇列(~3 req/s)+ 指數退避重試
lib/notion/properties.ts  Notion 屬性值讀寫小工具
lib/notion/queries.ts     各資料庫查詢函式(含分頁)
lib/notion/mutations.ts   建立/更新頁面、狀態機推進規則
lib/date.ts               序列展開引擎的錨點日期計算(首場/每場/末場)
lib/generate/cards.ts               抽出順序字串解析(逆位 R 後綴記法)
lib/generate/toneGuide.ts           語氣指引版本挑選(取 vX 最大值)
lib/generate/sections.ts            五項輸入的共用解析邏輯(單篇/批次組稿共用)
lib/generate/compose.ts             P8 單篇組稿主邏輯,五項缺一即報錯
lib/generate/context.ts             P8 批次組稿共用區塊(規則/月主題包/語氣指引,只解析一次)
lib/generate/p8zero.ts              P8-0 組稿選項表單格式化(封面/維度方法/備註)
lib/generate/serviceDivination.ts   服務導流占卜配對表內容解析(主維度/方法/題目)
app/                                P1 主控台、P5 Session 工作站、P2 序列展開、P8 組稿 四個頁面 + API routes
docs/                               總綱、SOP、委派書原文 + schema 落差說明 + P8 組稿邏輯說明
```
