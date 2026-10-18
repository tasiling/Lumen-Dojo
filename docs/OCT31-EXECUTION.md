# 10/31 交付執行紀錄

## 2026-10-18｜第一批 R2 × 最新主線整合

目標與範圍見 [OCT31-DELIVERY.md](OCT31-DELIVERY.md)。接續已有核准 R2 計畫與已完成分支，不重建既有功能。

### 起點與合併

- 原 PR85：b2a481093b5449d45b7bc2427bf17f1086fb84c8，保留 PR83/79/84 父歷史。
- 接合 master：df5528dde6e9635258e58c41eea66e6d242c54c3，包含 PR86 野採、PR87 織光堂文字流程、PR88 操作改善。
- 僅 package.json 有文字衝突：兩側 scripts 取聯集 50 項；共同指令內容、依賴與非 scripts 設定相同。
- formal.ts 同時保留作品成品、能力規準／嘗試／證明、學成、外部收據／游標等排除前綴，不使私有流程記錄進入公開知識列表。

### 具體修正與判斷

- 原先英文影像首頁統計測試把 2026-09-18 的 raw/pending 素材當成永遠 pending。到期後實際 normalizer 依既有30天規則轉 faded，重現24/25通過、此項失敗。此 fixture 只測狀態統計，故為該 pending 樣本明確設 pinned:true；見證失敗→修正後通過。不改正式凋零規則、不更新正式素材。此取捨的限制：30天凋零另由既有規則測試承擔，本項只驗證統計。
- 既有 ForageCaptureForm EOF 多餘空白行移除；沒有改產品行為。
- 隔離 worktree 位於原 clone 旁，其他工作區原分支與頁面未被覆蓋。

### 新鮮驗證

25組領域／實際隔離API回歸均通過：R2整合、完整能力驗收、私人媒體、附件上傳／恢復、學成、反思領域與API、外站接收、R2-5C API、VF投影／成果／週盤邊界、學習底座與API、學習正文、完成事件、R2-3 API、週盤、織光堂全套、野採SSR／回歸、探索、英文影像、單元編排、HTML實體／溢出與圖片路由。英文影像使用上述失敗後修正的新鮮結果，其餘24組本次直接通過。

ESLint：0 errors、10 warnings（既有 Plurk 圖片及原R2測試中的未使用變數）。Next.js標準 production build 通過。檔案差異格式檢查通過。

一次獨立新上下文、唯讀整合審查：未發現 Critical／Important／Minor。核對50指令聯集、命名空間排除、來源adapter、導覽與revision、非重疊檔來源一致性、fixture修正範圍；審查者沒有冒稱執行測試。這是整合差異審查，非重新宣稱所有既有功能已完成正式驗收。

瀏覽器：本輪首次真正跑能力驗收 Chromium 375/390/430px，重現原始表單的欄位標籤混入 textarea 初始值／select 選項文字，精確欄位名稱找不到。將規準四個 textarea 與評核判定／回饋改為獨立 label + htmlFor/id，保留表單值、保存與評核規則。先見證 locator 失敗，再驗證編輯草稿零寫入、保存規準、新規準保留舊歷史而不自動掌握、無水平溢出；完整作答／明確證據／保存後提交／未存評核離開保護／逐項自評／獨立確認也在375/390/430通過。

原測試另把 press('A') 的結果期待成小寫a；在瀏覽器確實輸出大寫A後，僅修正測試按鍵為'a'以符合原本小寫期望，沒有在產品自動轉小寫。此本輪修正與上方日期fixture修正皆保留RED→GREEN證據。

這是隔離API傳輸搭配真實React頁面的Chromium操作，非正式Notion、非iPhone Safari。其他場域瀏覽器全套、iPhone Safari實機、真Notion附件／媒體、正式來源Bearer、native PostgreSQL與正式資料寫入仍未驗收。

### 正式環境唯讀核對

目前 Lumen-Dojo production 為 SUCCESS 部署44cadaa1-354d-4552-b85b-7cf6f56fc515；source仍為e9b86f2。已有待套用1欄設定，將來源pin更新到df5528d（PR88），未在本步套用。既有5GB /data卷及LEARNING_WRITE_LOCK_DIR變數名稱存在，startCommand是直接Next start、一個replica、overlap0。沒有讀出secret、建立新服務或改正式設定。變數名稱與卷存在不等於本版實際持久性／功能驗收。

### 尚待完成

1. 補齊其他場域與來源的隔離瀏覽器操作；能力規準／作答流程已完成上述寬度驗證。
2. 原PR85已以非force、expected SHA保護更新到6609e93789b66d1de4eaa2a6185494ae84de7614，tree與本機0e9b2fb完全相同：15e8b927ccb97fe07450297aa93c1600fbe9b4dc；base已改master，仍保持Draft。瀏覽器發現的標籤修正另行checkpoint。
3. 按排程開發新媒體共用契約、工具銜接及各媒體工作臺。
4. 不把本輪checkpoint、舊版部署SUCCESS、排程建立當成整個道場完成。

## 持續建置安排

已建立並啟用本對話持續建置任務：Australia/Melbourne，自10/19起每天08:00／15:00／20:00附近執行，共39次，到10/31晚間結束。任務要求實際程式、測試、checkpoint與push，按本排程與執行紀錄續作；同阻礙無進展不重複提醒。此排程不代表背景持續運行、不保證每次無外部限制，也不代表已完成交付。

## 本輪表單標籤修正的最終驗證

能力規準編輯、新版／舊版成果區分，以及完整作答、選證據、保存、提交、評核、離開取消、確認流程，均通過 Chromium 375/390/430px 操作驗證。修正後再次執行完整 `test:assessments`、修改檔ESLint、標準 `npm run build` 與diff check，全數通過。iPhone Safari與真實來源驗收狀態仍如上，不因瀏覽器成功而改寫。
