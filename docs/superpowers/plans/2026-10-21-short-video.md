# Short Video Implementation Plan

> Native inline；使用 superpowers:executing-plans，最後一次全包獨立審查。

**Goal:** 固定原稿→拼貼分鏡與本人配音→實際MP4回收→聊解室。
**Architecture:** 專用短片domain／媒體blob，沿用收據與版本保存；共用幀渲染供UI與Hyperframes輸出。
**Tech Stack:** Next16、React19、TypeScript、SVG、WAAPI、Hyperframes0.8.181、FFmpeg／ffprobe、Playwright。
**Spec:** docs/superpowers/specs/2026-10-21-short-video-design.md

## Global Constraints
- 12鏡、每鏡1–30秒、總長180秒、9:16；64MiB媒體。
- 本人配音，測試音明示；原逐字稿／改寫口播／字幕分開。
- 不改原稿、不向全庫取材、不計費、不公開發文、不部署。
- 起點遠端afa3a45，master680aca2；同一feature branch Native單一writer，沒有其他活躍製作程序。

## Review Focus
- 媒體偽裝、超大／損毀容器、Range、probe缺失應拒絕或清楚報錯（Task1）。
- partial output後撤回許可、未知回應與不同版本，不能繞過公開政策或產生副本（Task2）。
- 錄音與鏡長不合不能自動裁切；改一鏡不能清除其他素材（Task1/3）。
- 匯出HTML不能讓使用者文字成為script／外部URL，素材包可重現（Task1/3）。
- 未保存離開、衝突比較之後，完整版本／成品與畫面一致（Task3/4）。

## Task1: Domain、媒體與幀契約
Files: lib/dojo/shortVideo/{model,media,composition}.ts；scripts/test-short-video.mjs。
Interfaces: VideoDraft／Scene／MediaUse；parseVideoDraft(value)、duration(draft)、assertVideoReady(draft)；saveMedia(bytes)／readMedia(id)；sceneSvg(scene,style,imageData,progress)、compositionHtml(draft,assets,voiceFilename,voiceSeconds,fontData?)、srt(draft)。
- [x] 寫domain／媒體測試，新增欄位拒絕、秒數／文字安全、逐字稿獨立、真實WAV／MP4 probe；先因未提供能力失敗。
- [x] 實作最小domain、原子資產保存與安全probe、純函式同源SVG／HTML。
- [x] `node scripts/test-short-video.mjs`，Expected PASS，commit。

## Task2: 版本API與交接
Files: lib/dojo/shortVideo/store.ts；app/api/dojo/short-video/{route.ts,media/route.ts}；formal／operations／reconciliation／liaojiePublication；scripts/test-short-video-api.mjs。
Interfaces: createVideo/saveVideo/outputVideo/handoffVideo/bundleVideo/listVideos/prepareVideo；owner GET、POST、PATCH；新videoOutputRefs:string[]。
- [x] 寫fixture assertions owner401、建立防重、revision409、保存原操作、固定來源不變、錯媒體／未確認拒絕、未知與partial恢復；Expected missing API FAIL。
- [x] 沿用既有原語實作，回收／交接副作用前重核全部來源及目前版。
- [x] `node scripts/test-short-video-api.mjs`，Expected PASS，commit。

## Task3: 同源手機工作區與外部試製
Files: app/components/shortVideo/{VideoWorkspace,VideoFrame,VideoDelivery}.tsx、video.css；app/weaving/short-video/page.tsx；織光入口／聊解室；scripts/test-short-video-ui.mjs。
Interfaces: 共用composition sceneSvg，create/save/output/handoff API；HTML／JSON／SRT下載與MP4回收。
- [x] 寫空白、3鏡、字幕／來源、配音與MP4匯入、失敗、dirty、衝突、輸出未知、交接UI；先觀察missing route FAIL。
- [x] 實作可編輯鏡序、時間slider／聲音、版本恢復、匯出及回收，不把內部預覽當影片。
- [x] 隔離實作Hyperframes HTML，先check／快照／preview，再按已有測試渲染授權render；FFmpeg skill probe/check/look；不冒充本人錄音。
- [x] dev／production `test-short-video-ui.mjs`，375/390/430/320/1024無橫溢；Expected PASS，commit。

## Task4: 審查與交付
- [x] 圖文／文字／weaving適當回歸、build、tsc、lint；Expected PASS或清楚記錄無關既有問題。
- [x] 一次全包獨立review、集中修正Critical／Important，focused RED→GREEN。
- [x] delivery／素材／影片／probe／截圖、同一progress檔與roadmap更新，expected_sha非force推送同一PR101。

## Ledger
- Spec自查完成，沿用非互動持續建置授權，自行裁定常規設計；Task1媒體／幀介面→Task2版本／輸出→Task3 UI與同一composition，無介面矛盾。
- Ruling: 站內先編輯與預覽，Hyperframes本機渲染後匯回，不接計費render服務；代價是正式環境不會自動產片，使用者需要點點或外部工具完成渲染。
- Ruling: 媒體需要ffprobe；部署未具備時API明示503，不將客戶端metadata當驗收；代價是正式上線前需要環境能力驗收。

- Task1: complete，原missing model RED→GREEN；domain、HTML、WAV持久probe通過。
- Task2: complete，原missing route RED→GREEN；owner、版本／重試、partial撤權、真MP4、Range、固定原稿不變通過；真實未知handoff marker測試先409 RED，補唯讀恢復後GREEN，不移除結果不明寫鎖。
- Ruling: Hyperframes實測要求相對音訊檔及可seek動畫；改為voice.wav／mp3／m4a另存＋data-no-timeline／paused WAAPI — CLI實測證實可渲染 — 代價是HTML與聲音需一起交付。
- Ruling: 繁中先以完整head／UTF-8修正實際編譯亂碼，隔離試片嵌入OFL Noto子集；一般輸出依渲染環境字型 — 不臆測使用者裝置有相同字體 — 代價是跨裝置需要預覽核對。
- Ruling: 接受Hyperframes三項nested SVG timeline warnings，check無error且snapshot／render實測通過 — 首版每鏡一列即可 — 代價是外部Studio尚非逐內層素材自由編輯。
- Ruling: 低音量非語音提示音保留原樣，不將其當作已通過Reels音量品質 — 試製目的為時長／媒體回收，避免放大測試純音 — 代價是正式配音仍須音量及聽感驗收。
- Task3: 同一圖片跨鏡未觸發change的UI RED已定位input重用，按scene.id重建後GREEN；最終dev／production完整路徑GREEN，含時長拒絕、JSON重匯與未知成品回應恢復。
- Ruling: 現有測試Chromium不含H.264解碼；FFmpeg實際解碼驗證影片，UI另驗證能力偵測與不支援提示 — 不將不支援解碼的瀏覽器聲稱可播放 — 代價是本人iPhone與正式Chrome/Safari仍待真機驗收。

- Final review: fresh gpt-6-astra，base afa3a45..b83832e，0 Critical／2 Important／0 Minor；沒有再審查。
- Final: fixed corrupt mdat accepted — 保留moov但將mdat歸零的saveMedia案例RED（錯誤接受）→完整有界FFmpeg解碼後GREEN；原子安裝前才接受，不逐Range重解碼。
- Final: fixed longer voice silently cropped by HTML — 4秒分鏡／12秒真音訊的實際GET prepare案例RED 200→GREEN 400；composition契約亦RED（不拋錯）→GREEN，HTML下載前核對目前版、修訂、素材、字幕、實測音長，JSON／原音保留可修改。
- Ruling: 媒體接收新增ffmpeg完整解碼（60秒timeout／2 decoder threads／file only） — ffprobe不足以證明payload可讀 — 代價是上傳較慢，正式環境必須同時提供ffmpeg與ffprobe；不在每個Range重新解碼，SHA保證內容沿用已驗證檔。
- Final: Ruling: production build、部署持久目錄／probe、真機H264、live Notion、本人聲音品質為review未判定範圍 — 本包僅宣告隔離證據，正式環境及本人品質須另驗收 — 代價是不能據此宣稱全面上線或聲音成品已就緒。
- Task4: 無延後Minor；最後集中修正後跑完整短片suite及適當回歸。

- Task3: complete；最終dev與production UI通過，375／390／430／320／1024無橫溢；空白／3鏡／dirty／保存失敗／衝突完整bundle／HTML時長拒絕與有效下載／JSON重匯／音軌／MP4回收／回應遺失／播放不支援提示／聊解交接。
- Task4驗證：完整short-video、weaving、illustrated、liaojie-text、build、tsc與lint通過，lint0 errors／2既有warnings；production介面實際驗證。Next dev殘留型別快取曾不完整，移至暫存保留後重建及tsc通過，非以略過型別檢查處理。

- Task4: complete；五個Git Data提交逐一核對Native tree，expected_sha非force推送PR101，fetch後tree相同與父鏈確認；遠端完整交付5fb7d51、程式df3667d。此行及遠端checkpoint為後續文件提交，最新head以檔案所在提交為準。
