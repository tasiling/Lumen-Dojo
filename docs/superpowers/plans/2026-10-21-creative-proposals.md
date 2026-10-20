# Creative Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, Native inline, with one fresh-context final reviewer.

**Goal:** 從明確允許的來源保存可修改提案，選中後可靠地開始文字作品。
**Architecture:** 純 model 整理候選，server store 以既有 operation steps 協調來源與作品，React 使用既有 draft/leave guard；Node worker 僅明確啟用時輪詢到期。
**Tech Stack:** 現有 Next16／React19／TypeScript／CSS／Playwright，無新依賴。
**Spec:** docs/superpowers/specs/2026-10-21-creative-proposals-design.md

## Global Constraints

Native 接現有獨立 feature checkout，不碰其他視窗。預設不主動讀私人資料、不外送素材、不新增訂閱、不正式部署／寫 Notion。每批 10 個白名單識別，1200 字片段；背景檢查 15 分鐘、使用者 cadence 4/12/24/168 小時，預設未啟用。保留日上三更與第二包來源、公開設定。來源識別與內容種類不能變成人工資料。

## Review Focus

1. 撤回許可、來源改版或不同讀次／reflection 時不讀錯來源、不採用舊候選。
2. 多 worker、略過、部分採用成功與不同操作識別不得重複提案／開作品。
3. 分頁輪巡超過 10 份仍能找到後面的來源；失敗不標成成功完成整批。
4. 未知寫入刷新後不能改識別再次建立，衝突與關閉表單保留修改。
5. 規則試寫不冒認本人觀點，環境／cadence 未設定不宣稱正在自動工作。

### Task 1: 來源候選契約與整理器

Files: lib/dojo/creativeProposals/model.ts；lib/dojo/creativeSources/model.ts、resolver.ts；scripts/test-creative-proposals.mjs。
Interfaces: ProposalSource={ref,label,href,text,version,contentKind,digest}；Proposal={schema,owner,id,revision,status,source,title,angle,why,format,trial,createdAt,updatedAt,acceptedWorkId,acceptedShuttleId}；Settings={id,revision,audience,sourceTypes,automaticEnabled,cadenceHours,lastScanAt,afterKey}。buildCandidate(source,audience,now,owner)、parseProposalPatch(value)、parseSettings(value)、defaults()；純驗證由 server-only store 消費。
- [x] 寫測試，先驗證未實作失敗：來源精確身分／片段／作者歸屬、同內容摘要穩定、無法偽造身分或狀態、cadence 必選、未知欄位與過長值拒絕。
- [x] 實作最小 model，source resolver 回傳真實 contentKind（excerpt=quote，自己的理解／經驗分開）；候選只做來源探問，不造個人事件。
- [x] Run `node scripts/test-creative-proposals.mjs`；Expected: RED → GREEN。Commit 並 task-done 相同命令。

### Task 2: 持久提案、選中作品與到期整理

Files: lib/dojo/creativeProposals/store.ts、worker.ts；app/api/dojo/creative-proposals/route.ts；instrumentation.ts；lib/dojo/formal.ts；lib/dojo/weavingWorkflow/operations.ts；scripts/test-creative-proposals-api.mjs。
Interfaces: snapshot()→{proposals,settings,backgroundReady}；scan({operationId})；saveSettings(body)、patchProposal(body)、acceptProposal({id,expectedRevision,operationId})→{workId,shuttleId}；runDue(now?)→{skipped:boolean}。API GET snapshot／operationId readonly；POST action=scan/settings/edit/skip/accept/run_due。
- [x] 寫實際 fixture store/API 測試先 RED，覆蓋 Review Focus1/2/3：白名單前篩選、種類、輪巡、去重略過、修訂、改版／撤權、固定來源、採用一次、部分成功、due／auth／origin／no-store。
- [x] 沿用 runWeavingOperation/createStep/updateStep；新前綴分離，接受提案只信 server snapshot。每個寫入獨立 step，按提案ID找既有開工標記，原讀取與公開許可不變。worker flag 關閉無計時器，背景就緒狀態真實回傳。
- [x] Run `node scripts/test-creative-proposals-api.mjs && node scripts/test-creative-source-settings.mjs && npm run test:weaving`；Expected: RED → GREEN；Commit，task-done 新 API 命令。

### Task 3: 同源提案收件匣與完整驗收

Files: app/components/creativeProposals/{ProposalWorkspace,ProposalEditor,ProposalSettings}.tsx、proposals.css；app/weaving/proposals/page.tsx；app/weaving/page.tsx；scripts/test-creative-proposals-ui.mjs；docs/creative-proposals-delivery.md、docs/creative-proposals-evidence/。
Interfaces: 使用 Task2 snapshot/API；useWeavingDraft 包含修訂／操作識別，ConflictRecovery 與 LeaveProvider。提案編輯後保存，再採用；採用僅開始一個文字工作稿。
- [x] 先寫真頁面 UI 測試 RED；空／非空、掃描、五寬度、dirty guard、保存失敗／重試、比較衝突、略過／採用、刷新未知操作，Review Focus4/5。
- [x] 實作頁面與圖示入口、設定、候選卡與明確試寫標示。runDue 與現有五步到定稿／交接接得上，不將規則候選或媒體建議當媒體成品。
- [x] Run build、tsc、lint、新 domain/API、source-settings、reading-knowledge、weaving、production 新 UI／creative-interface／weaving-clarity；Expected GREEN，容許兩個既有 lint warnings。截圖以實際元件產生並檢視。
- [x] Commit；task-done `env UI_PRODUCTION=1 node scripts/test-creative-proposals-ui.mjs`。全包 fresh review，Critical/Important 一次 RED→GREEN 修正後回歸，保留所有裁定及邊界。
- [x] 更新同一進度檔 branch/head、實際成果、驗證與下一包；Git Data 同 tree／parent／expected_sha 非 force 推送，更新既有 PR101（若狀態變更則建立新 PR）。不正式 merge/deploy。
