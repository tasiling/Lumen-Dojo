# R2-2 修習所工作空間交付

## 基準與範圍

- Repository：tasiling/Lumen-Dojo。
- 分支：`codex/r2-2-practice-workspaces`。
- PR #72 仍 open／unmerged；採用底座 SHA：`dc400c319e63585c95e714e28b376a9219ce75b6`。
- 核對 master：`06adf98cd38af82047b3986ca39fd590680fc037`。
- 已驗證程式 checkpoint：`a5705c1`；最終交付 Head 見 Draft PR。
- Draft PR base：`codex/r2-1-learning-foundation`，Depends on #72；僅供獨立審查，禁止合併進 R2-1 分支。
- R2-1 production enablement 維持原任務處理。本包未修改 R2-1 分支或 PR #72，未合併、部署或寫正式資料。

工作區遺失後依使用者授權重建既定內容，未沿用中斷前測試結果。每個區塊已保存 checkpoint：首頁與學科 `16c203d`、日記與離開保護 `dfa9b5c`、隔離測試 `aaacbe8`、返回與測試修正 `4d5ac09`、日期與讀取狀態 `a5705c1`。

## 可操作介面

`/practice` 提供已保存日記續寫、六個快速工具、身／心知情意／靈入口、真實最近紀錄、光之圖鑑及次要計時。續寫根據未完成紀錄的 updatedAt，沒有保存最後點擊卡片，也不使用 localStorage 作正式資料源。

`/practice/learning` 預先顯示本期專注與全部學科，不預選英文。項目以稳定 ID／舊 key 解析；總覽、學習路徑、修習工具、學習紀錄各有 URL 分頁。階段／主題沿用底座資料；空白路徑能直接留下學習紀錄。標題附近可進管理；ID／revision 在進階區。英文重型工具只在獨立頁載入。

`/practice/manage` 沿用實際 R2-1 管理 UI；`/practice/legacy` 保留五項設定、素材及舊活動紀錄，避免重新建立同用途模型。

`/practice/journal` 沿用 EnglishJournalWorkbench 的來源日期、分段、初稿、AI 對照、定稿、候選派送、已完成紀錄与既有完成規則。指定已完成日期會開啟回顧；只有來源而沒有自譯時由使用者明確加入，開頁不自動 POST。來源日期以台北時區顯示。保存進行中禁用編輯欄位，避免保存 response 覆蓋新的輸入。未保存時保護連結、主導覽、瀏覽器返回及原生重新整理／關閉；保存失敗保留目前內容。

身與情使用既有紀錄表單；不顯示未持久化勾選。意保留角色、里程碑與狂A；靈保留 Vision；晨間肯定句仍在原流程。光行與光法分開說明，沒有建立作品、Claim 或發布內容。歷史紀錄、計時與其他既有引擎均保留。外部服務未配置或讀取失敗會顯示具體狀態。

## 導覽與相容

- 舊 `/practice?journal=…`、`manifestation`、`vision`、`learningItem` 轉接至對應工作頁，保留日期、來源、returnTo 與其他 query（含重複值）。
- 新工作頁可直接開啟、刷新；選擇學科與分頁保存於 URL。工具的返回脈絡只接受本站 `/practice/learning?…`。
- 隔離測試發現此版本框架導覽至計時頁時替換目前 history entry。新工作頁使用明確的來源 history entry 配合 router.replace；實際瀏覽器返回已驗證能恢復選定項目與工具分頁。未修改 Next 依賴或部署診斷程式。
- 未授權導向 unlock 時保留完整 pathname＋query，登入後日期不遺失。

## 資料、權限與 schema

無新增 schema、migration、資料庫、服務或付費 AI。讀寫仍落在既有 `/api/dojo/learning/foundation`、`/learning`、`/english-journal`、`/entries`、`/captures` 與既有創現／Vision APIs 的 Notion 儲存。既有 owner／登入檢查、revision、mutex、seed intent 与結果不明保護都未放寬。UI 沒有宣告所有權或自行判定正式完成。

素材仍沿用既有 updatedAt 版本令牌，本包未增加並發保證。隔離 in-memory API 測試可能在同一毫秒完成兩次編輯，因此只在該測試固定下一次編輯時間為前一令牌＋1ms；正式 adapter 未改，這不表示已證明同毫秒令牌的唯一性。

週盤設定、6＋2、預設專案、範本與已安排格子未修改；僅保留既有日記完成 API 的原有成果銜接。本包測試未送完成／派送／初始化到正式資料。

## 本次驗證（2026-10-01）

| 項目 | 結果 | 證據／範圍 |
|---|---|---|
| Next typegen、TypeScript `tsc --noEmit` | PASS | 本次重建程式，含新增路由及 guard |
| `npm run lint` | PASS | 0 errors；既有 app/plurk/page.tsx img warning 1 筆 |
| `test:practice-workspaces` | PASS | 真實 React／Next＋Chromium，隔離 API fixtures；375／390／430px、長中文／英文、九學科、續寫保存刷新、日期／來源、返回工具分頁、已完成回顧、未保存返回取消、失敗保存保留內容、鍵盤 focus／Tab、500px 視窗與保存列、外部不可用；零外部請求與 runtime error |
| `test:learning-foundation-ui` | PASS | 真實管理 UI＋in-memory foundation service；初始化預覽與明確操作、十項、階段／主題排序移動暫停封存恢復、ID 穩定、刷新、三種寬度、計時返回、心理學／中醫素材關聯再編輯刷新 |
| `test:learning-foundation` | PASS | 底座 domain、ID、focus、revision、mutex／intent、未知關聯等回歸 |
| `test:learning-foundation-api` | PASS | 實際 handler／adapter 在隔離 IO＋专用 lock 目錄；授權、零寫入 GET、stale、共用 writer 讀取失敗釋鎖、結果不明保護、部分初始化等 |
| `test:weekly` | PASS | 原週盤回歸；未改設定 |
| `test:english-images` | PASS | 既有完成條件 model 回歸 |
| `test:capture-exploration` | PASS | 既有素材探索回歸 |
| `test:html-entity-overflow` | PASS | decoder／persistence 回歸 |
| `npm run build` | PASS | 標準 Next production build，未執行 npm start／LINE 腳本 |
| `git diff --check` | PASS | 本次 diff |
| 真實隔離 Notion integration | SKIPPED | 未具備隔離 token、data source、owner/schema 對照；DB14 仍正式固定來源，沒有以正式紀錄代測 |
| Railway runtime／持久 volume | SKIPPED | 非 R2-2 編碼前置；未部署、執行 probe 或修改基礎設施 |
| iPhone Safari 實機 | SKIPPED | 無實機；原生軟鍵盤、實際 safe-area、登入／輸入保存／返回刷新仍待實機驗收。Chromium 模擬不等同 Safari PASS |

中途失敗均保留並診斷：保存列被既有 overflow 容器影響（已修）、空的 open 屬性被測試誤當關閉（修正行為測試）、完整 Chromium binary 在 sandbox 因 socket 權限失敗（改用 Playwright 預設 headless shell）、Next history 替換（已驗證修正）、素材測試同毫秒令牌（隔離時鐘）、採集匣 click 早於資料／hydration（等待真實計數）。最終結果為重跑結果，沒有使用 PR 的舊 PASS。

所有長命令使用 timeout，伺服器 readiness 有 45 秒上限，保留 /tmp/r2-2-*.log；UI 測試自行啟動本地 dev、只注入隔離 ACCESS_KEY，拒絕載入 .env 檔，不執行 npm start。兩個 UI 測試須順序執行，避免共用 .next dev cache。可用 `UI_CJK_FONT` 指向本地繁中文字型改善截圖，此為測試字型，未增加產品依賴。

## 隔離畫面證據

`docs/evidence/r2-2/`：home-375／390／430、journal-375／390／430、learning-long、learning-375／390／430。全部為 fixtures，沒有正式使用者紀錄。已實際查看首頁與日記畫面，長文字可換行，完整頁表單不放窄彈窗。

## 遠端交付觸發核對

唯讀 `get-service-config`，Project `15793738-2769-4165-b755-49047aa7f445`：

| Environment | Service | 實際 source branch |
|---|---|---|
| production `b880e871-66f8-4d30-8ca2-4876fcee8964` | `fe2382be-d017-46df-94f0-b733e90c0936` | master |
| preview-pr-27 `fa21d04a-af24-4671-9852-17c2a1add0e2` | `fe2382be-d017-46df-94f0-b733e90c0936` | codex/xingguang-formal-integration |
| 同上 preview | `a3599405-70a2-488c-a117-72342a7afb0f` | codex/knowledge-claims-foundation |

三者均非 R2-2 分支，沒有 staged changes。PR Environments OFF 沿用使用者提供之 Project Settings → Environments 證據；沒有把 checkSuites 當 autodeploy 開關證據，也沒有登入或修改 Railway。正式寫入鎖／preview writer 仍屬 R2-1 Production Enablement，本包未解決亦未宣稱解決。

## 修改檔案與恢復

介面：PracticeHome／PracticeLearning／PracticeWorkspace／PracticeRouteLink、新路由與 dojo.css。相容：LearningPaths、LearningFoundationManager、CreativeRoleStudio、EnglishJournalWorkbench、DojoShell、proxy。導覽與 guard：practiceNavigation、usePracticeLeaveGuard。測試：package.json、新隔離 server／workspaces script、管理 UI／API 測試的必要修正。文件與上述 screenshots。完整清單見 PR diff。

本包沒有正式資料遷移或清理。尚未合併／部署時恢復只需停用 R2-2 分支；未來若回復介面，應回到包含 R2-1 底座的版本，不能啟動會清除新學科關聯的舊 writer。程式回復不等於回復 Notion 資料，私人備份不在本 repo。

## 交付狀態

- CODE：Complete。
- ISOLATED TESTS：Complete（範圍見表）。
- PR：獨立 Draft，Depends on #72；最終 URL／Head 以交付回報為準。
- PRODUCTION：未合併、未部署、未写正式資料；真實 Notion、Railway runtime 與 iPhone 狀態分別 SKIPPED。
- 未完成：上述實際環境／實機驗收，以及 #72 合併後未來重新設定 R2-2 base、核對共同基準與 diff；不在本次自動執行。
