# 第七包交付：Podcast 製作與回收

已建置 `/weaving/podcast`，從織光堂與固定文字成品進入，沿用五步圖示與手機視覺。開發成果交同一[PR101](https://github.com/tasiling/Lumen-Dojo/pull/101)，尚未合併或部署。

## 使用流程

1. 選一份固定原稿，建立單集；填節目名稱、單集名稱、觀點與介紹，原稿保留。
2. 分段撰寫、排序節目稿及剪輯註記，原始逐字稿另外保留。可填剪後章節起秒，或留空。
3. 匯入本人WAV／MP3／M4A錄音與封面配圖，分別記來源及公開確認；預覽原音與方形封面。
4. 保存後下載可修改JSON、原始錄音、節目稿、章節檔、1080方形PNG，交點點或外部工具剪輯。換圖尚未載好會提示等待，避免輸出上一張圖；匯入製作包前必須保存目前修改，錯誤匯入保留原輸入。
5. 匯回真音檔，填工具與回收註記，實際播放並核對。時間較原音變動超過0.5秒，需另確認剪輯；章節必須遞增且在成品時間內。固定版本後可下載聲音／封面與送到聊解室，沒有自動上架或發布。

## 已驗證的行為

- 1–40段、128MiB／60分鐘音訊，Podcast獨立持久目錄；短影音既有64MiB／181秒規則不變。共用owner驗證、SHA、ffprobe metadata、ffmpeg有界完整解碼與Range，不接受影片當Podcast。
- 不可覆寫版本、同原稿防重、stale拒絕、未存離開、保存失敗保留、完整bundle衝突恢復、原操作marker唯讀找回、不重建副本。回收欄位跨刷新保存，候選音檔綁目前版本。
- 比較畫面含節目／觀點／介紹、原音播放器／識別／來源／公開確認、封面圖與製作紀錄、原逐字稿、稿、章節與剪輯註記，避免只看同名標題就選錯版本。
- 輸出與交接最後副作用仍同鎖重核來源政策／目前版／全部資產；partial撤權不能新增引用。原始音訊、固定文字與歷史成品不被改寫。
- 聊解室接收固定聲音、介紹、章節、封面下載及發布資料JSON，與文字／圖文／短片共存。固定封面目前需下載查看，尚未在接收卡內嵌顯示；此為保留的Minor改善。

## 真正的外部試製

虛構雨後小芽、明示非語音測試音，非Crystal錄音。FFmpeg skill已實際處理12秒原音：首尾各剪1秒→10秒，再兩階段音量處理。最終 `creative-podcast-evidence/final.wav` 為10秒、24000Hz mono PCM、480078bytes、-16.01LUFS、true peak -9.79dBTP；原音仍保存。真瀏覽器播放確認currentTime前進及duration，未把節目稿當錄音。

同一PodcastCover SVG實際產出1080×1080 PNG；刷新後固定成品與核對過封面的文字區pixel完全相同。`SOURCE.md`、原音／剪後音／成品、probe、dry-run及實際命令結果、原素材JSON、封面PNG及五尺寸截圖均保留。`node scripts/podcast-trial.mjs`已在獨立暫存實際重現，不需要付費API或帳號。

Podcast check無FAIL／3 WARN：未內嵌章節、無字幕軌、24000Hz而非44100／48000；章節另可下載JSON，未冒稱嵌入。這是技術測試音，不作正式人聲或供應商品質驗收。

## 審查與測試

一次fresh全包審查原為0 Critical／1 Important／2 Minor。依使用者選版時的實際影響，將「比較隱藏錄音與來源等差異」上調Important，兩項集中RED→GREEN修正：dirty JSON丟稿、比較全欄位。剩一項Minor為聊解室封面下載而非內嵌，正確PNG可取用，未阻擋交接；無第二次審查。

最終domain／real API、dev／production UI、圖片延遲競態、失敗JSON保留、五尺寸與真音檔播放通過；short-video、illustrated、weaving、liaojie-text、reading-knowledge-api相關回歸、原圖文production UI、build、tsc通過。lint0 errors／2既有warnings。375／390／430／320／1024無橫向溢出，涵蓋空白／非空、dirty、保存失敗／衝突、JSON重匯、回收刷新、時間變更、未知output／handoff、定稿／聊解交接。

## 裁定與代價

- 沿用已授權Native單一writer、自行完成設計／計畫與PR推送；本人仍需試用內容及真機，功能測試不是個人品味已核准。
- 站內保存製作資料、外部剪輯回收；128MiB／60分鐘而非自由DAW，較長或大型無壓縮錄音需先外部轉檔。
- 配圖載入須匹配目前assetId後才匯出，代價是需要等待或重試；不將占位或舊圖當新封面。
- Review未執行browser／Next；實作者已另驗證。live Notion、正式持久磁碟／ffmpeg、iPhone、本人錄音音質、供應商實際上架仍待驗收，隔離證據不足以宣告正式環境全通。

本包沒有正式Notion、社群、計費、merge/deploy或重試取消的Railway操作。下一包短漫：角色參考、分鏡、逐格圖片／對白與實際合成輸出；再接長影片及整合驗收。
