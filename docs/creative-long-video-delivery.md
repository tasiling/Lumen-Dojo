# 第九包交付：長影片製作

`/weaving/long-video`從織光堂或固定文字成品進入，使用同源五步圖示、React元件與CSS。這是同一[PR101](https://github.com/tasiling/Lumen-Dojo/pull/101)的開發分支成果，尚未正式合併或部署。

## 怎麼使用

1. 明確選定一份固定文字原稿，建立長影片，填名稱、觀點與畫面方向。原稿保持不變。
2. 編排1–40個章節；每章5–300秒，總長最多60分鐘，長影片成品需超過180秒。每章有獨立名稱、口播、字幕、配圖、畫面動作與本人原音。長段錄音可先在外部剪輯分段，原始逐字稿另存，不會自動覆寫口播。
3. 核對每張圖片與每段聲音的來源及公開許可，保存不可覆寫版本。章節移動時，時間碼與預覽跟隨同一章；不會共用一個全片音檔而把聲音配到錯章。
4. 預覽章節，下載1280×720真PNG、字幕SRT、累計章節JSON、口播腳本、各章原音及包含原圖片／聲音的可修改JSON。JSON／HTML整包上限256MiB（含base64），下載前先核預算，JSON重匯使用同一門檻。超過仍可逐章下載素材與稿，或外部壓縮後另存。外部HTML與原音相對檔名放在同一資料夾，渲染環境另確認中文字型。圖片暫時讀取失敗可以就地重試。
5. 用外部工具剪輯，匯回16:9 MP4（至少640px寬、最多256MiB）。每章原音長度及最終影片總長均與設定相差最多0.5秒；不符合時明確拒絕，站內不會偷偷裁切。核對影片、字幕、聲音與公開細節後固定成品，再交給聊解室查看／下載影片與章節。

候選成品與回收註記綁定版本、可跨刷新找回。修改腳本後需重新匯入對應影片；已固定版本與原音仍保留。交接不等於已發布社群，也沒有預設YouTube或把題材自動轉成所有形式／平台。

## 實際試製：Done／Steps／Check／Look／Notes

**Done：** `creative-long-video-evidence/final.mp4`是真正240秒、1280×720／24fps／H264-AAC影片，約4.75MB，四章起點0／60／120／180秒，容器內亦保留中文章節名稱。

**Steps：** 沿用第八包真正生成的虛構白鳥雲豆四張圖片，從產品同一LongVideoFrame實際匯出四張章節PNG。使用FFmpeg skill的probe→insert→audio replace→render→check→look，保留每階段dry-run、實際命令與結果、原始60秒WAV、章節畫面、稿與來源。四章各60秒，共用明示非人聲220Hz測試音；沒有模仿本人聲音或把口播腳本當成已錄製旁白。

**Check：** 最終probe實測240.0秒，ffprobe章節metadata核對0／60／120／180，custom 16:9／3600秒／256MB檢查0 FAIL、1 WARN。WARN為沒有獨立可切換字幕軌；本試片字幕已繪入畫面，產品仍能另外下載SRT。測試音未做本人語音音量／聽感驗收，check明確略過loudness，不聲稱正式音質合格。

**Look：** 已實際解碼並查看六張contact sheet及章節PNG，核對四章順序、圖片、中文標題與字幕。最初工具預設0.5秒fade，把四分鐘縮成238.5秒；實際調整為transition none後重新製作，恢復240秒與章節對齊。初始probe／check及調整紀錄保留，未以通過「最長3600秒」代替精確時長驗收。

**Notes：** 試片是隔離技術驗收，並非已錄好旁白或具藝術完成度的正式作品。首版提供章節圖像敘事及外部剪輯接續，站內不是多軌剪輯器，也沒有宣稱自動生成長影片。本人內容／錄音的製作驗收、真機播放與正式環境仍須接續。

## 驗證與可靠性

Domain及真實隔離owner API已通過strict欄位／上限、章節排序與累加、每章音長、SRT跨小時、SVG／HTML escaping、240秒長音與短片上限隔離、跨profile目錄拒絕、256MiB邊界、SHA與有界完整解碼、Range、防重與不可覆寫、stale拒絕、部分output撤權零新增、handoff、unknown marker唯讀找回與固定原文不變。

dev及production完整流程、五寬選章與無橫溢、HTML／SRT／稿／JSON下載、dirty／保存503／衝突恢復、候選回收刷新、unknown成品找回與聊解接收均已驗；集中修正後最終build／tsc、完整dev／production流程、同檔上傳及整包預算focused測試也全部通過。long-video／short-video／podcast重跑通過；其他相關回歸見同一plan Ledger與creative-build-progress。全站lint0errors／2既有warnings，集中修正檔案lint0errors／0warnings。本包不宣稱所有尺寸各自完成全部互動。

一次fresh獨立審查0 Critical／2 Important／3 Minor。兩項Important已按RED→GREEN集中修正：同檔上傳重試及整包預算／匯入門檻一致。三項保留Minor為衝突換序後需重點章節、延遲企劃GET可能換回舊選擇、不同真音檔案例尚未納入固定suite；reviewer另驗不同SHA／時長及換序對應已通過。完整裁定見creative-long-video-review.md，沒有第二次review。

## 裁定與邊界

- 已授權Native單一checkout及持久Ledger，常規實作不再重複詢問；Native與遠端歷史不同但每個映射提交tree須相同，保留遠端parent並以expected_sha非force更新。
- 橫式章節圖像＋分段原音先完成可操作路徑；實拍、多軌、自由剪輯在外部工具完成。本試片使用靜止章節，沒有把HTML有限動作當成已在FFmpeg試片渲染的動畫。
- max60分鐘／40章／256MiB是資料與服務端邊界，不等於已用手機實跑滿額；本輪實際4章／4分鐘／約16.26MB製作包。手機記憶體、低速網路、所有字型／Unicode與輔具未全面驗證。
- 讀取與公開分開，只使用指定原稿及隔離虛構資料；本人應核對圖像權利、私密細節與像素語意，server不能憑owner提交的檔案證明藝術品質。
- 正式Notion／持久磁碟、跨host、本人iPhone字型與H264播放、本人錄音聽感及正式上架待驗收。沒有購買、開通計費、正式資料改寫、社群發布、merge／deploy或重試取消的Railway操作。

倉庫以gzip分段及SHA-256 manifest保存瀏覽器製作包的相同bytes，執行`node scripts/restore-long-video-evidence.mjs`可還原ui-source.json。產品仍下載單一JSON，不受倉庫傳輸分段影響。

下一包為第十包整合驗收：六形式到聊解室、平台／發布連結與回看、手機完整路徑及正式上線包。
