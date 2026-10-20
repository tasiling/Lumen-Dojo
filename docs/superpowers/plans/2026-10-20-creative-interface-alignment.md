# Creative Interface Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付與已確認參考圖一致、可完整走過文字創作與聊解室交接的手機介面。

**Architecture:** 沿用現有 Next.js 元件與 API，抽出路由限定圖示、步驟契約與視覺樣式。預覽與產品共用同一套元件，使用隔離 fixture 驗收；正式資料與既有版本寫入規則不變。

**Tech Stack:** Next.js 16.2.10、React 19.2.4、TypeScript、CSS、SVG、Playwright；先讀當前 AGENTS.md 與安裝版 Next.js 文件再修改程式。

**Spec:** docs/superpowers/specs/2026-10-20-creative-interface-alignment-design.md

## Global Constraints

- 五步固定名稱：選素材、定觀點、製作內容、預覽定稿、準備發布。
- 互動目標至少 44px；正文 16px、行高至少 1.5；主要按鈕文字對比至少 4.5:1。
- 預覽與待上線功能使用相同 React 元件、圖示、字體與 CSS；測試注入隔離資料。
- 增加 Threads 平台值並保留舊值，不以其他平台冒充。
- 不改日上三更，不重建使用者拒絕的六項工具，不修改其他工作區版面。
- 不將本次建置當作社群發布、購買服務或正式部署授權。

## Review Focus

- 長作品名與中文標籤在 320px 不造成橫向溢出或壓掉主操作（Task 1）。
- 建立表單未完成、重新整理、失敗與未知寫入結果，輸入保留且不建立重複作品（Task 2）。
- 切換步驟不代表完成，保存失敗不前進，既有版本衝突仍可恢復（Task 2）。
- 舊聊解企劃與新增 Threads 企劃可正確讀寫，不改變原發布狀態含義（Task 3）。
- 字體未載入、空白與非空資料、固定底欄與鍵盤遮擋不得造成假一致（Task 4）。

## Task 1: 路由限定視覺與共用步驟

**Files:** Create app/components/creative/CreativeIcon.tsx、CreativeHeroArt.tsx、creative-interface.css；Create lib/dojo/creativeWorkflowSteps.ts；Modify app/components/DojoShell.tsx、ModuleDomainPage.tsx、WeavingProjectHub.tsx、weaving/WorkflowNavigation.tsx；Test scripts/test-creative-interface-ui.mjs。

**Interfaces:** Consumes existing WorkflowStep；Produces CREATIVE_STEPS: ReadonlyArray<{key:WorkflowStep;label:string;icon:CreativeIconName}>、CreativeIcon({name,className?})、CreativeHeroArt({realm:'weaving'|'liaojie'})。

Domain assertions（新增於既有 .mjs harness 以當前 TypeScript loader 載入新契約）：
```js
assert.deepEqual(CREATIVE_STEPS.map(x => x.key), ['sources','concept','production','review','handoff']);
assert.deepEqual(CREATIVE_STEPS.map(x => x.label), ['選素材','定觀點','製作內容','預覽定稿','準備發布']);
assert.equal(new Set(CREATIVE_STEPS.map(x => x.icon)).size, 5);
```

- [ ] 寫有意義的 fixture UI assertions：五步 label 完全等於規格、目前步驟 aria-current=step、長標題 320px 無溢出。
- [ ] 執行 node scripts/test-creative-interface-ui.mjs steps，確認因尚未提供新圖示／label 而失敗。
- [ ] 實作上述元件與路由限定樣式，首頁與工作區使用同一 CREATIVE_STEPS；保留其他路由輸出。
- [ ] 重跑指定 assertions，檢查實際截圖後 commit 本 task。

## Task 2: 建立作品與五步操作

**Files:** Modify app/components/weaving/CreateShuttleForm.tsx、TextWorkspace.tsx、CompletionPreview.tsx；Create lib/dojo/creativeCreateDraft.ts；Test scripts/test-creative-interface-ui.mjs；沿用 scripts/test-weaving-clarity-ui.mjs。

**Interfaces:** Produces CreateDraft={schema:1;sourceMode:'manual'|'sources';sourceSnapshot:string;coreStatement:string;templateKey:string;step:'sources'|'concept';manualContentKind:string;selectionRequests:SelectionRequest[];selectedPreviews:string[];updatedAt:string}；readCreativeCreateDraft():CreateDraft|null、saveCreativeCreateDraft(draft:CreateDraft):void、clearCreativeCreateDraft():void。SelectionRequest 沿用 lib/dojo/weavingWorkflow/sources.ts 的 type-only import，來源 ID、版本與選摘起訖不可憑空重建；重新開啟後建立 API 仍核對來源版本。

UI assertions（fixture HTTP 攔截記錄 writes，重用現有測試的有效回應）：
```js
assert.equal(writes.filter(x => x.method === 'POST' && x.path === '/api/dojo/weaving-shuttles').length, 0);
await page.getByRole('button', {name:'前往定觀點',exact:true}).click();
assert.equal(writes.filter(x => x.method === 'POST' && x.path === '/api/dojo/weaving-shuttles').length, 0);
await page.getByLabel('自己最想說的一句話').fill('休息不必等到所有事情都完成。');
await page.reload();
assert.equal(await page.getByLabel('自己最想說的一句話').inputValue(), '休息不必等到所有事情都完成。');
```

- [ ] 增加 cases：空觀點可先到選材畫面；到第二步確認前不 POST；重新整理恢復輸入；建立失敗不清草稿；保存失敗不前進、切步不標已完成。
- [ ] 執行 node scripts/test-creative-interface-ui.mjs create，確認新增案例在舊流程失敗。
- [ ] 讓建立表單使用兩步 UI 與本機草稿；驗證完成後呼叫既有建立 API，不寫假觀點、不改 server 寫入收據語意。調整全工作區引導與文字交付物標示。
- [ ] 執行新增 cases 與 npm run test:weaving-clarity，通過並 commit。

## Task 3: 聊解室分段與 Threads

**Files:** Modify lib/dojo/liaojiePublication.ts、app/components/LiaojiePublicationWorkbench.tsx、app/liaojie/page.tsx；Test scripts/test-weaving-domain.mjs、scripts/test-creative-interface-ui.mjs。

**Interfaces:** Extends LiaojiePlatform with 'threads'、LIAOJIE_PLATFORMS.threads='Threads'；既有企劃欄位、狀態與 API 簽章保持相容。

Domain assertions（existing publicationFixture 保留來源成品欄位）：
```js
assert.equal(normalizeLiaojieProject({...publicationFixture,platform:'threads'},{id:publicationFixture.id}).platform,'threads');
assert.equal(normalizeLiaojieProject({...publicationFixture,platform:'plurk'},{id:publicationFixture.id}).platform,'plurk');
assert.equal(normalizeLiaojieProject({...publicationFixture,platform:'unknown'},{id:publicationFixture.id}).platform,'instagram_post');
```

- [ ] 增加 normalizeLiaojieProject 接受 threads 且保留舊平台、未知值沿用舊 fallback 的 assertions；UI 確認來源快照不隨編排改寫、安排日期不宣稱外站已發布。
- [ ] 執行 npm run test:weaving-domain 與 node scripts/test-creative-interface-ui.mjs publication，確認 Threads 新案例失敗。
- [ ] 實作平台新增及接收／編排／預覽／發布紀錄分段，使用 Task 1 視覺元件。
- [ ] 重跑新增 cases 與原交接流程，通過並 commit。

## Task 4: 同源預覽、手機驗收與交付

**Files:** Extend scripts/test-creative-interface-ui.mjs、scripts/isolated-practice-server.mjs（僅在需要時）；Create docs/creative-interface-delivery.md、scripts/creative-interface-preview.mjs、scripts/test-creative-preview.mjs。

**Interfaces:** Fixture-only preview renders actual product routes；no new public fixture route or auth bypass in production。交付包含 commit、測試、實際截圖與未驗收邊界。

- [ ] 增加 375/390/430/1024px 實際流程與 320px 溢出案例，覆蓋空白與已有作品、保存狀態、定稿交接；固定操作列不遮擋內容。
- [ ] 執行 node scripts/test-creative-interface-ui.mjs all，確認新狀態案例會檢出未完成對齊。
- [ ] 產生由同源元件渲染的可操作預覽與截圖；確認中文字體載入完成，逐項核對原圖並列可讀性修正。
- [ ] 執行 npm run test:weaving、npm run test:weaving-clarity、npx tsc --noEmit、npm run lint、npm run build；僅在有新修正時重跑相關檢查。
- [ ] 依適用技能做一次獨立審查與問題修正；保存交付紀錄、commit、push、PR，更新總排程下一階段。
