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
- [x] 寫UI空白／dirty／save503／full conflict／JSON／圖片重試／candidate刷新／unknown／交接，Expected missing UI FAIL。
- [x] 實作並用FFmpeg skill probe→dry-run→實際四章節4分鐘MP4→check／look；保存原音、畫面、腳本與命令證據。Expected真正可解碼成品及章節對應，不當本人聲音。
- [x] dev／production流程與五寬排版、相關回歸、build／tsc／lint，Expected PASS或記錄既有warning，commit。

## Task 4: Review與遠端交付
- [x] 一次fresh全包review，Important集中RED→GREEN修正，Minor記錄。
- [ ] delivery／evidence／同一progress與roadmap、checkpoint與Native同tree／expected_sha非force推送PR101，無merge/deploy。

## Ledger
- Pre-flight: Task1每段Scene.voice／chapters→Task2真音訊metadata與固定快照→Task3選章編輯／JSON聲音Map；相同欄位與時長語意。共用media新增固定profile、不接受client指定profile；舊預設保留。
- Ruling: 依已授權Native單一writer與持久Ledger直接建置，不重複要求常規同意；Native與遠端前包head不同但tree已相同，保留Native歷史，Git Data將保留遠端parent — 不要求重傳 — 代價是交付時需逐提交核對tree與parent。
- Ruling: 首版章節圖像敘事＋各段原音，橫式1280×720設計、外部編輯回收 — 完成可操作路徑而不另造NLE — 代價是實拍多軌剪輯仍在外部工具處理，本人錄音／藝術品質另驗。

- Task1 complete: missing module RED→GREEN；strict／章節累加及排序／分段原音長／HTML escaping／SRT跨小時／240秒long profile與短片拒絕／跨目錄／256MiB界限通過；short-video及podcast原套件回歸通過。

- Task2 complete: missing route RED→GREEN；真實API owner／防重／immutable／每章錄音時長拒絕／stale／partial撤權零新增／240秒16:9成品／Range／handoff及unknown保鎖marker恢復通過；固定原文不改。

- Task3 complete: UI missing entry RED→GREEN；同源SVG匯出因busy重繪斷開DOM的getBBox=0／isConnected=false已定位，memo保留預覽、快照文字並暫停聲音後四章PNG通過。換章順序預覽錯位RED→GREEN，換回原序不產生假dirty；同一file重匯不觸發onChange亦RED→GREEN清除input值。圖片失敗有就地重試及獨立可清除錯誤。
- Task3 validation: dev及最終production完整流程PASS，375／390／430／320／1024選章與無橫溢截圖；空白／非空、dirty離開、save503、完整衝突比較、HTML／SRT／章節稿、JSON成功／dirty與失敗保留、回收刷新、unknown output找回及聊解接收。實際240.0秒16:9 H264-AAC與章節metadata通過；FFmpeg預設fade238.5秒已實際調整為none240秒，check0FAIL／1WARN（無獨立字幕軌，畫面字幕＋外部SRT），look六圖已目視。非人聲測試音，略過loudness，不聲稱本人錄音與真機播放。
- Task3 regression: long-video／short-video／podcast／comic／illustrated／weaving／liaojie-text／reading-knowledge及reading-knowledge-api PASS；final build、tsc PASS，lint0errors／2既有warnings；各尺寸沒有各跑一遍完整流程。

- Final review: 一次fresh gpt-6-astra，範圍d93bf26..90f5c05，0Critical／2Important／3Minor。按使用者影響維持評級；未再派reviewer。reviewer另用兩份不同SHA／時長真WAV及換序驗證映射正確。
- Final: fixed 同檔圖片／原音／MP4無法重試與跨章同音檔 — inputValue C:fakepath RED→GREEN清除原生值，focused UI含同音檔兩章與三類input；suite3/3（long-video／short-video／podcast）及dev／最終production完整流程2/2 PASS。
- Final: fixed 整包可能超過自身匯入門檻 — 20段180秒48kHz stereo PCM arithmetic、實際owner預算API與client preflight413不下載均RED→GREEN。新增256MiB encoded JSON／HTML預算（去重JSON、逐章HTML圖片），音訊stat估算後才由client讀完整原檔，最終Blob再核；JSON匯入同常數。budget focused UI1/1、suite3/3及dev／production2/2、build／tsc PASS；lint0新增error／warning。
- Final: Ruling: 明確整包容量而不新增ZIP媒體封裝 — 保留一小時／40章與單檔上限，256MiB以下整包可重匯，超出可逐章下載或外部壓縮後另存 — 滿額無壓縮WAV需外部素材交付，產品已明示，手機滿額效能仍另驗。
- Final: minor (deferred): 衝突讀入換序版本後需重點章節才能對齊預覽；PNG防錯拒絕，未靜默輸出錯章。
- Final: minor (deferred): 延遲A企劃GET可能覆蓋B active選擇；同步session draft暫存可重開恢復，load generation guard列整合改善。
- Final: minor (deferred): 不同真音檔／時長換序案例reviewer獨立通過，但尚未納入固定suite。

- Final: Ruling: 每次GET完整解碼 — 安裝已完整解碼、讀取仍核SHA，正常使用不新增解碼負擔 — 若磁碟不符合immutable設計，應另查正式環境。
- Final: Ruling: 已完成operation在撤權／改版後replay — 僅找回已確認結果，不增加引用，保留恢復價值 — 必須持續維持marker與零新增約束。
- Final: Ruling: ±0.5秒時長誤差 — 採已確認規格，拒絕明顯錯章／裁音 — 本人仍要核對聽感及編碼尾端。
- Final: Ruling: HTML一般瀏覽器播放器 — 明示外部renderer交付，下載不代表MP4 — 外部工具／字型仍須另驗。
- Final: Ruling: 240秒試片使用靜態PNG — 只聲稱章節／音訊／回收驗證，未聲稱長動畫已渲染 — 作品藝術品質不由本片代表。
- Final: Ruling: 滿額效能／本人聲音／真機 — 已在spec／delivery明示未驗，不用4分鐘fixture推論一小時流暢 — 上線與本人內容驗收仍需補。
- Final: Ruling: 每尺寸完整流程 — 只聲稱每寬選章及排版，主要390／後段1024完整互動 — 特定裝置仍可能有未覆蓋差異。
- Final: Ruling: 正式Notion／deploy／計費／社群 — 不屬本包執行範圍，沒有冒用舊發布同意 — 本包交付仍為PR開發成果。
- Final: Ruling: 全檔排版重構 — 沿用同類模組結構，本輪以功能邊界與驗證為範圍 — 後續維護可另安排，未把可讀性重構混入本包。
