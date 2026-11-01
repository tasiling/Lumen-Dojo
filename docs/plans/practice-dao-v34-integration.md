# 修習所／道藏 v34 正式整合

基準：master f808a4c93ba6582e4afaad18bdb0dded74f8e681；使用者確認 v34 HTML 後要求「繼續，建置上去」。

本包先接合既有正式首頁、學習項目與紀錄表單：綠色同心圓／紫杏拱門、等高欄位、可鍵盤操作的問號說明、統一學習項目名稱。正式紀錄維持既有 API、穩定 ID、revision、來源與單份正文，不把 HTML localStorage 當作正式資料。表單主要項目更動清除位置、階段變更清除主題，防止誤關聯。

後續依賴：PR #85 的能力／道藏、#84 的評核、#83 的回顧、#79 的外部成果回流尚未合併；不得宣稱這些已正式整合。先保留既有能力與來源，不自行批次搬資料。日期／搜尋等未接合的 prototype 功能另列待辦，不能以視覺移植代表全功能完成。

視覺：修習綠 #248674、淺綠 #dff4ee、深藍 #18384d；道藏紫 #8c80b2、杏 #f4dba9；白卡、18–22px 圓角、16px 正文字體。手機保留兩欄短欄位、44px 問號觸控區、48px 輸入框；長內容換行；底導及鍵盤需實機檢查。

驗證：既有 domain 測試、TypeScript、production build；新增真實 React SSR 的說明標籤／隱藏說明／按鈕類型檢查。不能沿用 HTML 隔離檢查當成正式版測試，也不能將 SSR 當成真實瀏覽器或 iPhone Safari 驗證。

## 本輪完成與恢復點

- 核准來源：同一份 v34 HTML，SHA256 `58f78e5a4f990242c0054425af379b710a61923a9a5c8b64463cc5d0ec91a273`。
- 正式碼：PracticeField 可點擊／鍵盤操作說明、獨立按鈕不提交表單、群組不使用無效 label 目標；正文表單與快速新增共用。依既有 API 讀寫，不換資料格式。
- 項目依存：主要項目變更清除階段與主題，階段變更清除主題；清單限定主要項目及所選階段。記錄日期唯讀。所有此包修改入口用「學習項目」。
- 視覺：兩個場域漸層、SVG 同心圓／拱門、十項學習項目各自圖示、白卡與等高欄位、問號44px點擊區、中央新增隨場域綠／紫配色。
- 審查修正：舊樣式繼承直排造成入口卡片堆疊→明確 row；群組 heading 改 span；「跨項目項目」重複用字修正；header SVG 明確20px，避免依賴 tc-shell 的尺寸樣式。
- 已通過：真實 React SSR 標籤／說明／獨立按鈕／跳脫／群組檢查；既有 learning-records、learning-foundation、practice-events；next typegen 後 TypeScript 無錯。初次 tsc 的 RouteContext 缺失由 Next 正式 typegen 解決，未改全域型別。
- 真實瀏覽器375/390/430px、桌面與 iPhone Safari、鍵盤／未保存返回／實際寫入重開仍未驗證；不能以 SSR 或 prototype2279項檢查取代。build 最終結果見 PR 檢查說明。
- 下一包：比對 PR85/84/83/79 的真實來源與 API，將已確認的紀錄管理、道藏知識與評核流程接入；補正式功能與 HTML 對照清單及 API 失敗／衝突測試。本包沒有把那些尚未接合功能標記完成。
- 沒有修改正式資料、沒有資料清理／遷移、沒有合併或部署；未從「建置」推定未完成整合版已獲發布授權。

最終驗證：`npm run build` 成功（Next16.2.10），最終產出的 CSS 已含 header icon 尺寸修正。`npm run test:r2-3-api` 成功：實際 journal/records/events route handlers + persistence adapter，隔離 IO 驗證 auth、read failure unlock、event-first、stale refusal、projection retry、GET 無寫入、create request 去重、未知已提交回應保留 lock/intent。沒有真實 Notion 寫入，不能宣稱 production persistence 驗收完成。

## 2026-10-23 合併驗證

使用者明確要求合併 PR104；原工作已完成且閒置，head 為 `66e9614dac13f44628d059db52785eecc785bb38`。在隔離工作樹整合 master `a632d1bd4c64e5480500a900e41d66d1bd528888`，只需解決 DojoShell 路由樣式兩處衝突，同時保留閱讀 shell、修習所／道藏 shell 與創作工具。閱讀及聊解工具檔案與該 master 一致。

本輪新執行且通過：

- `npm run build`（包含 TypeScript）；欄位 SSR；learning-records、learning-foundation、practice-events、r2-3-api、reading-knowledge。
- `UI_PRODUCTION=1 node scripts/test-practice-v34-ui.mjs`：375／390／430／1024px；兩個場域、問號 Enter／Space 操作、未保存內容保留、記錄日期唯讀、主要項目／階段／主題連動、844／430px 高度的儲存按鈕不被底導遮擋、快速新增提示。零 API 寫入及頁面錯誤。
- `UI_PRODUCTION=1 npm run test:r2-3-ui`：375／390／430px 的草稿／完成／編輯／封存／恢復、重開、未保存離開保護、181 筆分頁及投影重試。資料皆為瀏覽器攔截的隔離 fixtures，沒有正式寫入。舊測試改為精確欄位名稱，並更新「正文完成」及「返回學習項目」用字。
- production reading-visual、reading-knowledge-ui：閱讀四頁、來源定位、搜尋及分類衝突均通過。
- production test-liaojie-original-tools-ui：五個原創作工具入口、知識鑽石保存／重開／多視窗保護、原始指令與節點、雜誌／輪播實際1080×1350 PNG、日上三更單次／批次操作及320–1024px通過。
- 修改的共用 shell、欄位元件及新增／更新測試 ESLint，git diff whitespace 檢查通過。

限制：縮短 Chromium viewport 不能等同 iPhone Safari 實體鍵盤與安全區驗收；正式資料寫入、完整舊 R2 能力／道藏／回流未納入。本次只批准合併，不手動部署或修改 Auto deploy、憑證、資料庫及 `/data`。合併可能由現有 Auto deploy 自動發布；需獨立讀取部署結果才能聲稱上線。

## 2026-10-23：正式手機截圖修正

基準 master `70db289d8d4499a6c91a7b4a3d4e395eed4d06e1`（PR104 已合併）。使用者提供 IMG_1402–1406，先分析後明確要求修改。隔離分支 `codex/practice-mobile-polish-20261023`，本輪不合併或部署。

實際修正：
- 修習／道藏補上內容容器真正使用的 --bg；按鈕連結有48px完整排版；頁首與不透明底導共用幾何與綠／紫／杏色，補安全區與底部留白。閱讀內文仍保留既有新視覺。
- 修習所依主視覺→身心靈入口→常用工具→有內容／載入／錯誤才出現的自譯→最近修習排序。學習正文與其他修習紀錄保留各自穩定 ID 和入口，同卡片清楚標示；活動事件收在折疊區，不把工程名詞放在首頁。
- 道藏入口有圖示、內文與箭頭；入藏按鈕、標題與白底空卡有獨立間距。讀取失敗不顯示假的空紀錄；已讀取紀錄在其他資料失敗時仍保留可見。
- 中央新增只選擇既有編輯器、不自動寫入：修習所／道藏開既有 quickadd；指定學習項目進新正文；閱讀進 /add?mode=reading；其他場域保留一般新增。
- /add 由 server 讀取合法 mode，再以 key 初始化原有 client 工作區，避免閱讀摘錄先閃現擷取；擷取／閱讀／行程原處理器保持。閱讀新增頁另補清楚字級與表單樣式；返回按鈕在無歷史時可回閱讀。
- 新紀錄使用既有 owner-scoped foundation graph 將 legacyKey 解析為正式 ID，等待資料載入後才開編輯器；找不到或封存項目不建立關聯。existing record 不因 foundation 遲到而重載草稿。
- 審查抓到切換 URL 時舊 draft 可能仍顯示，已加 loadedEditorContext 對應與 save guard；先寫出可失敗的 retained-hook-state 真實 React render 重現，再驗證無效新位置、有效新位置載入中均不顯示舊表單，既有封存項目歷史仍可編輯。

驗證：`scripts/test-practice-mobile-polish.mjs`：contextual add 邊界／編碼、真實 React SSR 首頁排序、道藏、空／失敗／長文／穩定ID、初始新增模式、已讀取內容保留、別名轉換、既有表單位置切換；CSS parser 根因檢查 --bg、anchor display、底導不透明。`scripts/test-practice-field-help.mjs` 和 `test:r2-3-api` 通過。TypeScript 通過；本輪最終 production build 結果寫於 PR。

限制：以上不是375/390/430px、桌面像素、iPhone Safari、鍵盤／實際滾動或正式 Notion 讀寫驗收；沒有透過localhost或其他來源繞過先前 file URL 的瀏覽器安全拒絕。保留未驗證狀態，不宣稱全站視覺已驗收。

下一步：對此修正版做真實裝置驗收，再依對應版本授權合併／部署；完整能力、道藏與成果流程仍按前述依賴另續作。不把 PR104 的合併授權推定為本修正版已准發布。

補充驗證：實際 Shell onClick 以隔離 navigation/store 邊界呼叫，確認修習／道藏開正確既有表單、選定項目與閱讀導向正確、取消離開時不導向或開表單；在 /add 再按新增為 no-op，不重置模式與未保存內容；直接進閱讀新增且無歷史時返回閱讀頁。這些是 handler／React render 檢查，不是觸控或像素驗收。

最終：本輪最終 `npm run build`（Next16.2.10）成功；上述 SSR／handler／CSS 原因檢查、field-help、TypeScript 與 r2-3-api 通過。未驗證的實機項目保持待驗收；未取得此修正版合併／發布授權，僅推送與準備可審閱 PR。

## 2026-11-01：再次對照正式截圖與學習內頁

先核對 PR106 仍 OPEN、head `315a9afc41653743130318549b303de636caf754`；正式 Railway 成功部署仍是 PR104 merge `70db289d8d4499a6c91a7b4a3d4e395eed4d06e1`。本輪截圖的米色內容、文字型 CTA 與底導穿透尚未包含 PR106 修正，不能當成該修正版已發布又失效。延續同一分支，合入 master `bb42a0c8cc64b11d655db6147c47a9df5684125b`，共用 shell 衝突保留 master 聊解回退與既有新增返回；未修改創作工作區實作。

新完成：選定學習項目名稱成為唯一主標題，沿用不同項目圖示；管理入口有44px按鈕排版。手機375／390／430px預定採四等寬48px分頁，359px以下才改兩欄。總覽以現有長期方向、目標、成果呈現白底卡片；完整長說明與來源收於原生可鍵盤展開的 details，不截斷／改寫準備稿，不推定階段、程度或課綱。來源以文字保留且只有HTTP(S)轉連結，React轉義正文。移除頁內重複返回；獨立審查指出管理／紀錄的選定項目返回會遺失，已將原 fallback 移至唯一頁首返回並驗證編碼、無選擇與明確來源tab。

本輪驗證：先以實際 PracticeLearning React SSR 重現選定項目主標題失敗，再驗證修正後標題、管理入口、單一active tab、長文收合、來源連結、文字轉義與索引頁。`test-practice-mobile-polish.mjs` 全部通過，新增實際 shell 返回處理器回歸；field-help、learning-foundation、learning-records、r2-3-api 通過；next typegen＋tsc、修改元件 ESLint 通過。獨立審查的 P2 返回風險已處理。

範圍限制：CSS／SSR 不是375／390／430px或桌面像素驗收；本輪沒有真實瀏覽器／iPhone Safari、虛擬鍵盤／安全區實機、正式資料寫入驗證。不得沿用 PR104 或舊 HTML 的瀏覽器通過數字。本輪未合併／部署，仍須對應版本驗收與發布授權。後續先完成真實畫面與互動核對，再按原依賴續接能力／成果流程。

最終補充：本輪最新來源 `npm run build` 成功（Next16.2.10、TypeScript、53靜態頁）；頁首管理／紀錄返回標籤同步為「學習項目」。獨立審查重驗無未解決重要問題。實際修改與測試同存 PR106 的既有分支；不含正式發布。
