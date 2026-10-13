# 語境修習成果回流道場：發布前設計
日期：2026-10-08。狀態：待使用者審閱；本文件不是已實作／已發布聲明。

## 使用目標
使用者能持續完成語境修習室素材卡，並在道場既有修習歷程看到有效完成成果、原卡入口與來源日期。同一個 Session 不因重送、修訂、API／Notion 渠道或多學科引用重複增加次數。
沿用 Context Room PR24 與 Dojo PR79；不另建一套主紀錄、不重做素材系統、不接 VF／CEFR、備份頁或其他學科功能。

## 本次具體取捨
1. Context Room 的有效 Practice Session 是權威完成來源。建立素材、規劃、筆記、派送單字不算修習完成。
2. 擴充既有 Practice Event 接受 context-room / practice-session / Session UUID；沿用 server owner 加來源三元組的穩定事件身分。completionKind=context-room-session、quantity=1、unit=次。
3. 完整且驗證通過的 Session 建立一筆事件及既有 Learning Record 的來源摘要／原卡連結，並在歷程顯示。不複製回答全文，不以來源收據取代主紀錄。
4. 同一來源更新同一事件與來源紀錄。另一個 Session UUID 才是另一筆修習。API 為版本與狀態權威；Notion 同 UUID 只作渠道對照，不降級新版內容。
5. 保留 practicedOn、occurredAt 與 dateSemantics。匯入日期明示為來源保存／匯入日期，不冒稱實際練習日；未知日期／時區保留 null。日期未知可保留完成事件與總次數，但不歸入任意一天。既有 Dojo 日記日期驗證維持原規則。
6. 封存及明確刪除來源保留已驗證歷史；刪除後原卡連結失效。withdrawn 或 unverified 更新同一事件、排除有效完成統計，保留可查歷史與原因。503、逾時、單頁未出現均不撤回。
7. 本次完成歷程與有效次數，不自動增加光步、不自動完成週盤格、不重置手動成果。未連結保持可見狀態；未來綁定與模式對應另按既有規則決定。
8. 沿用現有「刷新來源成果」明確同步入口，每次一頁、可續跑、定期完整對帳。頁面 GET 唯讀，不在背景建立事件，不新增自動排程。
9. 舊收據須完成有界、可恢復的完整對帳才啟用計次；已有 Session ID 的事件／正文或 legacy receipt 必須精確核對。身分、舊結果或未知寫入衝突時，該筆保持待核對，不自動重送或按名稱合併。

## 實作順序及檔案責任
- Context Room：沿用 PR24 的 completion、results query、0016 migration 與來源頁。先跑隔離原生 PostgreSQL 官方 migration 和 reader／trigger 測試。
- Dojo：先核對 R2-1／R2-2／R2-3 最新成果與正式 master 差異，再以正常 merge 保留所有已完成修正。發布依序滿足 PR72／75／76；不能直接合併 PR79 取代前置驗收。
- lib/dojo/practiceEvents 與 learningRecords：擴充外部事件與來源紀錄、日期／狀態契約及有效統計，保留日記行为。
- lib/dojo/externalResults：把驗證通過的來源收據轉成既有事件／正文，保存待補投影與逐筆進度，核對歷史身分。
- app/api/dojo/external-results 與既有歷程 UI：同步／重試成功可見，原日期、狀態與來源入口可見；離線保留既有資料。
- 不新增 Notion property、database 或另一套正文；既有持久 POSIX lock、fsynced identity intent 和未知結果停止規則維持。

## 驗證與發布條件
- 原生 PostgreSQL：官方 migration 全鏈、五模式完成門檻、跨 owner、快速重說依賴、分頁／微秒版本、撤回／刪除／rollback、GET 無寫入。
- Dojo 實際 handler／持久 store：兩 Session 產生兩次；同 UUID API／Notion／重試／重啟／版本更新只一次；正文或事件部分成功僅補未完成步驟；未知 create 禁止重送。
- 日期與狀態：來源保存日期標示、null 日期／時區、封存保留、撤回停止有效計数、503 不刪除。
- UI：375／390px 預覽歷程、刷新與續頁、reload／返回、錯誤保留來源、有效統計與原卡入口。
- 對受影響版本跑測試、型別檢查、lint、正式建置與審查；保留最新正式的短例句和其他變更。
- 道場持久 volume／鎖與舊 writer 交接須有實際 runtime 證據；語境修習室正式部署管道及 migration 結果須可核對。
- 發布後只建立可辨識的一組測試素材／Session，驗證來源完成、道場接收、重送無重複、刷新後保存。回報實際 ID／SHA／部署版本。不得以 mock 或 SKIP 宣稱正式通過。

## 已核對的阻礙
- 2026-10-08：PR24 尚未合併，head f508f7533ad7b1e8f7e69b9f81377ce1fcb0015c。
- PR79 head a4a47b19969349488591d07a2349a70bfba176b3；eventId 固定 null、acceptance 固定 needs_review，尚不能計次。
- 正式 Dojo master 49bcc461ce29dbd9f5ea1ca8dcc8aaefa3b6c943，短例句已上線；本次核對前工作區無未提交修改。
- 隔離 Railway context-r25a-gate-20261006 的 PostgreSQL／runner 仍是 staged-create，無 deployment、無原生測試結果，不能沿用為 PASS。
- 語境修習室正式部署不在本次可見的 Railway 專案清單中；須定位既有部署管道，不能假稱已發布，不要求使用者登入 Railway。

## 審閱門檻
使用者需確認本次上述日期、生命週期及「只計歷程／次數、光步與週盤不自動增加」的設計後，才實作跨站契約變更。程式、隔離原生測試及持久性驗收完成後，依既有授權進行合併／部署；遇平台阻礙先保存並回報。
