# 短影音隔離試製紀錄

此題材及素材為虛構隔離驗收，未讀取私人日記；沒有真人出鏡。音軌是本機生成的非語音提示音，**不是Crystal錄音，也不是聲音模仿**。

- 圖：承接第五包已生成 `../creative-illustrated-evidence/assets/rain-sprout.png`，原圖、提示與來源紀錄保留於第五包。
- 分鏡：`storyboard.json`，三鏡各4秒；第一／三鏡輕浮動、第二鏡紙片微轉。原始逐字稿、改寫口播與字幕各自保留。
- 原素材包：`project-source.json`，包含原圖及聲音；`ui-source.json`是實際產品下載的同格式包，另有fixture固定原稿／版本身分。兩者不可當正式私人作品。
- 聲音：`test-tone.wav`／`voice.wav`同一12秒24kHz PCM提示音，明示測試來源。
- 製作：Hyperframes **0.8.181** 本機，1080×1920、30fps、12秒；無付費帳號／API／雲端render。使用同一 `sceneSvg`／`motionTransform`／`compositionHtml` 契約，不另畫假UI影片。
- 回收：原Hyperframes MP4約20.3MB，再以FFmpeg skill `export.py --preset reels --crf 24`壓為 `final.mp4` 約2.2MB。H264／AAC／yuv420p／BT709，12.01秒。製作工具應記作「Hyperframes 0.8.181 → FFmpeg」。
- 驗證：`hyperframes-check.json`無error，有3項nested SVG timeline warnings；每鏡一列，非自由多層編輯器。`preview-check.txt`記錄foreground預覽HTTP200；background模式在此執行環境無法持續存活，不宣稱已提供常駐預覽。
- 字型：隔離試片嵌入Noto Sans TC子集，來源Google Fonts，授權 `OFL.txt`。子集改名 `NotoTC-subset.ttf`、只供本例字元。正式產品依裝置字型；一般HTML需另確認渲染環境中文字型，非所有裝置像素一致。
- `probe.json`為最終檔實測。`decoded-contact-sheet.png`為Hyperframes原輸出實際解碼，`decoded-6s.png`為壓縮後最終檔解碼；已目視繁中、分鏡順序、字幕與動作，沒有把HTML快照當成MP4已成功。
- `reels-check.json`與`ffmpeg-export.json`清楚保留**音量未通過**（約-32.2 LUFS，測試純音不放大），沒有可切換字幕軌但有燒入字幕＋`captions.srt`。這是技術試片，不是社群品質定稿；本人錄音需另外檢查音量與聽感。
- `browser-playback.json`：當前Playwright Chromium缺少H264/AAC解碼器，因此驗證不支援提示與下載接續；不聲稱此瀏覽器已播放。檔案已由FFmpeg實際解碼，正式Chrome／Safari／本人iPhone仍待真機驗收。

## 可重現

在repo根目錄 `node scripts/short-video-trial.mjs` 產生 `/tmp/lumen-short-video-trial/index.html` 與 `voice.wav`。字型子集及原圖均由repo讀取，無外送資料。

以Hyperframes0.8.181執行 `check`、`snapshot`、`preview --foreground`、`render --quality looks --fps 30 --workers 1`；需要可用Chrome（本例指定現有headless_shell路徑）。完成後用FFmpeg skill probe／check／look核對。一般使用者從產品下載HTML、音訊、SRT或製作包，交點點／外部工具製作，再匯入真MP4固定及交接。

## 正式環境仍需

共用持久磁碟、ffprobe及ffmpeg解碼器、owner認證、瀏覽器媒體播放、本人的錄音與內容審閱。此包未merge/deploy，未修改正式Notion或社群發文。
