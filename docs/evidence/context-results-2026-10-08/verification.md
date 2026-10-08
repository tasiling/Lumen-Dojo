# 語境成果回流驗證：2026-10-08

**程式已保存；未合併／未部署。正式跨站驗收尚未執行。**

## 版本

- 保留 Dojo master49bcc461ce29dbd9f5ea1ca8dcc8aaefa3b6c943（PR82遊戲短例句），正常 merge 最新前置 R2-3 8400a6bf7169b7ed8dad3c57cfbf587a739c591f；原PR79／分支不變，未 reset／force-push。
- 第一個推送 checkpoint914f383ffb48396e363eab9788744cb49cae50c6。
- 獨立唯讀審查範圍17cd7b88764b96368f534414e4e041d4c080fa2a..ff472e47f87c25e2bf293f584960f8ca73e043a2，四項 Important，沒有 Critical；同一修正階段完成回歸。
- 最終修正 commit 以包含本文的 branch/PR HEAD 為準，確切推送 SHA 回報於PR79與本輪文字。

## 最後結果

| 命令 | 結果／實際範圍 |
| --- | --- |
| test:practice-events | PASS；穩定UUID、撤回／恢復、來源日期、首次正文新狀態、不更動光步週盤 |
| test:learning-records | PASS；手動學科／日期要求、外部null編輯、来源指標與保存日期不可偽改、181列分页 |
| test:external-results | PASS；真正eventService + bridge；body/receipt/checkpoint确认失敗與新service續跑1事件1正文；legacy101、无ID、新版及升級查核證據 |
| test:r2-5c-api | PASS；实际handler/store，隔離磁碟Notion transport；来源去重、保留筆記、無日期排序、GET唯讀、未知結果鎖/intent |
| test:r2-3-api | PASS；實際既有journal/record/event handlers與隔離provider，event first、拒stale、只补投影 |
| test:r2-5c-ui | PASS；375/390/430px，正式建置產物＋隔離HTTP；同頁同步新增event/body、撤回有效次數1→0、來源入口、離線保留、GET唯讀 |
| test:r2-3-ui | PASS；375/390/430px，正式建置產物＋隔離HTTP；既有正文流程与未連學科／null日期的來源正文編輯、保存／reload |
| test:practice-workspaces | PASS；同一正式產物＋隔離HTTP，三寬度、九學科、返回、未保存保護、auth、錯誤可見 |
| test:learning-foundation、test:learning-foundation-api | PASS；既有底座與SDK write/lock錯誤證據 |
| test:weekly、test:english-images、test:image-routing、test:unit-arrangement | PASS；保留主線相關行為 |
| next typegen、tsc --noEmit | PASS |
| lint | PASS；0 error，既有Plurk img warning1 |
| build | PASS；Next16.2.10最佳化build，未部署 |
| git diff --check | PASS |

每個最後命令的 stdout/stderr 保存在同目錄 `final-*.log`。模型/handler的Notion IO為隔離fixture，不是正式Notion驗收。
UI用現有headless Chromium1194；runtime套件與已安裝browser版本透過明確executablePath配對。
正式產物測試仍是本機，不等同正式部署或iPhone Safari。

## 首次失敗與修正證據

- v2丢失無ID舊收據guard：review-legacy-red.log；versioned完整scan證據跨revision保留。
- pre-upgrade receipt跳過scan：review-old-proof-red.log；未具當前證據必須重掃，舊checkpoint强制有界admission replay。
- 首次正文版本1而事件已deleted-v2：review-body-red.log；初建与更新共用權威來源metadata投影。
- 日期未知title `unknown`排在dated之前：review-undated-red.log；改`0-undated`非日期group，practicedOn仍null。
- 同頁同步main count仍旧值：review-history-red.log；成功mutation通知 owning event/record GET刷新。
- recordedOn可被PATCH：review-record-date-red.log；外部正文保存日不可改。
- 最初UI缺「已接收」：ui-red.log；補上有效／待核對／撤回、来源正文入口。
- dev rerun出现cache/read超時（r2-3-ui-fixed.log），同一套测试改用实际最佳化build後通过；未把失败当PASS，也未修改其他導航功能。

## 發布實際狀態與阻礙

1. 原生PostgreSQL test deployment回覆：`Cancelled — the user did not approve this action. No changes were made.` 沒有取得原生migration/reader PASS。本機只有root UID mapping，缺可用原生Postgres。
2. 取消的隔離draft服務r25a-test-runner與r25a-postgres已從staged patch撤回；再次get-staged-changes為null，沒有測試部署或volume。
3. 道場正式service仍無volume。舊writer排空、真mount/fsync/lock與兩次deployment持久性未驗證；既存production maintenance draft保留不apply。
4. 已唯讀定位Context Room既有正式管道：Ingenious-cat project53ba7d3e、production dc230a7b、service726e333d；main正式SHA80de4dcf59cf4d13844fe2dbc38ec9d1f81b7955，deployment407d064a-c1dc-414f-8f6b-a3ae4c15326a SUCCESS。來源PR24未合併部署。
5. 道場正式SHA49bcc461ce29dbd9f5ea1ca8dcc8aaefa3b6c943，deployment755a8a9a-2fc4-424c-b404-2c2abab5a9f8 SUCCESS；本批回流沒有部署。
6. 沒有建立正式測試素材／Session，不提供假驗收ID；正式cross-site、native PG、真Notion及iPhone Safari仍未驗收。

## 本次判定與保留範圍

完整執行ledger見execution-ledger.md。採每Session100筆有界查核，未另建global legacy index；代價是重复扫描與有歧義歷史需人工對帳。
依原授權保留其他主線功能與腳本；不接續VF成果回流、CEFR、備份頁、自动光步／週盤、全站總數或未来關聯传播。
發布先决条件仍未具備，不能把隔離測試、build或Git推送表示為已上線。
