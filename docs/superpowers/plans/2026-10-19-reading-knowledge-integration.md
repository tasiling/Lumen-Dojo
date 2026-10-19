# 閱讀與知識整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可追溯、可跨來源搜尋，且能連結既有學科的閱讀與知識入口。

**Architecture:** 保留 DB21 書籍與原筆記區塊、DB22 洞察、DB14 知識與作品。新增獨立 readingKnowledge 模組負責識別、分批讀取、直接關聯與分類註記；頁面只使用它的服務介面，不複製主內容。分類寫入使用既有持久鎖與獨立操作收據。

**Tech Stack:** Next.js 16.2.10、React 19.2.4、TypeScript、Notion SDK、既有 Node 測試 harness 與 Playwright。

**Spec:** `docs/superpowers/specs/2026-10-19-reading-knowledge-integration-design.md`

## Global Constraints

- 不搬移原始資料、不把閱讀變成必須完成的知識或創作流水線。
- 手機優先，保留完整原功能；不增加全域底部導覽項目。
- 現有網址保持可用；不改既有採用、成熟度與允許用途規則。
- 最多 20 個主題、每項 40 字；最多 20 個學科。
- 搜尋 20 筆一頁；不完整資料不能宣稱全庫無結果。
- 320、375、390、430 與桌面寬度無水平溢出。
- 正式 Notion 寫入與 iPhone Safari 實際驗收分開回報。
- 建置前讀 `node_modules/next/dist/docs/` 中相關 routing、searchParams、client components 指南。

## Review Focus

- 同名書籍不同讀次、閱讀反思片段不可合併成同一來源（Task 1）。
- 舊洞察沒有筆記 ID、舊主張來源無版本時，不猜測連結或版本（Task 2）。
- 部分來源失敗、快速改搜尋條件與跨頁重複結果，不能混入舊結果或顯示假完整狀態（Task 3）。
- 首次分類併發與寫入逾時不能重建註記、丟掉其他人的修改或放開未知結果鎖（Task 4）。
- 無效定位、學科封存及手機底部導覽不能讓資料或主要操作消失（Tasks 4–5）。

---

## 共用介面與檔案分工

`lib/dojo/readingKnowledge/model.ts` 定義 `ContentKind = 'book'|'reading_note'|'reading_insight'|'knowledge_claim'|'weaving_work'|'completion'`；`ContentRef = {kind:ContentKind;recordId:string;parentBookId?:string;fragment?:'reflection'}`；`contentKey(ref):string` 為唯一識別。`ContentItem = {ref:ContentRef;title:string;text:string;locator:string;href:string;status:string;sourceVersion:string|null;originalTopics:string[]}`。

`adapters.ts` 定義 `SourceBatch = {items:ContentItem[];next:string|null;complete:boolean;readAt:string}` 與 `SourceAdapter.readBatch(cursor:string|null):Promise<SourceBatch>`，內部沿用伺服器設定的資料來源；可注入測試資料。`resolve(ref):Promise<ContentItem|null>` 核對歸屬並取得單筆。

`relations.ts` 定義 `Relation = {direction:'source'|'subsequent';item:ContentItem;relation:'extracted'|'claim_source'|'work_selection';snapshot:string;sourceVersion:string|null}` 與 `relations(ref):Promise<{items:Relation[];warnings:string[];complete:boolean}>`。完成度包含所有掃描來源，不能因部分失敗回假完整。

`search.ts` 定義 `SearchQuery = {q:string;bookId?:string;kinds?:ContentKind[];topic?:string;learningItemId?:string}`、`SearchPage = {items:ContentItem[];cursor:string|null;complete:boolean;sourceStates:Record<string,'pending'|'complete'|'failed'>;readAt:string}` 與 `search(query:SearchQuery,cursor:string|null):Promise<SearchPage>`。

`annotations.ts` 定義 `Annotation = {schema:1;owner:string;ref:ContentRef;topics:string[];learningItemIds:string[];inheritBookSubjects:boolean;revision:number;createdAt:string;updatedAt:string}`；`readAnnotation(ref):Promise<Annotation|null>`、`saveAnnotation(input:{ref:ContentRef;topics:string[];learningItemIds:string[];inheritBookSubjects:boolean;expectedRevision:number;operationId:string}):Promise<Annotation>`。無註記視為 revision 0、允許書籍繼承。

測試統一加入 `scripts/test-reading-knowledge.mjs`（domain）、`scripts/test-reading-knowledge-api.mjs`、`scripts/test-reading-knowledge-ui.mjs`；package scripts 分別為 `test:reading-knowledge`、`test:reading-knowledge-api`、`test:reading-knowledge-ui`。

### Task 1: 統一識別、分批讀取與入口

**Files:** 新增 model.ts、adapters.ts、`app/components/readingKnowledge/ContentLinks.tsx`；修改 reading、dao、dao/knowledge、KnowledgeClaimWorkbench；新增 domain 測試與 package scripts。

**Interfaces:** 產出共用 ContentRef、ContentItem、SourceAdapter、resolve；總覽入口待 Task 3 實際頁面就緒才顯示，避免空連結。

- [ ] 寫失敗測試 `identity_preserves_read_round_and_fragment`，斷言 `contentKey({kind:'reading_note',recordId:'n',parentBookId:'b1'}) !== contentKey({kind:'reading_note',recordId:'n',parentBookId:'b2'})`，reflection 與原文 key 也不同；`foreign_note_is_rejected` 斷言另一書籍筆記不可 resolve。
- [ ] 執行 `npm run test:reading-knowledge`，確認因模組缺失 FAIL。
- [ ] 實作上述識別及 adapter。新增低階分頁查詢只讀伺服器允許的 DB21、DB22、DB14 前綴或已驗證書籍區塊；區塊分頁不得先載完整書籍。知識僅索引目前主張。每筆先保留書籍／讀次，不靠書名去重。
- [ ] 統一「知識庫」名稱與說明，保留原四分區；補閱讀與洞察入口。`ContentLinks` 接受 `{items:ContentItem[]}` 並渲染安全本地 href。
- [ ] 執行 domain 測試與 `npm run lint`，確認 PASS；提交 `feat: unify reading knowledge identity and entries`。

### Task 2: 直接來源與後續、單筆定位

**Files:** 新增 relations.ts、`app/api/dojo/reading-knowledge/relations/route.ts`、`app/components/readingKnowledge/RelationsPanel.tsx`、`LocatedContent.tsx`；修改單本閱讀頁、reading/cards、KnowledgeClaimWorkbench；擴充 domain/API 測試。

**Interfaces:** 使用 Task 1 resolve；產出 relations 與 `<RelationsPanel target={ContentRef}/>`；LocatedContent 接受 `{kind,id,children}`，處理 note/card/claim 查詢定位。

- [ ] 寫失敗測試 `legacy_card_only_links_known_book`、`claim_without_version_is_labelled_snapshot`、`work_multiple_selections_deduplicate`、`relations_read_performs_zero_mutations`；斷言無來源筆記的卡不產生筆記連結、null 版本保持 null、同件作品只顯示一次、mutation spy 次數為 0。
- [ ] 執行 `npm run test:reading-knowledge` 與 API 測試，確認 FAIL。
- [ ] 讀洞察原 source block、知識版本 sources、作品與成品 selections；索引只產生直接關聯，筆記 ID 唯一歸屬不明時回 warning。成品各版本獨立；舊快照不覆寫。回應有未完成警示及重試。API 使用既有 authenticated session／guard，不信任 caller owner。
- [ ] RelationsPanel 延遲載入、顯示來源快照及可確認的連結；定位時先選到包含目標的原分區，載入後展開與捲動，無目標顯示明確提示，不清除其他查詢參數。
- [ ] 執行 domain/API 測試，確認 PASS；提交 `feat: expose direct reading knowledge relationships`。

### Task 3: 跨來源搜尋總覽

**Files:** 新增 search.ts、cursor.ts、`app/api/dojo/reading-knowledge/route.ts`、`app/dao/explore/page.tsx`、`app/components/readingKnowledge/ExploreWorkspace.tsx`、`app/dao/explore/explore.css`；修改 dao、reading 入口；擴充 domain/API/UI 測試。

**Interfaces:** 使用 Task 1 batch adapters；產出 search。cursor.ts 定義 `CursorState = {schema:1;expiresAt:number;sources:Record<string,{cursor:string|null;buffer:ContentItem[];complete:boolean;failed:boolean}>}`，產出 `encodeCursor(state:CursorState,owner:string,query:SearchQuery):string`、`decodeCursor(token:string,owner:string,query:SearchQuery):CursorState`，簽章金鑰取伺服器 ACCESS_KEY 派生，不回傳金鑰。游標有效期 15 分鐘，超過時拒絕並提示重新搜尋；內容大小受每來源單頁限制。

- [ ] 寫失敗測試 `partial_empty_is_not_global_empty`、`failed_source_can_retry`、`cursor_rejects_wrong_query_or_owner`、`intersection_filters`，斷言不完整空結果 complete=false、失敗來源可單獨續讀、錯誤簽章／owner／條件遭拒、書籍與主題條件取交集。UI 測試 `late_response_does_not_replace_new_search` 斷言慢舊搜尋不能覆蓋新輸入結果。
- [ ] 執行 domain/API/UI 測試，確認 FAIL。
- [ ] 實作可續傳分批搜尋：每輪每來源最多一個供應者頁面，保留未消費結果與讀取游標；結果 20 筆／頁，服務每輪有固定工作上限。游標保存簽名狀態或簽名服務端快取 token，綁查詢／owner；不接受任意頁面。游標過期提示重新搜尋，不靜默漏頁。初版不加快取，減少失效複雜度。
- [ ] 實作手機總覽：搜尋、資料種類／書籍／主題篩選、可取消條件與全部清除；顯示分來源載入與錯誤、讀取時間和重新整理；結果使用原頁定位連結。新查詢作廢舊 generation，按內容 key 去重。Task 4 完成前學科篩選不顯示無效控制。
- [ ] 執行 domain/API/UI 測試，確認 PASS；提交 `feat: add federated reading knowledge explorer`。

### Task 4: 分類註記與學科關聯

**Files:** 新增 annotations.ts、annotationOperations.ts、`app/api/dojo/reading-knowledge/annotations/route.ts`、`app/components/readingKnowledge/AnnotationEditor.tsx`；修改 search、總覽、RelationsPanel、lib/dojo/formal.ts 的 FORMAL_STATE_TITLE_PREFIXES；擴充 domain/API 測試。

**Interfaces:** 使用 ContentRef／resolve、learningFoundation.snapshot 取得 items；產出 readAnnotation／saveAnnotation。新增 GET operationId 查詢只讀收據；註記 prefix 與 schema 按 spec，持久收據放 LEARNING_WRITE_LOCK_DIR/reading-knowledge-operations。

- [ ] 寫失敗測試 `first_annotation_concurrent_create_is_single`、`revision_conflict_preserves_both_inputs`、`unknown_write_keeps_lock`、`annotation_limits_and_foreign_subject`、`inheritance_can_be_disabled`、`archived_subject_remains_visible`、`classification_excluded_from_knowledge_scan`；斷言只有一筆有效首次建立、舊 revision 回 409、不明寫入鎖仍在、21 主題／41 字主題／21 學科及未知學科拒絕、關閉繼承只剩直接學科、封存關聯不被自動移除、一般掃描排除新前綴。
- [ ] 執行 domain/API 測試，確認 FAIL。
- [ ] 實作專用註記 store 與操作收據：依 owner+內容 key 保證唯一；鎖內重新讀取、檢查 revision、登記送出及確認狀態，相同 operationId 僅相同 payload 可重播。沿用既有寫入結果追蹤，不明結果不得自動重建。禁止自動初始化修習學科。
- [ ] 實作 AnnotationEditor，主題與學科分開、多選可留空、繼承來源明示；失效學科保留並可手動移除。分類保存後重新讀取註記及結果，不改原內容或版本。搜尋加入學科交集與未分類可見性。
- [ ] 執行 domain/API 測試與學習底座測試，確認 PASS；提交 `feat: link reading knowledge annotations to learning subjects`。

### Task 5: 完整操作驗收與交付

**Files:** 完成 test-reading-knowledge-ui.mjs；新增 `docs/reading-knowledge-integration-delivery.md`；按測試發現修改本包檔案，無關頁不改。

**Interfaces:** 使用前四項公開介面與原管理頁；不新增領域功能。

- [ ] 先補失敗互動案例：`open_every_original_entry`、`locate_card_in_other_tab`、`missing_locator_reports_unavailable`、`save_classification_then_filter`、`empty_and_partial_failure_retry`；每案檢查原內容仍可編輯、來源可回看、搜尋讀取零寫入、分類後筆記正文及 Claim versions 與 LearningRecords 原值不變。
- [ ] 在 320/375/390/430/1024 執行 Playwright，斷言 document.scrollWidth <= innerWidth、關鍵操作不被底導蓋住、鍵盤可操作；記錄 fixture 邊界。修正後再跑失敗案例至 PASS。
- [ ] 執行 `npm run test:reading-knowledge`、`npm run test:reading-knowledge-api`、`npm run test:reading-knowledge-ui`、`npm run test:weaving`、`npm run test:weaving-clarity`、`npm run test:learning-foundation`、`npm run test:learning-foundation-api`；閱讀／知識既有獨立測試依 scripts 實際名稱執行，沒有既有 runner 則由本包回歸覆蓋原頁功能。
- [ ] 執行 `npx tsc --noEmit`、`npm run lint`、`npm run build`、`git diff --check`；記錄實際結果及已存在問題，不以略過作 PASS。
- [ ] 完成全分支獨立 code review，重要問題修正及針對性複驗；交付文件列建置／測試／正式資料驗收／部署四種狀態，保留 iPhone Safari 未驗證項。提交 `test: verify reading knowledge integration on mobile`，push 工作分支並建立可審閱 PR，不把 PR 當已部署。

## 執行方式與目前狀態

推薦由目前代理在本工作區逐項實作（Native），因五項共用同一組資料介面，能減少交接成本；完成後安排一次獨立分支審查。使用者尚需審閱本計畫並選擇／確認執行方式。本文件尚未代表任何任務已完成。
