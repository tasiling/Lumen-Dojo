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
