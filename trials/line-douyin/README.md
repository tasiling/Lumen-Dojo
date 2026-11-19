# 野採抖音剪藏測試站

此目錄是一個獨立部署的野採採集匣，使用自己的 SQLite volume。正式版合併前可在測試頻道以相同的 LINE 入口路徑、野採素材連結及 Mac BiliNote 驗收。

用 Node 24 執行 `node server.mjs`。設定 `ACCESS_KEY`、`TRIAL_DATA_DIR`，並以 `TRIAL_ORIGIN` 指定外部 HTTPS 來源，Railway 也可使用 `RAILWAY_PUBLIC_DOMAIN`。將 volume 掛載到 `TRIAL_DATA_DIR`。服務只處理單一擁有者的測試資料。

1. 在 iPhone 或 Mac 開啟測試站並登入。輸入抖音分享文字會建立素材，直到配對的 Mac 就緒才領取工作。
2. 在 Mac 打開「連接 Mac 與 LINE」，下載配對檔並在十分鐘內執行。這會註冊使用者的 LaunchAgent。維持原有的 Docker、BiliNote 與 Chrome/Chromium/Edge/Brave 安裝。移除連線可在終端機執行 `launchctl bootout "gui/$(id -u)/app.yecai.douyin-trial.worker"` 並移除該 LaunchAgent plist。配對新 Mac 會使舊 Mac 的工作憑證失效。
3. 在測試服務設定專用的 `TRIAL_LINE_CHANNEL_SECRET` 及 `TRIAL_LINE_ACCESS_TOKEN`。在該測試頻道設定 `/api/integrations/line/webhook` 的完整 HTTPS 網址、Verify 並啟用。登入頁面取得一次性 LINE 配對碼，在測試帳號一對一聊天室送出。亦可設定 `TRIAL_LINE_USER_ID` 預先限定使用者。
4. 從 LINE 分享另一支公開影片，點「查看這筆素材」。核對片段、筆記、重貼與離線接續。網頁測試和 LINE 共用相同的入匣、排程與寫回操作。

SQLite 將素材、網址映射、事件、租約及帶時間戳的結果保存於同一個資料庫。Mac 經 HTTPS 主動領取工作，傳回文字與時間戳。音影片僅送至本機 BiliNote 的檔案轉錄 API。重新取得任務會用原素材編號及嘗試次數恢復 BiliNote 任務。

執行 `node --test tests/*.test.mjs` 驗證簽章、私人資料存取、配對、派工、重送、重複來源與寫回。具有 FFmpeg 的環境可執行 `python3 tests/test_mac.py` 驗證真實音檔處理、BiliNote 檔案介面及恢復機制。自動測試使用轉錄回覆及 LINE 傳送端的測試替身。
