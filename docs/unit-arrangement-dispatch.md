# D-3.7 GPT-assisted Unit Arrangement

這個流程是野採英文影像匣的可選批次入口。它不取代原本逐筆派送，也不建立另一套 Project、Unit、Source Item 或修習紀錄。

## 使用流程

1. 在英文影像匣勾選最多 20 筆素材，或由單筆開始後加入其他素材。
2. 從語境修習室 Handoff v2 capability 回傳的正式目錄選擇一個未封存 `learning_project`。
3. 選擇摘要或必要英文全文，填入編排意圖，產生外部 GPT 生成包。
4. 將 `context-room-unit-arrangement/v1` 結果貼回，逐組預覽、改名、改選既有 Unit、移動素材或保留待確認。
5. 確認後，野採保存 approved snapshot、每筆固定 dispatch ID 與 fingerprint。
6. 新 Unit group 先呼叫接收端 `ensure-unit` 一次；取得穩定 Unit UUID 後，各 EnglishImageEntry 分別以 Handoff v2 `unitMode=existing` 派送。
7. 每筆結果獨立保存；失敗或結果未知只重試必要項目，已成功項目不重送。

## 身分與信任邊界

| 資料 | 正式身分 | 建立者 |
|---|---|---|
| 編排包 | `packId` + `snapshotHash` | 野採伺服器 |
| 提案分組 | `groupRef`（只在提案內有效） | GPT 建議、後端驗證 |
| Learning Unit | Context Room UUID | 接收端 `ensure-unit` |
| 原始素材 | EnglishImageEntry `recordId` | 野採既有資料 |
| Source Item | owner + source system + permanent record ID | Handoff v2 接收端 |
| 派送嘗試 | 固定 `dispatchId` + canonical request fingerprint | 野採伺服器 |

GPT 不產生 UUID、dispatch ID、fingerprint、owner、Secret 或服務 URL。貼回內容只決定候選分組，正式派送內容一律來自伺服器保存的來源快照。

## 多來源共用一個新 Unit

三份來源安排至新 Unit 時，不會送出三次 `unitMode=create`。接收端使用 owner + arrangement ID + group reference 的持久映射，在一個 PostgreSQL transaction 內建立：

- 一個 `material_batches` Unit；
- 五個 pending topic placeholders；
- 一筆編排 Unit mapping；
- 每個來源的併發保留紀錄。

回應遺失後，以相同 ensure request 重試會取回同一 Unit UUID。之後三份來源個別走 Handoff v2，因此仍是三個 Source Items，而不是合併素材。

## 快照、部分成功與恢復

- 生成包、GPT 原始結果、人工編輯結果、approved snapshot、group→Unit 映射、固定 dispatch/fingerprint 與每筆結果保存在既有 Notion JSON repository。
- 確認前會重算來源 content fingerprint，並重新核對 Project 與既有 Unit。
- 派送更新採欄位式 updater，只修改本次 integration 欄位，不會把期間新增的文字、附件或其他目的地覆蓋回舊版本。
- timeout／Response 遺失標記為 `unknown`；安全重試沿用原 payload、dispatch ID 與 fingerprint。
- 關閉頁面或服務重啟後，可從「繼續尚未完成的編排」取回紀錄。
- 取消只停止尚未開始項目，不刪除成功結果。

## 容量與圖片限制

- 每次最多 20 筆素材，Unit 目錄最多提供 100 筆；截斷或不完整會寫入生成包警告。
- 預設只提供摘要；使用者明確選取才包含英文原文，單筆上限 12,000 字元並標示截斷。
- 生成包不含 Secret、Cookie、Notion token、短效圖片 URL。
- GPT 沒有收到原圖；正式派送仍保留全部附件與原文。一組 23 張附件仍是一個 Source Item。

## 部署與停用

1. 先部署 Context Room，執行 additive migration `0014_unit_arrangement_units.sql`。
2. 用 Bearer capability 確認 `supportsUnitArrangement` 與 `supportsEnsureUnit` 為 `true`。
3. 再部署 Lumen-Dojo。介面只在兩項 capability 都成立時啟用；授權失敗或能力不足不會暗中降級成逐筆建立 Unit。

回復時先回復／停用 Dojo 新入口，再回復 Context Room 程式。映射表可以保留，不需要 backfill，也不影響 Handoff v1/v2 或手動單筆派送。

## iPhone 驗收

- 多選素材、加入其他素材與 Project 選擇不橫向溢出。
- 跨類型目標須明確勾選確認。
- Preview 以 Unit group 與素材名稱呈現，無須編輯 JSON。
- 取消一組後素材會回到待確認；空組不會建立 Unit。
- 結果頁能辨識成功、失敗、未知、略過，並只重試失敗／未知項目。
