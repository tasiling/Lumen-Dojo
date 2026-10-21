# 第九包獨立審查與集中修正

一次fresh `gpt-6-astra` read-only review，範圍Native `d93bf26..90f5c05`，依本包spec／plan及Review Focus，不是僅最後一個提交。審查者未寫checkout、未啟動共享Next build/UI，也未再派reviewer。原評級0 Critical／2 Important／3 Minor；作者按使用者影響重評後維持此分級。

審查獨立重跑long-video domain／API通過；另以兩份不同SHA、不同長度的真WAV及換序章節核對duration map、HTML start/src與錯音長拒絕，通過。這不是本輪試片已使用多份不同人聲的宣稱。

## Important集中修正

1. 圖片、原音及MP4原生input未清空，同檔重試／跨章再選同音檔不觸發change，候選成品也無法同檔重新綁新版。已用真UI重現`C:\\fakepath\\voice.wav`未清除；改為先捕捉File並立即清除input值，才呼叫上傳。Focused真UI確認同一原音可加入兩章，圖片／MP4亦清空。
2. 原JSON無整體預算，20×180秒／48kHz stereo PCM16可符合一小時及單檔上限，但base64約921.6MB超過原768MiB匯入門檻。採用明確整包上限，非縮減已保存專案容量：JSON／HTML下載前由owner目前版endpoint取得資產長度，估算metadata及base64；音訊先stat、不把全部原音拉進瀏覽器才算。JSON按獨立SHA去重，HTML另計逐章嵌圖；兩者最終Blob再核256MiB。JSON匯出／匯入共用256MiB常數，過大時有分章原音／畫面／字幕／腳本及外部壓縮後另存的入口，不建立無法重匯的包。

第二項有domain20段真實PCM大小案例、API目前版／revision／實際兩項去重資產預算，以及UI阻止預算413前不序列化／下載的RED→GREEN。fixture只模擬超額回覆以驗client順序，不假裝在手機配置921MB；算術邊界與真API metadata另外驗證。最終完整測試與提交見plan Ledger／creative-build-progress，沒有第二次review。

## 保留Minor

- 衝突讀入遠端換序稿後，selected與preview time可能指向不同章；PNG匯出會拒絕，需重新點選章節。沒有默默匯出錯章。本輪保持Minor，列第十包整合改善。
- 延遲的A企劃GET可能在B載入並開始編輯後覆蓋active選擇；本機稿暫存降低永久遺失，仍需重新開回B。補load generation guard列整合改善。
- 固定自動回歸仍共用一個voice asset；reviewer獨立的不同真音檔案例已通過，尚未納入固定suite。這是覆蓋缺口，非已發現聲音對應錯誤。

## Considered and set aside：作者裁定

- Final: Ruling: 每次GET完整解碼 — 安裝已完整解碼、讀取仍核SHA，正常使用不新增解碼負擔 — 若磁碟不符合immutable設計，應另查正式環境。
- Final: Ruling: 已完成operation在撤權／改版後replay — 僅找回已確認結果，不增加引用，保留恢復價值 — 必須持續維持marker與零新增約束。
- Final: Ruling: ±0.5秒時長誤差 — 採已確認規格，拒絕明顯錯章／裁音 — 本人仍要核對聽感及編碼尾端。
- Final: Ruling: HTML一般瀏覽器播放器 — 明示外部renderer交付，下載不代表MP4 — 外部工具／字型仍須另驗。
- Final: Ruling: 240秒試片使用靜態PNG — 只聲稱章節／音訊／回收驗證，未聲稱長動畫已渲染 — 作品藝術品質不由本片代表。
- Final: Ruling: 滿額效能／本人聲音／真機 — 已在spec／delivery明示未驗，不用4分鐘fixture推論一小時流暢 — 上線與本人內容驗收仍需補。
- Final: Ruling: 每尺寸完整流程 — 只聲稱每寬選章及排版，主要390／後段1024完整互動 — 特定裝置仍可能有未覆蓋差異。
- Final: Ruling: 正式Notion／deploy／計費／社群 — 不屬本包執行範圍，沒有冒用舊發布同意 — 本包交付仍為PR開發成果。
- Final: Ruling: 全檔排版重構 — 沿用同類模組結構，本輪以功能邊界與驗證為範圍 — 後續維護可另安排，未把可讀性重構混入本包。
