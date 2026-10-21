# Long Video Implementation Plan

> Native inline；REQUIRED SUB-SKILL superpowers:executing-plans。最後一次fresh全包review。

**Goal:** 固定原稿→章節腳本與分段原音／圖→外部製作→真長片回收與聊解交接。
**Architecture:** 獨立longVideo模型／store／UI，重用固定server媒體profile與operation鎖；同一SVG預覽／外部HTML。
**Tech Stack:** Next16／React19／TS／FFmpeg skill／Playwright。
**Spec:** docs/superpowers/specs/2026-10-21-long-video-design.md

## Global Constraints
- 1–40章節、5–300秒一段、總長最多3600秒，ready>180秒；256MiB long-video專用profile，不改短片／Podcast。
- 每段原音與預定時間差<=0.5秒，成品16:9、width>=640、總長差<=0.5秒；原音不剪改。
- title100／narration4000／caption180／raw80000，字幕同源3行；圖片8MiB。
- 五步／44px／同源React與CSS，讀取與公開分開，不自動全形式／平台／發布。
- 分支遠端efac89e與Native d93bf26相同tree379a97f；master19ccc89；單一Native writer，無merge/deploy。

## Review Focus
- 新媒體profile不能放寬短片／Podcast、跨目錄或略過完整解碼（Task1）。
- 每段錄音／章節時間、排序、JSON聲音對應，不能裁切長音或串錯段（Task1/3）。
- partial output／handoff撤權、未知marker與舊版本恢復不可新增錯誤引用（Task2）。
- 圖片／音訊await時換章或連按、dirty匯入、衝突後bundle，不能丟稿或綁錯版本（Task3）。
- 字幕／章節標題／SRT跨小時與HTML escaping、三行溢出不能默默截斷（Task1/3）。

## Task 1: 長片模型／章節／媒體
Files: lib/dojo/longVideo/{model,composition}.ts，shortVideo/media.ts，scripts/test-long-video.mjs。
Interfaces: LongVideoDraft／Scene／Version／Project／Output／Bundle；newScene、duration、chapters、parseLongVideoDraft、assertLongVideoReady、assertChapterAudio；sceneSvg、srt、compositionHtml。
- [x] 寫strict／上限／章節順序／分段音長／escaping／SRT及長profile隔離測試，Expected missing module FAIL。
- [x] 實作固定profile與domain，Expected node scripts/test-long-video.mjs PASS、short-video與podcast回歸PASS，commit。

## Task 2: 持久API／不可覆寫回收
Files: lib/dojo/longVideo/store.ts；app/api/dojo/long-video/{route,media/route}.ts；formal／operations／liaojiePublication；scripts/test-long-video-api.mjs。
Interfaces: createLongVideo/saveLongVideo/prepareLongVideo/outputLongVideo/handoffLongVideo/bundleLongVideo/listLongVideos/readLongVideoOutput；longVideoOutputRefs。
- [x] 寫owner／dedupe／immutable／stale／真音長／16:9與成品長／partial撤權／unknown／交接，Expected missing route FAIL。
- [x] 實作同鎖最終重核與marker恢復，Expected node scripts/test-long-video-api.mjs PASS，commit。

## Task 3: 製作工具／實際4分鐘影片
Files: app/components/longVideo/{LongVideoWorkspace,LongVideoFrame,LongVideoComparison,LongVideoDelivery}.tsx及long-video.css；app/weaving/long-video/page.tsx；織光與固定文字／聊解入口；scripts/test-long-video-ui.mjs、long-video-trial.mjs。
Interfaces: 同一sceneSvg／React／外部HTML；JSON按SHA包含images／voices；章節／稿／SRT與原音下載，candidate綁版本及刷新恢復。
- [ ] 寫UI空白／dirty／save503／full conflict／JSON／圖片重試／candidate刷新／unknown／交接，Expected missing UI FAIL。
- [ ] 實作並用FFmpeg skill probe→dry-run→實際四章節4分鐘MP4→check／look；保存原音、畫面、腳本與命令證據。Expected真正可解碼成品及章節對應，不當本人聲音。
- [ ] dev／production流程與五寬排版、相關回歸、build／tsc／lint，Expected PASS或記錄既有warning，commit。

## Task 4: Review與遠端交付
- [ ] 一次fresh全包review，Important集中RED→GREEN修正，Minor記錄。
- [ ] delivery／evidence／同一progress與roadmap、checkpoint與Native同tree／expected_sha非force推送PR101，無merge/deploy。

## Ledger
- Pre-flight: Task1每段Scene.voice／chapters→Task2真音訊metadata與固定快照→Task3選章編輯／JSON聲音Map；相同欄位與時長語意。共用media新增固定profile、不接受client指定profile；舊預設保留。
- Ruling: 依已授權Native單一writer與持久Ledger直接建置，不重複要求常規同意；Native與遠端前包head不同但tree已相同，保留Native歷史，Git Data將保留遠端parent — 不要求重傳 — 代價是交付時需逐提交核對tree與parent。
- Ruling: 首版章節圖像敘事＋各段原音，橫式1280×720設計、外部編輯回收 — 完成可操作路徑而不另造NLE — 代價是實拍多軌剪輯仍在外部工具處理，本人錄音／藝術品質另驗。

- Task1 complete: missing module RED→GREEN；strict／章節累加及排序／分段原音長／HTML escaping／SRT跨小時／240秒long profile與短片拒絕／跨目錄／256MiB界限通過；short-video及podcast原套件回歸通過。

- Task2 complete: missing route RED→GREEN；真實API owner／防重／immutable／每章錄音時長拒絕／stale／partial撤權零新增／240秒16:9成品／Range／handoff及unknown保鎖marker恢復通過；固定原文不改。
