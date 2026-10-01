# R2-3 交付／驗證紀錄

Stacked base: `codex/r2-2-practice-workspaces` / `c9860eab3ee8af3f2b4e98de548e9d22a218bfb5`。
Depends on #75，transitively #72。上游功能不在本包重做或重複審查。禁止合併／部署。

## 資料與相容性

DB14 additive per-row JSON prefixes `行光學習正文-YYYY-MM-DD:{stable id}`、`行光完成事件-{owner/source hash}`。不加資料庫／Notion schema property，不搬資料，不執行 backfill。Learning Record revision 為 optimistic concurrency；shared POSIX mkdir lock 跨程序互斥僅對共用同一實際持久 filesystem 的受控 writer 成立，沒有跨 Notion transaction 宣稱。

明確 create request ID 可重送手動紀錄；來源 hash + permanent fsynced intent 保護 event/body create。單程序記憶體只供 outcome bookkeeping／隔離 fixture，不是正式 mutex。
正式 writer 仍需要 R2-1 Production Enablement 完成 volume／拓撲；本 PR 不修改 Railway。

鎖目錄缺失時：Learning Record create/edit、journal POST/PATCH/DELETE、projection retry 及共用 JSON 層的 DailyRecord／WeeklyBoard／journal 寫入拒絕 503。GET 仍唯讀。不能用 /tmp 作正式替代；隔離測試 temp 不是持久化驗證。

Daily/weekly/journal 相容寫入層保留 server projection metadata；journal 增加 revision，舊表單版本不符拒絕。週盤設置／任務未重排或初始化；現有手動狀態與 event ledger 分開，max 而非相加。
英文學習底座缺失時明確 409，要求透過既有管理操作銜接，GET／journal 不自動 seed。

## 恢復

保留逐筆事件／正文／seed與practice intents／鎖現場。結果不明先核對 DB14 實際 source identity/page IDs，再由授權管理者依 R2-1 收尾流程恢復，不自動刪鎖或重送 create。
程式回退不回退 Notion。舊版不認識投影 ledger／revision／output flag，不能直接啟動舊 writer；先停止 writer 並保留本包相容寫入層，逐筆核對已確認與結果不明 mutation。本包不執行正式回退。

## 驗收界線

隔離 adapter、fixture、專用 temp lock 及 Chromium fixture UI。沒有載入正式憑證、沒有寫正式 DB14、沒有 npm start／LINE rich-menu、沒有 Railway 或 probe 操作。
測試結果及 UI 證據在最終檢查後填列；先前 PR 的 PASS 不沿用。
真實隔離 Notion／Railway runtime／iPhone Safari 實機均 SKIPPED。需隔離 token + data source + owner/schema 可設定對照才可做真實 Notion；目前固定正式 DB14 不換 token 代測。Chromium 只涵蓋 reduced viewport 軟鍵盤模擬與 safe-area CSS，不等於 Safari 原生鍵盤／實機。

## 本次行為驗收

| 規格案例 | 結果 | 本次證據 |
| --- | --- | --- |
| A 1–9：心理學、草稿完成、多學科單正文、改名／移動保留 ID、181 筆分頁、封存恢復、owner、stale | PASS | `test:learning-records`；讀回早期 ID／頁；actual records handler request dedup |
| B 10–17：有效段落、多段／整篇不重算、skipped／prompt／blank不計、重送、response 遺失、concurrent | PASS | `test:practice-events` transition fixtures + 真實 handler／store 的 `test:r2-3-api`；未知 response 保留 mutex/intent，不自動重建 |
| C 18–20：sourceDate vs practicedOn、延後 retry、設定時區邊界 | PASS | completion fixture／service date snapshot、DOJO_TIME_ZONE Intl date 對照 |
| D 21–23：output 一次、input/vocabulary/transfer／note／rounds／其他 DailyRecord 保留 | PASS | projection service、相容層 assertions、actual adapter retry |
| E 24–32：無綁定、穩定 ID／移格、removed／archived／ambiguous、count／dedup／unit、manual衝突 | PASS | 實際 `projectWeekly` 與 persistence adapter；count 0→1、另事件→2；max 保留兩種來源 |
| F 33–37：event保留、光步／週盤失敗、分別 retry、all applied no-op | PASS | 可故障注入隔離 repository；actual handler provider confirmed rejection／unknown response |
| R2-3 UI 375／390／430，長中英文、草稿／完成／編輯／封存恢復、返回分頁、refresh、181 筆列表、未保存取消、縮短 viewport | PASS | `test:r2-3-ui`，`docs/evidence/r2-3/` 四張隔離畫面 |
| R2-1 foundation／API／管理入口 UI | PASS | 本 worktree 執行 `test:learning-foundation`、`test:learning-foundation-api`、`test:learning-foundation-ui` |
| R2-2 工作空間／深連結／未保存 browser back | PASS | 本次 `test:practice-workspaces`；紀錄入口 assertion 更新為本包独立正文頁，沒有拿掉行為驗證 |
| weekly／english-images／capture-exploration／html-entity-overflow | PASS | 本次各現有 script |
| TypeScript、lint | PASS | typegen + tsc；eslint 0 errors，既有 plurk img warning 1 筆 |
| production build、diff check | PASS | 標準 `npm run build`、`git diff --check`，未跑含 LINE 副作用的 start |
| 真實隔離 Notion | SKIPPED | 缺可配置隔離 token、data source、owner/schema；固定正式 DB14 未代測 |
| Railway runtime／volume | SKIPPED | 本包明確禁止部署；不宣稱 runtime／持久化已驗證 |
| iPhone Safari／原生鍵盤／真實 safe area | SKIPPED | 無實機；Chromium viewport／CSS 測試不替代實機 |

首次 UI failure 是 select 的 accessible label 包含 option 文字，已增加明確 aria-label；R2-2 一項 assertion 指向被本包取代的旧快加彈窗，已改驗證真正新紀錄頁並重跑通過。一次全 repo tsc 指出 parent union 的 closure narrowing，修正後 TypeScript／build 重跑。上述首次失敗不列 final PASS；final 結果是重跑版本。

## 遠端交付觸發界線

沿用 R2-2 文件的唯讀證據：production source master；preview-pr-27 中兩服務分別 source `codex/xingguang-formal-integration`、`codex/knowledge-claims-foundation`。均不是本包新分支。
PR Environments OFF 沿用使用者已提供的設定證據。沒有登入 Railway、使用 preview writer、變更 autodeploy、建立正式資源或觸發部署操作；這不是本次重新執行 Railway runtime audit。

CODE：完成。ISOLATED TESTS：完成。PR：獨立 stacked Draft。PRODUCTION：未合併／未部署／無正式驗收寫入。

後續收緊：actual daily GET→PUT 可保存且保留 output，stale 每日／週盤 PUT 拒絕；flow progress 共用鎖及 reentrant activity writer 已測，背景 snapshot 不改 manual ledger。來源網址編輯保留既有 sourceRefs，UI 已測；event retry 按鈕只更新投影，不再建立正文。事件 GET 衍生 current bindingStatus，removed target 顯示未連結且不修改歷史 applied 事實。

通用外站 completion receiver／withdraw 補償 API 不在本包，契約已定義語意供 R2-5 使用。實機／真實隔離 Notion／正式 runtime 未完成，保持 SKIPPED。

## 本包修改檔案

```text
app/api/dojo/bingo/route.ts
app/api/dojo/daily/route.ts
app/api/dojo/english-journal/route.ts
app/api/dojo/flow/route.ts
app/api/dojo/learning/records/route.ts
app/api/dojo/practice-events/route.ts
app/components/EnglishJournalWorkbench.tsx
app/components/JournalTargetPicker.tsx
app/components/LearningRecordWorkspace.tsx
app/components/PracticeEventHistory.tsx
app/components/PracticeHome.tsx
app/components/PracticeLearning.tsx
app/components/PracticeWorkspace.tsx
app/globals.css
docs/R2-3-learning-records-events.md
docs/evidence/r2-3/history-430.png
docs/evidence/r2-3/record-375.png
docs/evidence/r2-3/record-390.png
docs/evidence/r2-3/record-430.png
docs/fixtures/r2-3/event-v1.json
docs/r2-practice-event-contract-v1.md
lib/dojo/englishJournal.ts
lib/dojo/formal.ts
lib/dojo/learningFoundation/practiceWrite.ts
lib/dojo/learningRecords/model.ts
lib/dojo/learningRecords/service.ts
lib/dojo/learningRecords/store.ts
lib/dojo/learningStore.ts
lib/dojo/notionStore.ts
lib/dojo/practiceEvents/compatibility.ts
lib/dojo/practiceEvents/journal.ts
lib/dojo/practiceEvents/model.ts
lib/dojo/practiceEvents/projection.ts
lib/dojo/practiceEvents/service.ts
lib/dojo/practiceEvents/store.ts
lib/dojo/practiceNavigation.ts
lib/notion/queries.ts
package.json
scripts/test-learning-records.mjs
scripts/test-practice-events.mjs
scripts/test-practice-workspaces.mjs
scripts/test-r2-3-api.mjs
scripts/test-r2-3-ui.mjs
tests/learning-records.test.ts
tests/practice-events.test.ts
```
