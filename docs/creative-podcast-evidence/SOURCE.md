# Podcast 隔離製作紀錄

使用虛構雨後小芽題材，原音承接第六包本機非語音提示音；**非Crystal本人錄音，不含語音模仿**。圖片承接第五包實際imagegen生成的雨後窗邊小芽水彩圖，來源、提示及原圖保留，不外送私人日記。

- `original.wav`：12秒、24000Hz、mono PCM，保留未改寫。
- `edited.wav`：FFmpeg skill `cut.py --start 1 --end 11 --accurate`，移除首尾各1秒；音訊重新PCM編碼，sample precision、實測10秒。
- `final.wav`：`loudness.py -I -16 --tp -1.5`兩階段處理，10秒、24000Hz mono PCM、480078bytes、-16.01LUFS、true peak -9.79dBTP。
- `original-probe.json`、`final-probe.json`、`cut-plan.json`／`cut-result.json`、`loudness-plan.json`／`loudness-result.json`保存實際讀取、dry-run與輸出；不是只寫命令或節目稿。
- `podcast-check.json`：無FAIL，三項WARN為章節未嵌入、沒有字幕軌、24000Hz而非44100／48000。這份技術測試音不當作正式人聲品質驗收；沒有音樂或人物聲音。章節另存JSON可下載，未宣稱已嵌在WAV。
- `cover.png`／`fixed-cover.png`：產品同一PodcastCover SVG在真瀏覽器匯出1080×1080 PNG，含實際繁中與配圖；QA使用Noto Sans TC。一般產品字型依裝置，跨裝置仍需核對。刷新後固定PNG與已核對封面的文字區pixel完全一致。
- `ui-source.json`：產品實際下載的可修改素材包，含固定原稿fixture身分／digest、版本、段落稿、剪輯註記、原逐字稿、原錄音、配圖與來源。可重新匯入，不是正式本人作品。
- `empty-390.png`／`workspace-375/390/430/320/1024.png`：實際產品React／CSS手機流程，沒有另畫示意圖。

## 重現

在repo根目錄執行 `node scripts/podcast-trial.mjs`，預設只在獨立暫存建立本輪來源／輸出，保存原音。可用環境變數FFMPEG_SKILL_DIR指定已安裝技能根目錄；用probe、dry-run、真cut、dry-run、真loudness、check的同一順序。兩個媒體處理步驟，不建立帳號、訂閱或計費API。

## 報告

Done: final.wav — 10秒、PCM mono、24000Hz、-16.01LUFS。
Steps: probe → 首尾各剪1秒 → -16LUFS音量處理 → probe／Podcast check。
Check: 0 FAIL／3 WARN，細節如上。
Look: 音訊不需要畫面檢查；cover.png已目視繁中、圖片與邊界。
Notes: 隔離非語音音訊，未驗收本人錄音、iPhone、正式磁碟／工具、實際Podcast供應商上架。
