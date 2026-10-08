# 語境修習成果回流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 有效 Context Room Session 回到道場既有歷程並按穩定來源計次，保留原卡、日期與生命週期。
**Architecture:** 沿用 PR24 reader、PR79 receipt/checkpoint 與 R2-3 event/record，增加已核准的外部事件分支。事件先保存、來源正文再投影；同 UUID 更新原事件，來源收據記錄可恢復的進度。同期不投影光步或週盤。
**Tech Stack:** Node >=20.9.0、Next 16.2.10、TypeScript、Notion DB14、Context Room PostgreSQL migrations。
**Spec:** ../specs/2026-10-08-context-results-release-design.md（2026-10-08 使用者已批准）。
**Execution:** 建議本 session 原生執行；待計畫審閱與方法確認。計畫不是功能完成聲明。

## Global Constraints
- 原分支／PR：Dojo codex/r2-5c-external-results-bridge / #79；Context Room codex/r2-5a-practice-results-export / #24。
- 不 reset／force-push，不另開 PR，不丟棄 master 的短例句、銀行及其他後續成果。
- 固定來源 origin、server Bearer/owner、同來源三元組身分；不使用前端 owner 或任意 URL。
- 原日期／時區未知保留 null；匯入日不得宣稱實際練習日。
- 光步及週盤不自動增加；GET 無寫入；不新增背景排程、VF／CEFR、備份頁或功能包。
- 保留持久 POSIX lock、fsynced intent、未知 mutation 不重送，不以 /tmp 替代正式鎖。
- 測試來源與正式來源分離。SKIP／mock／PGlite 不代表原生 PostgreSQL 或正式跨站 PASS。
- 遵守 AGENTS.md，寫 Next route 前讀 node_modules/next/dist/docs 的相應指南。

## Review Focus
- 同步事件已成功但正文／receipt／checkpoint 失敗，重啟重試仍只一事件、一正文。
- 日期未知及未連結學科不得用同步日、假學科補齊，也不能破壞既有 journal 編輯／排序。
- 舊 receipt 超過100筆、無穩定來源ID或既有事件衝突時不能直接開始自動計次。
- 來源撤回／證據失效後復原，同一 UUID 更新原事件；不永久新增或重算手動週盤。
- 多頁途中版本更新、晚提交及503不能被当作來源刪除或完成歸零。

---

### Task 1: 核對前置分支與原生來源驗收
**Files:** Context Room 現有 tests/r2-5a.postgres.test.mjs、tests/railway-contract.test.mjs、railway.r25a-test.json、package.json；Dojo 既有 R2-1／2／3 版本與本文 ledger。
**Interfaces:** 消費 PR24 的 context-room-practice-results/v1；輸出確切測試 SHA、原生 migration/reader PASS 證據與可整合的最新底座。

- [ ] 重新讀取兩 repo 的 default branch、PR24／72／75／76／79 HEAD，核對本機未提交內容與 stack ancestry；保留最新 master，正常 merge 解決衝突，禁止 reset。若新變更超本範圍先列出。
- [ ] 沿用現有隔離 PostgreSQL runner；確認能撤銷 staged resources 或删除實際 test resources、配置只指向 test、無正式憑證。先診斷本地原生 PostgreSQL 能否使用；可行時避免額外計費資源。
- [ ] 執行 npm run test:integration:results，官方 migration 全鏈與 trigger/reader assertions 必須全部實跑；缺 URL 的 SKIP 不合格。既有 npm test 的原生 suites 同樣分開記錄。
- [ ] 核對5模式、跨 owner、快速重說依賴、同時間微秒分頁、rollback／撤回／刪除及 GET 無寫入；只修會造成失敗的實際問題，RED→GREEN 留 log。
- [ ] 對任何必要 Context Room 更動執行 npm test、npx tsc --noEmit、npm run lint、npm run build，commit＋push原分支；無更動只保存證據，不造功能 commit。

### Task 2: 外部事件與來源正文契約
**Files:** lib/dojo/practiceEvents/model.ts、service.ts、store.ts；lib/dojo/learningRecords/model.ts、service.ts、store.ts；docs/r2-practice-event-contract-v1.md；tests/practice-events.test.ts、tests/learning-records.test.ts。
**Interfaces:**
- 新增 ContextCompletionInput = { sourceId:string; sourceRevision:string; updatedAt:string; practicedOn:string|null; occurredAt:string|null; timeZone:string|null; dateSemantics:string; completionStatus:"completed"|"withdrawn"|"unverified"; sourceAvailability:"available"|"archived"|"deleted"; sourceLocation:string|null; activityMode:string; currentContext:{projectId:string;projectName:string|null;unitId:string|null;unitName:string|null}; originalContext:SourceResult["originalContext"] }，由已驗證 SourceResult 转换，不能直接使用 client body。
- eventService.acceptContext(input:ContextCompletionInput):Promise<CompletionEvent>；updateContext(input:ContextCompletionInput):Promise<CompletionEvent|null>；isEffectiveCompletion(event:CompletionEvent):boolean。
- CompletionEvent 用來源辨識 union；Dojo 分支維持原非空日期／段；Context 分支 unit=次，日期可null，有 sourceUpdatedAt／dateSemantics／completionStatus／sourceAvailability，來源身分固定。
- LearningRecord 用既有 recordType 的 additive source-origin 分支；外部正文容許 practicedOn=null、primaryLearningItemId=null、learningItemIds=[]，新增 originEventId/sourceRevision/dateSemantics。手動紀錄與日記 recordInput 仍要求有效日期與真學科。

- [ ] RED tests：同 Context UUID accept 2次只create 1次、另一 UUID 第2次；未完成首次update不造事件；null日期原值保存；Dojo accept/retry結果不變。
- [ ] 實作穩定事件及唯一 learningRecordId，事件 creation 必須先於正文；record evidence 僅模式摘要與來源指標，不複製全文或造學科。
- [ ] RED tests：withdrawn/unverified 排除有效統計、恢復completed重新納入同事件；deleted/archived保留有效歷史；旧sourceUpdatedAt不覆蓋新狀態、同版不同內容409。
- [ ] 外部正文以 originEventId 校驗重試讀到的紀錄，不能只見任意同ID便當完成；正文存在只更新來源 metadata，保留使用者後續筆記與學科關聯。
- [ ] 調整長期正文 title／filter／排序及 UI 可用的 null 日期語意；未知日期仍可原生分頁，不用 recordedOn 冒充 practicedOn。
- [ ] 跑 npm run test:practice-events、npm run test:learning-records、npm run test:r2-3-api；GREEN後 commit＋push原分支。

### Task 3: 來源同步、歷史對帳與恢復
**Files:** lib/dojo/externalResults/model.ts、service.ts、store.ts；app/api/dojo/external-results/route.ts；tests/external-results.test.ts；scripts/test-r2-5c-api.mjs。
**Interfaces:**
- Receipt.eventId:string|null；acceptance:"accepted"|"needs_review"|"withdrawn"|"unverified"；projections.record 用既有 ProjectionState，lightStep/weekly 保持 unlinked，ack仍不新增外部ack。
- BridgeRepository 增加 acceptSource(source:SourceResult):Promise<CompletionEvent|null> 與 retrySource(id:string):Promise<CompletionEvent>，production adapter調用Task2，純測試注入實際 eventService。
- Checkpoint 增加 legacyScan:{cursor:string|null;complete:boolean}；新增 legacy-index 的同 DB14 JSON 落點，存必要 sourceId/receiptRef、可分页，每次明確mutation最多100筆既有receipt，無 background backfill。
- source snapshot 完成標記只在 receipt/事件/正文所需進度已確認保存後寫 checkpoint.pageReceipts；待補正文必須可藉 retrySource 恢復。

- [ ] RED tests：第101筆舊receipt不漏查；scan中斷续跑；來源ID衝突維持needs_review；既有精確事件/正文引用不新增。無ID legacy不能按標題猜配。
- [ ] 完整有界 legacy 對帳完成後才接受新計次；匹配到舊已完成的Activity且無可確認既有Event時保持needs_review，避免重複算歷史成果。
- [ ] RED tests：receipt save失敗、event已存正文失敗、checkpoint失敗及module重啟；重新sync相同快照1事件／1正文，已保存事件只補尚未完成步驟。
- [ ] 接入acceptContext/updateContext及來源正文retry；不能因相同source row no-op直接略過未完成投影。response.counted明示本次新增有效事件數，total另給本頁有效數，避免把saved當新增次數。
- [ ] RED tests：503保留狀態；withdrawn/unverified更新原事件，archived/deleted保留；晚提交full reconcile可接收，空頁不撤回；跨owner拒絕。
- [ ] publicReceipt移除固定null/blocked值，allowlist新狀態，不暴露secret；GET不修補。跑 npm run test:external-results、npm run test:r2-5c-api 與Task2回歸，GREEN後 commit＋push。

### Task 4: 歷程、來源入口與有效統計
**Files:** app/components/ExternalResultHistory.tsx；既有 LearningRecord列表/詳細元件（實作前rg定位）；app/forage/records/page.tsx；app/api/dojo/learning/records/route.ts；scripts/test-r2-5c-ui.mjs；scripts/test-r2-3-ui.mjs。
**Interfaces:** 消費Task3公開receipt、Task2事件有效性和外部正文；既有列表回應不改cursor語意。若顯示全量有效次數，必須透過已完整可恢復掃描的事件索引取得，不能以20筆當全站總數。

- [ ] RED UI tests：同步成功顯示已接收與「查看來源」「查看歷程」，同UUID重刷不增加；外部紀錄未知日期顯示「來源日期未知」，匯入日顯示日期性質。
- [ ] 已撤回／待核對／已封存／來源刪除不同文案，刪除連結不可點；光步與週盤「未連結」，不聲稱自動完成。
- [ ] 新事件歷程可查正文，null學科顯示「尚未連結學科」；不自动seed。列表統計標明已載入範圍，未完成全量掃描不報精確全站總次數。
- [ ] GET/load/back/reload只讀；明確刷新／續頁／重試走mutation；離線保留最後已接收資料與實際錯誤。
- [ ] 執行 npm run test:r2-5c-ui、npm run test:r2-3-ui 375／390／430px與既有record tests，GREEN後 commit＋push。

### Task 5: 合併前驗收與發布條件
**Files:** docs/r2-5c-external-results-bridge.md；既有R2發布證據／PR描述；兩repo受影響測試與build。
**Interfaces:** exact reviewed HEAD、official migration evidence、持久writer鎖runtime證據與可使用既有發布管道。

- [ ] 跑Task1-4所有相關scripts、Next typegen、npx tsc --noEmit、npm run lint、npm run build、git diff --check；保留當次結果與首次失敗修正。不以舊PASS替代。
- [ ] 完成獨立審查與必要回歸；依可用指令與使用者批准的方法安排review，不默認主動spawn。修正後更新原PR描述到最後scope。
- [ ] 唯讀定位Context Room既有正式host/deploy管道；短逾時驗證HTTP／服務／版本，無可用管道明確BLOCKED不要求登入Railway。
- [ ] 道場R2-1/2/3前置發布需確認舊writer交接、真volume挂載與兩次deployment持久性。既存staged maintenance patch不可直接apply，含old SHA必须重新核對。
- [ ] 只有平台diff全部在授權內才變更配置，順序滿足底座PR72→75→76及ContextPR24→DojoPR79。每次merge核對HEAD与master，保留49bcc46及后续變更，發布實際merge SHA。
- [ ] 若來源原生DB或writer/runtime仍未通過，先保存code＋push與精確阻礙；不標完成、不盲合併／發佈。

### Task 6: 有限正式回流驗收與停止
**Files:** 同PR的發布結果與測試素材ID記錄（必要private証據不公開）。
**Interfaces:** 已部署SHA、Context migration成功、server owner/secret綁定經核對。

- [ ] 建立可識別的一組「成果回流驗證 2026-10-08」素材與Session，保存ID與原值，完成必要的實際內容／旗標；只一筆，不批量重製或重新分類舊素材。
- [ ] 從道場明確同步，核對正式來源成功、唯一event/record、原日期／連結、refresh後持久保存。
- [ ] 再同步同Session與重載，核對沒有第2次修習、手動週盤與光步未被改寫。
- [ ] 隔離測試驗證撤回／未知結果，正式不注入故障；若正式測試需收起只按確切ID封存，回報結果。
- [ ] 交付commits、merge/deployed SHA、實際驗收ID/結果、SKIPPED與限制；清理確切disposable資源，遇平台拒絕明列存留。完成後停止。

## 計畫審閱核對
已覆盖設計的身分、日期、來源正文、生命周期、去重、legacy對帳、原生DB、GET唯讀、持久鎖、正式發布與驗收。上下游均使用同一ContextCompletionInput与Task2接口；來源條件不得由client替代。沒有另建主紀錄、臆造光步或週盤對應。最需留意null紀錄兼容與同快照投影恢復，Task2/3的RED tests固定這些行為。
