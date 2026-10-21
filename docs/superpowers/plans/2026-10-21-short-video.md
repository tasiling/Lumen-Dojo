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
Interfaces: VideoDraft／Scene／MediaUse；parseVideoDraft(value)、duration(draft)、assertVideoReady(draft)；saveMedia(bytes)／readMedia(id)；sceneSvg(scene,style,imageData,progress)、compositionHtml(draft,assets,fontData?)、srt(draft)。
- [ ] 寫domain／媒體測試，新增欄位拒絕、秒數／文字安全、逐字稿獨立、真實WAV／MP4 probe；先因未提供能力失敗。
- [ ] 實作最小domain、原子資產保存與安全probe、純函式同源SVG／HTML。
- [ ] `node scripts/test-short-video.mjs`，Expected PASS，commit。

## Task2: 版本API與交接
Files: lib/dojo/shortVideo/store.ts；app/api/dojo/short-video/{route.ts,media/route.ts}；formal／operations／reconciliation／liaojiePublication；scripts/test-short-video-api.mjs。
Interfaces: createVideo/saveVideo/outputVideo/handoffVideo/bundleVideo/listVideos；owner GET、POST、PATCH；新videoOutputRefs:string[]。
- [ ] 寫fixture assertions owner401、建立防重、revision409、保存原操作、固定來源不變、錯媒體／未確認拒絕、未知與partial恢復；Expected missing API FAIL。
- [ ] 沿用既有原語實作，回收／交接副作用前重核全部來源及目前版。
- [ ] `node scripts/test-short-video-api.mjs`，Expected PASS，commit。

## Task3: 同源手機工作區與外部試製
Files: app/components/shortVideo/{VideoWorkspace,VideoFrame,VideoDelivery}.tsx、video.css；app/weaving/short-video/page.tsx；織光入口／聊解室；scripts/test-short-video-ui.mjs。
Interfaces: 共用composition sceneSvg，create/save/output/handoff API；HTML／JSON／SRT下載與MP4回收。
- [ ] 寫空白、3鏡、字幕／來源、配音與MP4匯入、失敗、dirty、衝突、輸出未知、交接UI；先觀察missing route FAIL。
- [ ] 實作可編輯鏡序、時間slider／聲音、版本恢復、匯出及回收，不把內部預覽當影片。
- [ ] 隔離實作Hyperframes HTML，先check／快照／preview，再按已有測試渲染授權render；FFmpeg skill probe/check/look；不冒充本人錄音。
- [ ] dev／production `test-short-video-ui.mjs`，375/390/430/320/1024無橫溢；Expected PASS，commit。

## Task4: 審查與交付
- [ ] 圖文／文字／weaving適當回歸、build、tsc、lint；Expected PASS或清楚記錄無關既有問題。
- [ ] 一次全包獨立review、集中修正Critical／Important，focused RED→GREEN。
- [ ] delivery／素材／影片／probe／截圖、同一progress檔與roadmap更新，expected_sha非force推送同一PR101。

## Ledger
- Spec自查完成，沿用非互動持續建置授權，自行裁定常規設計；Task1媒體／幀介面→Task2版本／輸出→Task3 UI與同一composition，無介面矛盾。
- Ruling: 站內先編輯與預覽，Hyperframes本機渲染後匯回，不接計費render服務；代價是正式環境不會自動產片，使用者需要點點或外部工具完成渲染。
- Ruling: 媒體需要ffprobe；部署未具備時API明示503，不將客戶端metadata當驗收；代價是正式上線前需要環境能力驗收。
