# 寫作修習室原文讀取

`GET /api/integrations/context-room/writing-sources` 以既有 `LUMEN_CONTEXT_ROOM_SYNC_SECRET` 驗證語境修習室伺服器，只讀 Dojo 自己的 DB-14 今日及 DB-18 七題日記。不接受任意資料源或網址；頁面預覽核對 parent、日期與刪除狀態。回應 private/no-store，無寫入、完成事件或新儲存欄位。

讀取介面與語境修習室 `lib/writing/journal-reader.mjs` 同一版本；本次逐字複用其已測試的 Notion 解析／分頁／隔離邏輯，token 由 Dojo 既有 `NOTION_TOKEN` 提供。寫作伺服器透過既有 Dojo 來源網址與整合密鑰連線，不把原始 Notion token 傳給瀏覽器或另一服務。

Dojo 今日、週盤、原始日記與介面皆不需調整。部署必須保持正式服務的版本鎖定，只將 production 的 pinned SHA 更新至本次合併；不要更動預覽環境、磁碟或啟動備份指令。
