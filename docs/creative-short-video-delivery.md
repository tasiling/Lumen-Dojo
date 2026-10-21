# 第六包交付：不露臉短影音

已建置可操作短片工作區 `/weaving/short-video`，接固定文字原稿，沿用五步圖示與同源元件。此包在同一[PR101](https://github.com/tasiling/Lumen-Dojo/pull/101)交付，尚未正式合併或部署。

## 現在能做什麼

1. 從織光堂或固定文字成品進入，明確選一版原稿建立短片，原稿不被改寫。
2. 設定這次觀點、水彩／蠟筆方向；增刪排序1–12鏡，分別寫口播、字幕、秒數，換配圖並記來源。原始逐字稿單獨保留。
3. 匯入自己的WAV／MP3／M4A錄音，或明示隔離測試音。配音不會被自動裁切；每鏡1–30秒，總長180秒以內。
4. 用聲音與時間滑桿預覽。保存版本後下載可修改JSON、Hyperframes頁面、原音與SRT，交點點／外部工具渲染。HTML匯出前核對實測音長，未對齊先提示調整。一般HTML需確認外部渲染環境中文字型。
5. 匯回真正H264／AAC、9:16 MP4，實際播放核對並填製作工具／回收註記，再固定版本、下載與送往聊解室。影片成品與原文字、平台稿、圖文一起保留，沒有自動發文。

保存失敗保留輸入，衝突可比較後讀入／重套完整版本；回收欄位跨刷新保留。成品回應遺失先找回目前版；真正未知交接已提交時以原marker唯讀恢復，不複製成果，也不擅自清除結果不明的寫鎖。新版本不能直接拿舊回收檔冒充目前成品。

## 實際外部製作

已用Hyperframes0.8.181本機製作三鏡12秒水彩拼貼小動畫，FFmpeg壓縮並真實解碼核對。成品 `creative-short-video-evidence/final.mp4`，不是靜態示意圖或只提供腳本。所有內容為虛構隔離資料，配音位置使用**非語音測試提示音，非Crystal錄音**。

來源／工具／素材包／字型授權／分鏡／SRT／實際MP4／probe／Hyperframes check／UI五尺寸／解碼圖均在 `creative-short-video-evidence/`；詳細重現與例外見 `SOURCE.md`。重新執行 `node scripts/short-video-trial.mjs` 可重建同一HTML／聲音，最終修正後HTML SHA256與已渲染的輸入完全相同。

## 審查與驗證

- 一次全包獨立審查：0 Critical、2 Important、0 Minor。兩項都精確重現RED後集中修正：mdat全毀但檔頭仍在的MP4原本被接受，現在安裝前完整有界解碼；12秒錄音／4秒分鏡原本可匯出，現在API prepare與composition均拒絕。
- `test:short-video`、dev／production `test:short-video-ui`、`test:weaving`、`test:illustrated`、`test:liaojie-text`、`test:reading-knowledge-api`、build、tsc通過。lint 0 errors／2既有warnings。
- 375／390／430／320／1024px無橫向溢出；含空白／非空、未保存離開、失敗、衝突、時長不合、有效HTML、JSON重匯、回收欄位刷新、未知成品回應、正式成品與聊解交接。
- Hyperframes check無error，有3項nested SVG timeline warnings；foreground preview HTTP200，實際render已完成。不是strict零warning宣告。
- 最終MP4 1080×1920、30fps、12.01s、H264／AAC／yuv420p，約2.2MB，實際解碼可讀。Reels檢查音量未通過：測試純音約-32.2LUFS；保留原樣，不將試片算社群音量品質定稿。
- 測試Chromium沒有H264/AAC解碼器，因此UI驗證不支援提示／下載接續；FFmpeg真實解碼另驗證檔案。未宣稱瀏覽器或本人iPhone已播放。

## 裁定與代價

1. 站內編輯／預覽、外部Hyperframes渲染回收，沒有付費自動產片API；代價是需點點或外部工具完成渲染。
2. 原先ffprobe驗證在審查後補ffmpeg完整解碼；60秒timeout、2 decoder threads、file only，SHA讀回保證原內容，Range不重解碼；代價是上傳較慢，正式環境須提供兩個工具及共用持久磁碟。
3. 相對聲音檔＋data-no-timeline／paused WAAPI由真實CLI試製確認；HTML與聲音需一起放置，非單一HTML含聲音。
4. 完整UTF-8 head解決編譯亂碼，隔離例使用OFL Noto子集；一般輸出依渲染環境字型，跨裝置需另核對。
5. 三項nested SVG warnings接受每鏡一列；外部Studio尚非逐素材自由剪輯器。
6. 保留低音量非語音測試音；正式配音仍需聲音品質、音量與聽感驗收。
7. 現有Chromium不支持H264，採明示提示與FFmpeg真解碼；真機Chrome／Safari／iPhone待驗。
8. 獨立review未判定production build、部署磁碟／probe、真機媒體、live Notion與本人聲音品質；build由實作者另驗證，其餘沒有隔離證據就不宣稱完成，正式環境仍有差異風險。

無延後Minor，沒有第二次審查。正式Notion、社群、帳號、計費均未改動，也沒有重試先前取消的Railway套用。

## 下一包

Podcast：接固定原稿、節目稿／段落／剪輯註記、本人音訊匯入、實際音檔回收與聊解交接。先用明示隔離聲音完成獨立工具測試；本人的錄音與最終選題仍由本人提供。其後短漫、長影片、整合驗收；不因缺本人音訊停止其他獨立建置。
