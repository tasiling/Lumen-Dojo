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
