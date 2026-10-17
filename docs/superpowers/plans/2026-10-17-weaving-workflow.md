# 織光堂 W1–W3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after the user's plan review. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在既有織光堂完成可安全續作的五種文字流程，精確引用素材並手動交接固定成品版本。

**Architecture:** 沿用 WeavingShuttle、WeavingWork、LiaojiePublicationProject 與 DB14/DB21/DB22。新增創作專屬 workflow domain、持久操作收據、來源 adapter、成品版本 store；三個既有 API 為薄層，既有長頁只拆出新編輯區。與修習所／野採／週盤 UI 修改分開。

**Tech Stack:** Next.js 16.2.10 App Router、React 19.2.4、TypeScript 5、Notion SDK 5.22.0、Node.js >=20.9.0、既有 Playwright 1.56.1；不新增付費服務或依賴。

**Spec:** `docs/superpowers/specs/2026-10-17-weaving-workflow-design.md`

**Baseline:** `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef`；本機設計 checkpoint `7e9e9aab57cf5fe0cf1a473122424891344568f0`；分支 `codex/weaving-workflow-v1`。

**Execution:** 已獲使用者核准 Native，由本視窗完成實作與驗證。公開 push／PR／merge／deploy 不屬於本計畫執行授權；先交付本機 commit 與私人檔案。

## Global Constraints

- 每件作品的合成文字上限沿用 80,000 字元，選摘快照合計上限 30,000 字元、最多 30 個來源／選摘項目。
- WeavingShuttle 保留 v3，WeavingWork 保留原 v1 recordType 與既有欄位。
- 每個成品版本在 DB14 以獨立前綴 `行光作品成品-v1-` 逐筆保存。
- outputKind 固定為 article、post、thread、carousel_copy、story_copy、spoken_script。
- 外部工具結果先預覽，再由使用者確認保存；不新增付費 AI 呼叫。
- 原文摘錄、個人理解與經驗分別標示；只傳明確選中片段與必要來源。
- 不自動發布、採用知識、建立學習正文／完成事件或完成週盤。
- 漫畫、影片、圖卡排版、錄音與閱讀學科分類整合留後續独立包。
- 創作專屬 CSS 獨立保存；共用 tokens、底導與其他視窗頁面變更另列提案。
- 保留舊實體 ID；GET 不建資料、不遷移；不清理正式資料。

## Review Focus

- 選摘跨越全形字、emoji 或重複句時，以來源原文字元範圍核對，不能錯配或帶出未選全文；由 Task 4 測試。
- 預覽後重新編輯，再按完成／發布時，必須重新預覽最新版，不能提交舊畫面；由 Task 5/6/7 測試。
- 保存 A 時切往 B，A 的延遲回應不能寫入 B，也不能吃掉 A 的後續輸入；由 Task 5 測試。
- 舊作品沒有 revision／結構／成品版本，以及已送聊解室的舊案，必須照常讀取且只在明確更新時增補；由 Task 1/6/7 測試。
- Notion 有多筆相同操作身分、暫時看不到已建立資料或確定拒絕某個子步驟時，必須區分碰撞／結果不明／可恢復部分完成；由 Task 2/3 測試。

---

## File Structure

| 路徑 | 責任 |
| --- | --- |
| `lib/dojo/weavingWorkflow/model.ts` | Workflow／block／selection／成品引用與驗證 |
| `lib/dojo/weavingWorkflow/templates.ts` | 五種文字模板與交付種類 |
| `lib/dojo/weavingWorkflow/serialize.ts` | 合成文字與選摘限定協作指令 |
| `lib/dojo/weavingWorkflow/operations.ts` | 控制收據、固定子步驟、重送判斷 |
| `lib/dojo/weavingWorkflow/store.ts` | 創作 read／revision PATCH／操作執行 |
| `lib/dojo/weavingWorkflow/sources.ts` | 來源型別、候選與精確選摘解析 |
| `lib/dojo/weavingWorkflow/completions.ts` | 不可覆寫成品版本與引用 |
| `lib/dojo/weavingWorkflow/draft.ts` | 客戶端編輯序號與保存回應協調 |
| `app/components/weaving/` | 步驟、來源選取、分段編輯、預覽、離開對話框 |
| `app/weaving/workflow.css` | 頁面專屬布局；沿用既有 tokens |
| `scripts/weaving-test-harness.mjs` | 按既有 R2 loader 模式隔離 SDK／來源／持久目錄 |
| `scripts/test-weaving-{domain,api,sources,completion,ui}.mjs` | 真實 domain／handler／UI 行為 |

## Task 1 — 文字資料、模板與舊稿相容（W1/W2）

**Files:** Create model.ts/templates.ts/serialize.ts；Modify `lib/dojo/weavingShuttle.ts`、`lib/dojo/weavingTools.ts`；Test `scripts/test-weaving-domain.mjs`；新增 package.json `test:weaving-domain`。

**Interfaces:** `TextWorkflow {schemaVersion:1,templateKey,currentStep,blocks,sourceSelections,outputKind}`；`TextBlock {id,role,text,mediaNote}`；`WorkflowSelection {sourceType,sourceId,sourceVersion,locator,contentKind,selectedText,capturedAt,digest}`。`normalizeWorkflow(input:unknown):TextWorkflow|null`、`workflowFromLegacy(work:WeavingWork):TextWorkflow`、`serializeWorkflow(workflow:TextWorkflow):string`、`workflowPrompt(workflow:TextWorkflow,step:WorkflowStep,core:string,audience:string):string`。WorkflowStep 是 sources/concept/production/review/handoff；模板沿用 article/plurk/instagram_carousel/instagram_story/spoken_script。

- [x] 實作前先執行 `npm ci`，閱讀 AGENTS.md 與本版 `node_modules/next/dist/docs/` 的 App Router／Route Handler 文件；確認沒有正式.env。這是計畫核准後的環境準備，本次計畫交付不執行。

- [x] RED：測試五模板、30來源／30,000快照／80,000文字边界、超限拒絕、舊稿讀為單一 free block、block ID 排序保留、選中片段限定 prompt。Assertions：80,000 PASS、80,001 throws；來源合計30,001 throws；未選片段不在 prompt。
- [x] Run `npm run test:weaving-domain`，確認失敗在尚未實作介面。
- [x] 實作上述純 domain；normalizeWeavingWork 增補 revision（缺失=0）、可選 textWorkflow、completionVersionRefs/currentCompletionVersionId；保留所有原欄位。輸入驗證在既有截斷之前；textWorkflow 與 draftText 由 serializer 保持一致。blocks 建立時生成 UUID，讀取不重生。
- [x] Run domain 測試，確認上述全部 PASS；`npx tsc --noEmit`（完成 Next typegen 後）。
- [x] Commit `feat: add compatible weaving text workflow models`。

## Task 2 — 持久創作操作與部分結果恢復（W1）

**Files:** Create operations.ts/store.ts、weaving-test-harness.mjs、test-weaving-api.mjs；Reuse `learningFoundation/fileLock.ts`、`writeOutcome.ts`、`access.ts`；新增 `test:weaving-api`。

**Interfaces:** `OperationKind = create_pair|create_work|migrate|reflect|complete|handoff|patch`；`OperationReceipt {schemaVersion:1,owner,operationId,kind,inputDigest,steps,result,state}`；state 為 pending/confirmed/rejected/unresolved。`EntityRef {id:string,revision?:number}`；`OperationStep {key:string,findConfirmed:(receipt:OperationReceipt)=>Promise<EntityRef|null>,execute:(receipt:OperationReceipt)=>Promise<EntityRef>}`。`runWeavingOperation(owner:string,operationId:string,kind:OperationKind,input:unknown,steps:OperationStep[]):Promise<OperationReceipt>`、`inspectWeavingOperation(owner:string,operationId:string):Promise<OperationReceipt|null>`。Receipt.result 是 stepKey→EntityRef 的映射，下游依這些 ID 讀回實體組成API回應。每個子步驟 title 含 owner 派生 digest＋operationId＋stepKey；低層建立使用 retryCreate:false。

- [x] RED：實際 FS 收據＋隔離 SDK 的同 operationId 重送只建立一次、同 ID 異輸入409、跨 owner 不可讀、相同 title 多筆409、confirmed rejection 可重試原子步驟、已建立回應遺失保留 intent 與 writer lock。Assertions：重送 ID 相同且 createCount=1；不明結果再次 POST 不增加 writeCount。
- [x] Run `npm run test:weaving-api`，確認失敗原因。
- [x] 實作持久控制資料於 `LEARNING_WRITE_LOCK_DIR/weaving-operations/`；wx 建立意圖、fsync 文件與目錄、atomic rename 保存收據。只在最外層取得共享 writer lock，內部不重入。輸入 digest 包含內容，操作核對 owner/kind/digest；GET inspect 不拿 writer lock、不得進行 mutation。
- [x] 首次 dispatch 前保存子步驟意圖；已確認子步驟不重建；結果不明一律唯讀核對，不自動清鎖。對確定拒絕才可恢復同子步驟。保留已知 parent 與 child ID，不以封存補償猜測未確認結果。
- [x] Run api 測試，重啟模組後再重送、讀回；同 owner 跨 process 競爭亦須驗證。
- [x] Commit `feat: persist weaving operation receipts`。

## Task 3 — 接入既有寫入 API、revision 與相容界線（W1）

**Files:** Modify weaving-shuttles/route.ts、weaving-works/route.ts、liaojie-projects/route.ts；Extend store.ts、test-weaving-api.mjs。

**Interfaces:** Writes 使用 `{operationId,expectedRevision,input}`，route 仍接受原 body 對應欄位作 legacy adapter。`patchWeavingWork(owner,id,expectedRevision,patch,operationId):Promise<WeavingWork>`；shuttle/publication 使用同樣 revision 模式。`GET /api/dojo/weaving-works?operationId=...` 可回控制結果。requireLearningOwner 在每個 handler 首行驗證，重用既有 LearningError HTTP status。

- [x] RED：401/403、缺 lock dir503、舊revision=0可首次保存、revision>0缺 expectedRevision409、兩個相同 revision PATCH 僅一筆成功、來源／核心關聯欄位偽造拒絕、GET無寫入、legacy migrate保留 ID映射。
- [x] Run `npm run test:weaving-api`，確認這些新增 assertions FAIL。
- [x] 三個 API 的 create/migrate/reflect/patch/archive 均委派到 operation/store；禁止 caller 指定身份、關聯、完成快照／採用來源。只允許白名單編輯欄位，鎖中重讀後比較 revision；同操作重送回原 result。臨時 legacy 建立請求沒有 operationId 回409並告知重新開啟，不無保護地建立副本；舊資料唯讀不受影響。
- [x] 修改所有本視窗相關 frontend caller 傳 operationId／revision；operationId 在首次明確操作時生成，失敗後保留同 ID，內容改變後新操作。其他來源入口 caller 只補 payload，保留原頁布局。
- [x] Run API/domain及既有 `test:learning-foundation-api`、`test:r2-3-api`；確認資料模型與實際 handler相符。
- [x] Commit `fix: guard weaving writes with revisions and stable operations`。

## Task 4 — 來源候選、精確選摘與權威解析（W2）

**Files:** Create sources.ts、`app/api/dojo/weaving-sources/route.ts`、SourcePicker.tsx、test-weaving-sources.mjs；Modify reading/cards/page.tsx與reading/books/[id]/page.tsx僅增加入口；新增 `test:weaving-sources`。

**Interfaces:** `SourceKind=reading_note|reading_insight|forage_capture|knowledge_claim|manual`；`SourceCandidate {sourceType,sourceId,label,version,locator,contentKind,text,availability}`；`SelectionRequest {sourceType,sourceId,sourceVersion,start,end,contentKind}`。`listWeavingSources(owner,kind,cursor):Promise<{items:SourceCandidate[],cursor:string|null}>`、`resolveSelections(owner,requests:SelectionRequest[]):Promise<WorkflowSelection[]>`。range 採 JS UTF-16 [start,end)；人工輸入另用 manual payload。

- [x] RED：只選兩段就只傳兩段；emoji／全形字／重複句定位；偽造 note 所屬書、失效 Claim version、未採用Claim、K4用途不符、未adopted/C2野採、來源改版、30項邊界、所有候選頁可分頁。
- [x] Run `npm run test:weaving-sources`，確認FAIL。
- [x] 候選與解析均驗證登入／DB父資料表／原記錄類型；note是 block ID，透過原書籍 listReadingNotes核對，不能把 block 當 pages.retrieve。Claim只讀有效採用版本與allowedUses；原文、理解、經驗類型保留。伺服器用range重切原文並核對version/digest；不接受前端snapshot或fulltext為權威。
- [x] UI SourcePicker 提供片段勾選、選摘摘要與來源定位；reading note須補自己觀點才可進成熟題材。選摘可刪除；所有協作指令經Task1 serializer，不附未選正文。
- [x] Run sources/api/domain；驗證notes/book舊頁只增加深連結、未變原保存格式。
- [x] Commit `feat: select precise reading and knowledge sources for weaving`。

## Task 5 — 安全續作、五步頁面與分段編輯（W1/W2）

**Files:** Create draft.ts、useWeavingDraft.ts、WorkflowNavigation.tsx、TextBlockEditor.tsx、LeaveDialog.tsx、workflow.css、test-weaving-ui.mjs；Modify WeavingProjectHub/Workbench與LiaojiePublicationWorkbench；新增 `test:weaving-ui`。

**Interfaces:** `DraftState<T> {entityId,baseline,value,editSequence,savingTicket,status,error}`；`beginSave(state):{entityId,sequence,revision,value}`、`acceptSave(state,ticket,server):DraftState<T>`。`useWeavingDraft(entity)`提供 edit/save/dirty/status/requestLeave，requestLeave(resolveAction)保存後離開／放棄／留在原處。純協調函式先在domain測試。

- [x] RED：ticket後再輸入保留新文字且dirty=true；A回應不影響B；取消離開保留內容；新建／回杼／母卡方向／發布欄位也計dirty；模板變更可取消；預覽後修改導致preview失效。
- [x] Run domain與 `npm run test:weaving-ui`，先確認FAIL（瀏覽器啟動問題單獨記錄）。
- [x] 實作每個entity的editing buffer與confirmed baseline，先檢查ticket.entityId與sequence再採回應。站內跳頁與router push/replace都經requestLeave；beforeunload保留原生提示，不依靠卸載fetch保存。顯示401、409、失敗與結果不明狀態，舊回應不顯示誤成功。
- [x] 五步頁面使用現行設計規範tokens；手機採可換行步驟導航，不用overflow:hidden遮住。分段可加／刪／排序；貼回先成候選，預覽後才套用。未完成作品首頁可直接續作，不先重建或重選形式。
- [x] UI隔離 `page.route`回覆或實際fixture handler；375/390/430px与桌面驗證輸入、切換、延遲save、refresh、safe area。不攔截production URL、不讀正式憑證。測試server用 `next dev`，不用npm start的LINE副作用。
- [x] Commit `feat: build resumable weaving text workspaces`。

## Task 6 — 不可覆寫成品版本（W3）

**Files:** Create completions.ts、CompletionPreview.tsx、CompletionHistory.tsx、test-weaving-completion.mjs；Modify weaving-works/route.ts、formal.ts、queries.ts；新增 `test:weaving-completion`。

**Interfaces:** `CompletionVersion {id,workId,owner,operationId,coreVersionId,sourceSelections,outputKind,text,outputUrl,createdAt,state,supersededBy}`；`completeWeavingWork(owner,workId,expectedRevision,operationId,previewDigest):Promise<{work,completion}>`。get/list僅回owner可用來源；新版本記錄只允許撤回／取代metadata更新。

- [x] RED：空內容拒絕、超80k拒絕、不匹配previewDigest409、重送同一版本ID、A成品後編輯B不改A、來源不可用保留歷史但不准新完成、GET無寫入、舊completed成品維持可讀。
- [x] Run completion/api，確認FAIL。
- [x] server在鎖中核對最新稿與previewDigest，保存獨立版本，再保存作品refs/current ID/finalSnapshot相容投影；每一步使用Task2收據。不可把blocks文字尚未保存時的本機稿當成已完成版本。
- [x] `FORMAL_STATE_TITLE_PREFIXES`加入新成品前綴，一般知識掃描排除；不修改人工核可的知識條件。舊completed只有snapshot時可顯示legacy快照，使用者明確完成／確認轉換才建版本。
- [x] UI展示版本正文、所採核心／來源與交付種類；修改後需重新預覽。輪播文案與口播稿明示交付為文字。
- [x] Run completion/domain/api及capture-exploration/weekly回歸。
- [x] Commit `feat: preserve immutable weaving completion versions`。

## Task 7 — 固定版本交接、聊解續作與回杼（W3）

**Files:** Modify liaojiePublication.ts、liaojie-projects/route.ts、LiaojiePublicationWorkbench.tsx、WeavingProjectWorkbench.tsx；Extend operations/store、completion與UI測試。

**Interfaces:** `handoffWeavingWork(owner,workId,completionVersionId,operationId,createNewVersion:boolean):Promise<LiaojiePublicationProject>`；模型增補revision/sourceCompletionVersionId/handoffOperationId。唯一對應為workId＋completionVersionId，manual新發布版本需明確旗標。

- [x] RED：A交接後B不覆寫A企劃、A重送回原ID、缺少B新版本確認409、source IDs偽造拒絕、未完成拒絕、published缺link拒絕、scheduled只存日期不送外站、舊sent_to_liaojie不重建。
- [x] Run api/completion/UI，確認FAIL。
- [x] 交接server從completionVersion读取文字／來源／核心，忽略caller snapshot；先固定版本企劃，再更新work已送狀態，每步有收據。publication PATCH只編輯品牌／平台版本／回看欄位，不可修改來源快照。
- [x] 聊解室沿用五種發布資料與三個save動作，接Task5 buffer保護；預覽失效後需再preview。回杼update_core/branch/rest沿用原語意並走持久操作，不自動建立Claim或週盤。
- [x] Run全部創作測試及existing R2-3、image-routing、unit-arrangement回歸。
- [x] Commit `feat: hand off confirmed work versions to Liaojie`。

## Task 8 — 全流程與交付驗收（W1–W3）

**Files:** Create `docs/weaving-workflow-delivery.md`；Update此計畫checkbox、package.json `test:weaving`串接domain/api/sources/completion，UI單独執行；必要更新既有隔離測試fixtures以符合新payload。

- [x] 確認Task1的版本指南閱讀已完成，並確認Task5採用現行共用設計交接規範；不用正式.env。
- [x] Run `npm run test:weaving`、`npm run test:weaving-ui`、`npm run test:learning-records`、`npm run test:learning-foundation-api`、`npm run test:r2-3-api`、`npm run test:capture-exploration`、`npm run test:weekly`、`npm run test:image-routing`、`npm run test:unit-arrangement`。
- [x] Run `npx next typegen && npx tsc --noEmit`、`npm run lint`、`npm run build`、`git diff --check`。保留既有Plurk img warning但新增lint errors须修正。
- [x] 保存隔離實際操作證據：五模板各一件、來源選摘、修改／刷新、版本A/B、重送交接、未存取消。對照設計規格13項驗收；FAIL必須修正後重跑相關項，SKIPPED說明具體環境缺口。
- [x] 記錄資料落點、additive模型、兼容與只回退程式的恢复方式。真Notion、iPhone Safari與正式部署單獨列未驗收，不宣稱正式可用。
- [x] Review全branch diff與五條Review Focus（實作完成後依requesting-code-review技能安排一次允許的獨立審查）；修正實質問題並復驗。不因文件審查而公開規格或private fixture。
- [x] Commit交付文件，保留W1/W2/W3 checkpoint；公開push仍須明確授權，未授權时將patch/commit成果作私人交付。

## 自查紀錄（計畫階段）

- 規格第1–4節：Task1/5/7保留層次與五步流程；第5節：Task4/7精確來源與人工知識界線。
- 第6–7節：Task1/6處理五模板、舊稿與独立成品版本；第8節：Task2/3/5/7處理保存、並發、收據與交接。
- 第9–12節：本計畫的檔案邊界、分批與Task8涵蓋驗收／交付。漫畫、影片、學科分類為明確後續範圍，沒有假稱納入本批。
- 型別／介面：source selections由Task4解析、Task1序列化、Task6固定；操作receipt由Task2、route由Task3、UI呼叫由Task5/7；名稱一致。
- 流程實作前所有測試checkbox未勾；本文件審查不代表測試PASS或產品完成。

## 本次交付狀態

2026-10-17：使用者已核准規格、計畫與 inline 建置。Tasks 1–8 已完成；完整驗證、獨立審查修正、資料落點、恢復程序與取捨見 `docs/weaving-workflow-delivery.md`。正式 Notion、正式卷與 iPhone Safari 另列未驗收；未公開 push、未合併、未部署、未寫正式資料。
