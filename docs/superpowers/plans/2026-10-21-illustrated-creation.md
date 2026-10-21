# 圖文製作 Implementation Plan

> Native inline，使用 executing-plans；沿用已授權持續實作，完成一次全包獨立審查。

**Goal:** 固定文字原稿→逐頁圖文→實際PNG／可修改來源→聊解室。
**Architecture:** Notion不可覆寫版本與現有操作收據；持久圖檔；共享React SVG渲染與輸出。
**Tech Stack:** Next16、React19、TypeScript、SVG／canvas、Playwright。
**Spec:** docs/superpowers/specs/2026-10-21-illustrated-creation-design.md

## Global Constraints
- 1–12頁；1080×1350；8MiB點陣圖；來源及公開許可獨立。
- 不改固定原稿；不自動轉全平台；不開通付費；不寫正式資料。
- 上一個writer已結束；遠端7b47180，master680aca2。原生分支與Git Data checkpoint同tree，合併父鏈後接續。

## Tasks
1. domain與assets：`lib/dojo/illustrated/model.ts`、`assets.ts`；測試頁序／溢出／輸入保護／安全檔案／持久讀取；先RED再GREEN。
2. store與API：`store.ts`、`/api/dojo/illustrated`及assets route；create/save/output/handoff、版本／來源／owner／重送／未知／衝突。先真實fixture測試失敗再實作。
3. 同源UI：`IllustratedWorkspace.tsx`、`CardPreview.tsx`、`export.ts`、`/weaving/illustrated`；五步、逐頁、配圖、輸出／回收及聊解入口。先測完整行為再實作。
4. 隔離實作生成圖、三頁PNG與可修改來源，五尺寸及失敗衝突驗收；完整相關回歸、build/tsc/lint；獨立審查修正、delivery/checkpoint/push。

## Review Focus
- 保存／輸出等待期間新輸入、換頁與未保存保護。
- 圖檔與JSON匯入不能導入路徑／任意URL／執行性內容。
- export僅對應實際已保存版本；改文案後舊輸出不能冒充目前版。
- 公開設定撤回必須在定稿與交接同鎖拒絕，保留歷史。
- 文字與繁體字實際渲染、畫布溢出、圖像裁切、輸出尺寸一致。

## Progress / rulings
- Spec／plan已依使用者完整需求自查。Task1→2 Asset metadata signature；Task2→3 Deck/Version/Output共享type；Task3→4同一SVG與PNG；無共享介面矛盾。
- Ruling: 首版採兩個可控版型與4:5，避免任意畫布帶來未驗收字體／溢出；代價是其他比例與自由排版留後續。
- Ruling: 使用內建imagegen生成隔離圖並由UI匯入，不接計費API；代價是生成需外部步驟，本包清楚回收圖檔和prompt。
- Tasks 1–4完成：domain／資產→實際API→同源UI→真實生成圖與三頁PNG／來源重匯，逐一消除依賴，沒有用文件代替程式。程式驗證head `1a84860e436120aabe4331760287740063bddd2b`。
- 全包獨立審查 0 Critical／5 Important／1 Minor，一次集中修正：部分重試撤權、完整bundle衝突恢復、未知成品回應、寬字元溢出、空白語義及成品入口；回歸與未判定邊界見 `docs/creative-illustrated-delivery.md`。無延後Minor，未再次審查。
- 最終production UI、圖文domain/API、weaving、liaojie-text、reading-knowledge-api、來源設定／提案domain、build、tsc、lint完成。375/390/430、320、1024px真實渲染；成品圖片、原圖、prompt與JSON保留在evidence。
- Ruling: owner瀏覽器渲染為信任邊界，API不獨立證明PNG像素符合文字；可用實際共享SVG／PNG測試佐證產品行為，代價是其他渲染客戶端需另訂版本簽發機制。沒有正式磁碟／Notion／iPhone／社群發布驗收。
- 下一個依賴滿足且未完成工作包是短影音；本包未merge/deploy，既有發布取消狀態不重試。
