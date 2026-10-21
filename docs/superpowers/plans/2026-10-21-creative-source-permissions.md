# 第二包：來源與公開設定 implementation plan

Spec: docs/superpowers/specs/2026-10-21-creative-source-permissions-design.md
Execution: Native，既有 feature worktree，inline 執行；使用者已授權設計、實作、隔離測試及 feature push / PR。不正式 merge/deploy 新包。

## Global constraints
保留 PR89 實作與父鏈、第一包同源手機 UI、日上三更及其他工作區。不得掃描日記、正式 Notion 寫入或社群發布。預設 ask、無繼承。只在開發分支整合 PR89。

### Task 1: 整合既有閱讀與最新 master
Interfaces: 合併來源 origin/master 680aca2、origin/codex/reading-knowledge-integration 6bdd699；產出原 PR89 模組與測試及第一包隔離 server 全集合。
1. 寫整合契約測試 scripts/test-creative-source-integration.mjs，驗證 reading modules、production dotenv guard / production / fonts 及兩包測試 commands 並先看缺少模組失敗。
2. native merge master，再 merge PR89；衝突只合併必要內容，保留原 commit parent。執行整合測試、reading-knowledge、reading-knowledge-api 及 weaving。
Expected: RED 缺模組；整合後上述 tests GREEN。
3. Commit 整合，task-done -- node scripts/test-creative-source-integration.mjs。

### Task 2: 獨立政策與公開交接檢查
Interfaces: lib/dojo/creativeSources/model.ts 的 SourceRef={sourceType,sourceId}、Policy={schema,owner,ref,discovery,publication,revision,createdAt,updatedAt}；service.save({ref,discovery,publication,expectedRevision,operationId})，run durable operations；store.read/list/allowed、assertPublication(selections,confirmed)。API /api/dojo/creative-source-settings GET ref / POST 設定，owner+origin、no-store。
1. 寫 scripts/test-creative-source-settings.mjs 以注入 service 及真 handler / fixture 覆蓋 spec 的驗證、預設、修訂／去重／unknown、白名單、handoff gate。先 RED。
2. 實作 model/service/store/operations/API；白名單先政策識別再單筆解析，沒有全庫正文前篩選。舊來源快照只讀。handoff execute 先固定來源政策+本次 publicationConfirmed，再建立企劃。沿用 receipt body 以留確認稽核。
3. 更新既有 fixture handoff 呼叫表達明確本人確認，不減少原斷言。執行新測試、reading suites、weaving。
Expected: 新測試先 RED，實作後 GREEN；既有定稿、交接去重及歷史來源不變。
4. Commit，task-done -- node scripts/test-creative-source-settings.mjs。

### Task 3: 同源設定介面、手機驗收與交接提示
Interfaces: SourcePolicyEditor 使用 Task2 GET/POST，SourcePicker settingsOnly 與 /weaving/sources 共用；TextWorkspace handoff checkbox 發 publicationConfirmed，private 由 server 再查。政策草稿保存在現有 leave guard，錯誤／衝突保留輸入。
1. 寫 scripts/test-creative-source-settings-ui.mjs，在隔離真 React 頁面＋fixture handlers，先 RED 缺頁面或控制。
2. 實作頁面／入口／editor／原處連結／handoff 明確確認；CSS 路由限定，沿用 CreativeIcon。
3. build、UI_PRODUCTION=1 新 UI 測試與 reading-knowledge-ui、creative-interface、weaving-clarity；tsc、lint。截圖保存 docs/creative-source-evidence/。
Expected: 375/390/430/320/1024 無橫溢，兩許可獨立、dirty guard、失敗／衝突保留、確認後交接，所有指定 suites GREEN（lint 容許既有 warnings）。
4. Commit，task-done -- env UI_PRODUCTION=1 node scripts/test-creative-source-settings-ui.mjs。

### Task 4: 全包審查與遠端交付
Interfaces: 前三任務完整 tree、同一 docs/creative-build-progress.md checkpoint、交付 docs/creative-source-delivery.md。
1. 使用 fresh-context reviewer 審查 master..HEAD，最多一輪 Important/Critical 修正，各 RED→GREEN 再相關整體套件；不為 unrelated 測試重複延遲。
2. 紀錄實際成果、驗證、rulings／未驗收邊界、branch/head 與下一包。推 feature 並建立新 PR，Git Data 保留 parent/tree/expected_sha 非 force。
Expected: remote tree 等於驗證 tree，PR 可審閱；不宣稱本包正式上線。下一包主動提案以明確白名單取材。
3. task-done -- node scripts/test-creative-source-integration.mjs。

## Review Focus
核對沒有先全庫讀取再為點點篩白名單；政策重複／損毀是否 fail closed；note/reflection 身分不混淆；未知寫入與 refresh 不換 operationId；設定已改後的交接是否在 lock 內重查固定 completion；換來源／返回／設定讀取失敗能否意外覆寫；舊稿、非文字與空來源能否繞過本人確認。公開確認只允許內部交接，不能被文案暗示已公開發表。檢查 PR89 合併未倒退第一包的 dotenv 與來源先行流程。
