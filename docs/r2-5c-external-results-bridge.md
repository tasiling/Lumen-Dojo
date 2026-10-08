# R2-5C 語境修習成果回流

本包在既有來源收據、完成事件及學習正文上接入已核准的 Context Room Session 分支。
同一 Session 更新原事件，另一 UUID 才新增；來源正文僅保存模式摘要與來源指標，不複製完整答案。
VF 不在本包成果回流範圍。**尚未合併或部署；正式驗收未執行。**

## 已實作

- 固定 Context Room origin、server Bearer/owner，保留原來源契約驗證及微秒游標。
- Context 外部事件 quantity=1/unit=次，唯一 learningRecordId；事件先存再投影正文。
- practicedOn/occurredAt/timeZone 未知保留 null；日期可為原匯入日，不以道場保存日冒充練習日。
- 已完成、撤回、證據不足、封存與來源刪除分開處理；恢复更新同事件。
- 外部正文可在未知日期、尚未連結學科時保存自己的筆記；來源 metadata 更新保留後續筆記與學科關聯。
- 同快照投影中断可補完原正文，cursor 不跨過待補進度；未知 mutation 保留共用 mutex/intent，禁止盲重送。
- 舊收據逐 Session 有界分頁查核，每次最多100筆並保存 cursor；已计次關聯、無穩定來源 ID 保留待核對。
- 歷程顯示已接收／待核對／撤回／證據不足、原日期及查看來源／正文入口；只顯示已載入範圍統計。
- GET/load/reload/back 唯讀。光步、週盤不自動投影，Notion 不新增 ack。

## 保留版本及前置條件

原分支 `codex/r2-5c-external-results-bridge`／PR79，沒有 reset／force-push／新 PR。
已正常合入主線49bcc461（已部署的遊戲短例句）與 R2-3 最新8400a6bf，保留銀行、影像派送與 Unit arrangement 成果。
前置 PR72/75/76、Context Room PR24 尚未合併。完整原生 PostgreSQL 與道場持久 writer 切換證據未通過，不盲合併。

## 隔離驗證與發布證據

本次實際命令／首次失败／修正／最后結果見 `docs/evidence/context-results-2026-10-08/verification.md`。
Notion 測試使用隔離磁碟 provider fixture；Chromium 使用本機 Next 與隔離 HTTP fixture。
這些不是正式 Notion、原生 PostgreSQL、iPhone Safari 或正式跨站驗收。

具體發布門檻：原生來源 migrations/reader 實測、單 writer 舊作業排空、真持久 volume/mount/lock、兩次 deployment persistence probe、exact reviewed merge SHA。
正式環境沒有 volume，因此不能用 /tmp 或跳過鎖完成部署。
既存 maintenance staged patch 保留不套用，須核對最新 SHA。

## 恢復與使用

來源未接入／暫時不可用要保留既有快取與本地修習。使用者明確刷新、完整對帳或續頁，不提供背景批量重製。
正文投影已確認才顯示已接收；未知結果要依實際 intent／來源收據／Notion 結果核對，不刪鎖、無 TTL 解鎖。
來源 link 只允許固定 origin 的 `/practice-results/{UUID}`；刪除後不能開啟來源。
legacy 缺 ID 或已有活動計次時需人工精確對帳，不按標題配對或重複計次。
