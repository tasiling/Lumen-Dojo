# Source Handoff v2：野採派送端

本文件記錄 D-2 在 `Lumen-Dojo` 的派送行為。正式接收契約仍以語境修習室的 `docs/source-handoff-v2.md` 為準。

## 使用流程

英文影像匣的「語境修習室派送」會先以 Bearer 驗證查詢 v2 capability。確認接收端支援 `context-room-source-handoff/v2` 後，使用者可以：

1. 建立新 Learning Project 與新 Learning Unit。
2. 選擇既有 Project，再建立新 Unit。
3. 選擇既有 Project 與既有 Unit。
4. 使用新的派送意圖，將同一 Source Item 關聯到同 Project 的另一 Unit。

若 capability 不支援 v2，介面只保留 v1 的「新／既有 Project＋新 Batch」流程，不顯示既有 Unit 選項。401 或 403 不會降級，避免把密鑰錯誤誤判成舊接收端。

## 身分、指紋與版本

- 一筆 `EnglishImageEntry` 對應一筆 Source Item；`attachments[]` 是同一來源內的有序附件。
- Source Item 身分由接收端使用 owner、`source.system` 與 `source.recordId` 判定，不使用標題。
- `requestFingerprint` 使用與接收端相同的 canonical JSON：物件鍵排序、陣列順序保留、移除 undefined，再以 SHA-256 計算。
- `source.contentFingerprint` 涵蓋來源欄位、文字內容與附件清單。
- 只有上述來源內容改變才增加 `source.revision`；重新整理頁面不增加版本。
- timeout 或 Response 遺失會留下 `unknown` 狀態；相同目的地與內容重試會沿用原 `dispatchId` 與 request fingerprint。
- 將同一來源加入另一 Unit 會建立新的 `dispatchId`，但保留同一來源永久 ID。

## 多目的地相容

`contextRoomLinks[]` 保存每個目的地的 Project、Unit、Source Item、link、dispatch、狀態與接收結果。既有 `contextRoomExport`、`materialId`、`batchId` 仍作為最近一次成功派送的相容投影。舊紀錄沒有 links 時仍正常顯示，不會在頁面載入時回填。

## 圖片來源 API

語境修習室只保存穩定附件參照，不保存 Notion 的短效 file URL。伺服器端端點：

`GET /api/integrations/context-room/images/{entryId}/{attachmentId}`

要求 `Authorization: Bearer <LUMEN_SOURCE_IMAGE_PROXY_SECRET>`。端點會驗證 Entry 與附件歸屬，再由伺服器即時解析 Notion block、限制圖片 MIME 與 20 MB 大小；瀏覽器不會取得 Notion Token 或跨站 Secret。

## Railway 設定

Lumen-Dojo 需設定：

- `CONTEXT_ROOM_INTEGRATION_URL`：語境修習室服務 base URL。
- `LUMEN_CONTEXT_ROOM_SYNC_SECRET`：既有派送／capability Bearer secret。
- `LUMEN_SOURCE_IMAGE_PROXY_SECRET`：D-2 圖片 server-to-server secret；兩端設定相同值，只能放在伺服器環境。

不要把 Secret 放入 `NEXT_PUBLIC_*`、瀏覽器 storage、網址參數或對話內容。

## 部署與回復

安全順序：

1. 先部署語境修習室 D-2（保持 v1、v2 接收相容）。
2. 設定兩端圖片代理環境變數，確認 capability 的 `imageProxyReady` 為 true。
3. 再部署 Lumen-Dojo D-2。
4. 先以 staging／隔離資料完成 v2 三種模式與圖片讀取驗收，再進行正式使用。

若需回復，先回復 Lumen-Dojo 派送端，使新派送停止；語境修習室可保留相容接收與已保存的 Source Item。D-2 沒有歷史 backfill，也不需刪除既有 links。

## 手機驗收

- iPhone Safari 可切換新／既有 Project 與新／既有 Unit，無橫向溢出。
- 已封存 Unit 顯示但不可選；Unit 學習目標顯示為摘要。
- 跨類型 Project 必須勾選確認後才可派送。
- 23 張圖片仍顯示為一份素材；派送後可看見多個目的地。
- 模擬 timeout 後，再次操作會安全重試同一派送意圖。

## 尚待正式環境驗證

- D-1 正式 capability Bearer 驗證。
- 真實 PostgreSQL 的 v2 寫入與 receipt/revision 逐欄驗收。
- Railway 兩端 Secret 設定後的真實圖片串流、逾時與大小限制。
- iPhone Safari 實機操作。

