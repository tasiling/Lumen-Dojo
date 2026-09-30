# PR #72 合併前寫入鎖收尾

核對日期：2026-09-30。只補 R2-1，沿用 `codex/r2-1-learning-foundation` 與 PR #72。

- Base `master`：`06adf98cd38af82047b3986ca39fd590680fc037`。
- 收尾前遠端 Head：`2452378cf3bb43e77cdcd0bd5052e609efa48e15`，開始與追加前 fetch 均相同，沒有退回舊成果。
- 收尾後 Head：見 PR description 完整 SHA（本文件與程式一起提交）。
- 不合併、不部署、不 force-push；未更動 Railway 設定、正式資源或正式 Notion，未更動週盤設定與授權檢查。

## 程式交付與錯誤分類

共同鎖以原本的 POSIX `mkdir` 保持跨程序互斥。AsyncLocalStorage 僅保存本次操作的 request 證據，**不是記憶體 mutex，也不是跨程序 transaction**。每次 SDK mutation dispatch 計數，成功 resolve 記為已確認；多步驟操作累計所有 request，不只最後一筆。

| 類別 | 證據 | 處理 |
| --- | --- | --- |
| A 尚未派送 | SDK mutation dispatch 計數為零，包括 rows／owner／JSON preflight 讀取失敗 | 回報 503 讀取／驗證失敗並釋放 mutex；原有無效輸入／版本衝突保留 400／409 |
| B 結果已確認 | 所有已派送 request 成功；或 SDK 實際 HTTP error response 的 status、code、body、request_id 匹配明確拒絕 | 釋放 mutex；保留已成功的部分；回報失敗或既有部分完成提示，重新讀取後再操作 |
| C 結果不明 | timeout、失去 response、5xx、409 provider conflict 或不完整證據 | 回 503 並保留 mutex／seed intent；後續 writer 回 409；不重送 create |

明確拒絕僅接受 Notion 的 400 invalid_json／invalid_request_url／invalid_request／validation_error、401 unauthorized、403 restricted_resource、404 object_not_found、429 rate_limited，並要求實際 SDK response 與 protocol 欄位一致。不以 Error 名稱或任意 `.status` 推定副作用。SDK 內部的本地錯誤如無明確證據，亦保守列 C；沒有把所有 Error 都視為遠端失敗。

SDK mutation 方法的追蹤涵蓋 pages.create／update 與 blocks.update／delete／children.append，讀取方法不計為寫入。共同鎖 scope 關閉 SDK 與應用層重試（讀取亦只嘗試一次）；scope 外的舊流程維持原行為。呼叫端即使吞掉 trace error，鎖層仍檢查未確認 request，不能回成功或繼續派送。

seed intent 在實際 create 前仍以 `wx`、檔案與目錄 fsync 保存。只有自己本次建立的 intent，且沒有派送或全部派送有明確拒絕證據，才安全清除；成功與不明結果保留 intent。既存 intent 不自動刪除。部分成功透過原 seedKey 重用，不改 revision、owner、ID、未知歷史關聯保護。

Notion 仍沒有 unique constraint／原子 CAS。所有相關 writer 同版且共享持久 POSIX 目錄時，鎖內重讀與 revision 比較防止 stale 表單覆蓋；多筆初始化仍可能部分成功。程序崩潰的鎖仍需人工核對，不因重啟或 TTL 失效。

## 行為重現與隔離驗收

`scripts/test-learning-foundation-api.mjs` 執行真實 route、foundation service／store、legacy editor、capture updater、activity writer、entries POST／PATCH；Notion IO 注入隔離記憶體資料。另執行真實 JSON adapter preflight、真實 Notion client 與 SDK，僅替換 fetch，不使用遠端憑證。不是字串比對，也不是 live Notion 驗收。

| 零寫入讀取失敗重現 | 第一次 | 第二次 | 寫入數 | mutex |
| --- | --- | --- | --- | --- |
| 修正前原 Head | 503 | 409 | 0 | 殘留，assertion FAIL |
| 修正後 | 503 | 201 | 第一筆失敗 0、重試成功 1 | 第一筆即釋放、重試後亦無鎖 |

已驗證：

1. 鎖內 rows 讀取失敗後可重試；共用鎖的五個既有流程讀取失敗亦不持續封鎖。
2. 無效輸入／stale revision 不寫入，資料逐筆不變；JSON adapter 的更新前讀取失敗不算寫入。
3. 成功保存並釋放；SDK transport 成功只發一次。
4. response 遺失只派送一次；即使是 LearningError 或被吞掉，仍留鎖、阻擋下一筆。
5. 初始化兩筆已確認、後續讀取失敗：釋放 mutex，重試後九筆且只有九次 create。
6. 初始化第三笔已保存但 response 遺失：保留前兩筆與第三筆，mutex／intent 阻止重建；模擬暫時不可見後 intent 仍擋 create；隔離人工核對原筆後重用，最终九筆／九次 create。
7. capture、activity、entries PATCH 及 POST 的 caught trace error 均驗證不明結果不可繞過。
8. 跨程序鎖、舊欄位、owner／跨來源頁面驗證、GET 零寫入與手機 UI 回歸仍通過。

測試中的人工移除 mutex／隱藏資料只對 `mkdtemp` 隔離目錄與記憶體資料執行，不是正式恢復腳本。

| 本次檢查 | 結果 | 備註 |
| --- | --- | --- |
| test:learning-foundation | PASS | lifecycle、跨程序、seed intent、歷史關聯 |
| test:learning-foundation-api | PASS | 含上述重現、共用流程、真實 SDK injected-fetch |
| test:weekly | PASS | 本次重新執行 |
| test:capture-exploration | PASS | 本次重新執行 |
| test:english-images | PASS | 本次重新執行 |
| test:html-entity-overflow | PASS | 本次重新執行 |
| npx tsc --noEmit | PASS | 無型別錯誤 |
| npm run lint | PASS | 0 error；app/plurk/page.tsx:46 既有 img warning |
| npm run build | PASS | Next 16.2.10 本機 production build，未部署 |
| git diff --check | PASS | 無 whitespace error |
| test:learning-foundation-ui | PASS | Chromium 隔離 API，375／390／430px、長中英文、Tab／焦點、CSS safe area、輸入保存、返回／重新整理；無 browser runtime error |
| 修正前重現 assertion | FAIL（預期） | 原 Head 503→409，證實 bug；修正後通過 |
| 真實 Notion integration | SKIPPED | 缺隔離 token、隔離 data-source ID 與其頁面／schema／owner 對照；目前 DB14 固定正式 ID，僅換 token 不足以隔離 |
| iPhone Safari 實機 | SKIPPED | 無實機；原生鍵盤、底部安全區、輸入保存、返回／重新整理需另驗收；Chromium emulation 不代表 Safari 通過 |

## 正式部署條件：尚未具備

Railway 唯讀核對來源：list-services、get-service-config、get-status、list-variables（值由工具遮蔽）、list-deployments。未呼叫任何 mutation。沒有以 `/tmp` 或測試目錄宣稱正式持久化。

| writer | 分支／最新部署 | replica 設定 | LEARNING_WRITE_LOCK_DIR | volume／mount |
| --- | --- | --- | --- | --- |
| production / Lumen-Dojo | master，06adf98，2026-09-24 SUCCESS | us-west2 ×1 | rendered variable 名稱中缺少 | status volumes=[]；無 mount path |
| preview-pr-27 / Lumen-Dojo | codex/xingguang-formal-integration，2026-09-01 SUCCESS | us-west2 ×1 | 缺少 | volumes=[] |
| preview-pr-27 / Lumen-Dojo-pr-46 | codex/knowledge-claims-foundation，16308db，2026-09-14 SUCCESS | us-west2 ×1 | 缺少 | volumes=[] |

三者皆存在 NOTION_TOKEN 名稱，但 OAuth 工具遮蔽值，不能核對 token 是否相同或各自實際权限。三個配置分支的 schema 都指向相同 DB14 `6b2ff51d-2e10-4cde-b9ea-4644702846fa`；仍有舊版 preview writer 並行的部署風險，不能當成隔離測試服務。尚未完成對各已部署 artifact 與 token 權限的逐筆驗證。

master source 仍連接 GitHub repo／master，checkSuites=false，最近部署符合 master 更新；工具沒有獨立 auto-deploy enabled flag，故**自動部署是否被另行停用仍未確證**。合併前需確認實際自動部署狀態與維護窗口，不能假設 merge 不會部署。

最低正式需求（只列需求，未建立／設定）：

- 一個持久 POSIX volume，已確認實際 mount path，再設定絕對路徑 LEARNING_WRITE_LOCK_DIR；驗證 atomic mkdir、wx、fsync、重啟後仍保存 mutex／intent。
- 每個同 owner writer 必須同版並共享同一檔案系統；最小可行為單一 replica／單一 writer。獨立 Railway volume 不能冒稱跨服務共享；增加 replica 前須另證共享拓撲。
- 停止或隔離舊版／preview／外部同 DB14 writer，確認新舊切換沒有並行期間；尚未執行。
- 唯讀確認 master 自動部署開關，安排明確核准的切換。新增正式資源與設定需另獲使用者授權。

缺鎖目錄的實際影響：新底座 initialize／create／edit 與既有 `/api/dojo/learning` PATCH 會回 503；素材／entries 新增或變更穩定學習 ID 關聯會拒絕。舊素材 updater、週盤 activity writer、未帶新關聯的 entries POST／PATCH 在完全未設定時仍走既有 fallback，**並非所有舊功能都停寫**。若有設定但鎖忙碌／結果不明，這些共用流程亦拒絕寫入；週盤僅重試鎖取得，不重送 Notion request。GET 照常可讀。

## 本次異動與回復

本次檔案：`fileLock.ts`、新增 `writeOutcome.ts`、`seedWrite.ts`、`lib/notion/client.ts`、API adapter 測試、domain 測試、本文件與原交付文件，共八個檔案。service／store 資料架構與授權檢查重用，沒有再建學習模型。

資料仍落在原 DB14 的逐 entity JSON；schema 不變，無 migration／正式初始化。控制資料仍是一個 mutex 與至多九個 seed intent。回復需停止所有 writer 並核對已確認／不明 request、Notion 與 intent，再決定版本回退；單純回退到本次之前的程式會重新帶回零寫入讀取失敗留鎖的 bug，不是修復方式。不得任意刪鎖或以重啟／TTL 當恢復。

程式與隔離行為驗收已交付；真實 Notion、正式持久掛載／writer 切換／auto-deploy 確證、iPhone 實機仍未完成。完成本次提交後停止，等待另外授權合併與部署，不接續 R2-2。
