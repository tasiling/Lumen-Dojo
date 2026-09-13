# 行光道場｜LINE 剪藏入口第一階段

## 定位

LINE 只作為「擷取」的外部入口。網址進入既有野採採集匣；單獨圖片先進英文影像匣，
只有使用者主動選擇「一般剪藏」才轉進野採。不會自動建立織光案、今日三件事或週盤格。

## 支援範圍

- 純網址：保存網址，嘗試擷取標題、描述、預覽圖與平台。
- 純圖片：原圖上傳到獨立英文影像紀錄，不保存於 Railway 暫存磁碟；可分為遊戲英文、英文日常或一般剪藏。
- 補截圖：網址剪藏回覆中的「補截圖」按鈕會開啟十分鐘附加窗口。
- 用途：內容觀點、視覺參考、學習資料、待研究、先收著。
- 去重：LINE message ID 與正規化網址重複時不建立第二筆。
- 安全：驗證 `X-Line-Signature`，並只接受 `LINE_ALLOWED_USER_ID`。

英文類型圖片會由 GPT-5.6 Luna 做 OCR、圖像理解與英文整理；一般剪藏不分析。
原圖與原始網址永遠保留，後續摘要不會覆蓋它們。

## Railway 環境變數

```text
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_ALLOWED_USER_ID=
OPENAI_API_KEY=
OPENAI_ENGLISH_IMAGE_MODEL=gpt-5.6-luna
OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD=2
```

第一次設定時可先留空 `LINE_ALLOWED_USER_ID`。完成 LINE webhook 驗證並傳一則訊息給
機器人後，它會回覆該帳號的 user ID；把它填回 Railway 後重新部署即可。未設定擁有者
期間不會寫入任何擷取資料。

## LINE Developers 設定

Webhook URL：

```text
https://lumen-dojo.up.railway.app/api/integrations/line/webhook
```

啟用 webhook，並關閉 Official Account Manager 內與剪藏入口衝突的自動回覆。
## 英文影像匣延伸

單獨傳入 LINE 的圖片預設不進野採，而是先寫入 `行光英文影像-` 紀錄。使用者可在 LINE 選擇「遊戲英文」、「英文日常」或「一般剪藏」；前兩者留在修習所的英文影像匣，後者才把同一個 Notion 頁面轉為 `行光捕捉-`，因此原圖不會遺失或重複保存。

選擇英文類型後，系統以 OpenAI Responses API 的圖片輸入與嚴格 JSON Schema 一次完成英文 OCR、B1–B2 事件紀錄、中文解釋與可學詞句。原圖永遠保留；辨識信心低或 API 失敗時只改變分析狀態，不覆蓋或移除圖片。

Railway 需設定：

- `OPENAI_API_KEY`：OpenAI Project API key。
- `OPENAI_ENGLISH_IMAGE_MODEL`：預設 `gpt-5.6-luna`。
- `OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD`：預設 `2`，依已完成紀錄的 token 用量估算本功能當月支出並停止新分析。這是應用端防護，不等同 OpenAI 帳戶的硬性消費上限。

每張圖自動分析一次；重新分析只能由英文影像匣手動觸發，且介面會先提示再次使用 API 額度。`store: false` 固定關閉 Responses 儲存。
