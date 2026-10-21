# 第五包：可製作與匯出的圖文

2026-10-21；開發分支 `codex/weaving-liaojie-creation-v2`，接續 PR101。這是可審閱程式與隔離成品，尚未正式上線。

## 使用路徑

1. 織光堂→圖文製作，選擇一份已固定的文字成品；也可從文字工作區選定成品直接進入。
2. 逐頁填標題與正文，加入圖片，調整頁序、版型、配色與完整顯示／裁切重心。
3. 記錄圖片來源、製作工具／提示與公開確認；保存新版本，預覽全部頁面。
4. 核對人物、私密細節及引用，生成並保存每頁 1080×1350 PNG；可以逐頁下載。
5. 下載包含原圖的可修改 JSON，之後在同一原稿重新載入；或送往聊解室，保留固定圖片版本與配文。

原文字成品不會改寫，一個題材不會自動轉所有媒體或平台。這包最多12頁，兩種受控版型、4:5；圖片生成先用外部工具，再匯回產品。不是站內自動生圖或任意畫布。

## 真正的試製成品

- `creative-illustrated-evidence/assets/rain-sprout.png`：內建 imagegen 實際生成的隔離配圖。
- `creative-illustrated-evidence/page-1.png` 至 `page-3.png`：實際產品 SVG→PNG，不是占位圖或提示詞。
- `creative-illustrated-evidence/editable-source.json`：保留頁序、文字、版型、來源與內嵌原圖，已實際重新匯入。
- `creative-illustrated-evidence/workspace-{320,375,390,430,1024}.png`：production 實際介面；另有空白畫面。
- `creative-illustrated-evidence/SOURCE.md`：題材、工具、提示、調整與環境邊界。

## 可靠性與驗收

固定來源、不可覆寫版本、輸出歷史與聊解參照分開。PNG、JPEG、WebP 單圖8MiB，真正解碼核對；內容 SHA256、owner 認證、私有 no-store 讀取。圖檔以完整 fsync 後原子安裝保存，沒有持久磁碟設定則拒絕。來源與每張圖片的公開許可在副作用前核對。

獨立唯讀全包審查 0 Critical／5 Important／1 Minor；一次集中修正，沒有另開第二次審查：

| 發現 | 修正與證據 |
|---|---|
| 部分輸出重試繞過撤回的公開許可 | 最後索引寫入前在共用鎖內重核；fixture 重現已建 output、索引未寫、撤權、原操作重試403，歷史 output 保留 |
| 衝突後只有 draft 更新、version ID 過時 | 比較後的兩個選擇同步完整 bundle 與目前 output；UI 另一視窗保存後可讀入、再預覽並生成 |
| 輸出完成但回應遺失、不能找回 | 重做前唯讀讀取目前版本成品，恢復下載／交接；UI 丟棄已成功回應再試，不另建輸出 |
| 寬英文字母通過行數檢查卻被裁切 | 保守字寬換行，匯出前再檢查實際 SVG 邊界；23個m、混合中英文字回歸 |
| SVG 與 canvas 連續空格不同 | 文字節點明確 preserve，Tab固定展開；1080px逐行寬度及中文字像素比對 |
| 固定文字成品缺少圖文入口 | 文字定稿／交接區新增帶 completionId 的連結 |

補充：初次測試在 dev 熱更新期間被重載，之後以不變程式及 production 重新驗收。窄預覽文字會有瀏覽器字型微調，寬度精確比對使用匯出的1080px尺寸，不把不同縮放比例的像素差異當成文字變更。

通過：`npm run test:illustrated`、dev與production `test:illustrated-ui`（最終修正後production）、`test:weaving`、`test:liaojie-text`、`test:reading-knowledge-api`、`test-creative-source-settings.mjs`、`test-creative-proposals.mjs`、`npm run build`、`npx tsc --noEmit`。ESLint 0 errors，2個既有warnings。空白／非空、未保存離開保護、保存失敗、衝突比較、未知成品回應、JSON匯入、定稿／交接與五尺寸無橫向溢出均覆蓋。

## 裁定與尚未驗收

- 已授權 Native 實作與 feature push／PR，不重複詢問常規同意；正式發布仍依具體版本授權。本包未 merge/deploy，未重試先前取消的 Railway 套用。
- PNG 是 owner 瀏覽器從共用 SVG 生成，伺服器核對版本／頁序／圖片格式與尺寸，不獨立證明像素內容符合文案。這是明確的可信本人客戶端邊界；日後其他渲染客戶端需獨立的輸出簽發／綁定設計。
- 未做正式 Notion 寫入、正式磁碟／跨主機驗收、社群發表或 iPhone 真機測試。QA注入Noto Sans TC；產品字型依裝置，不能把隔離截圖當成所有裝置均已驗收。
- 兩版型／單比例的代價是自由排版、其他比例、站內自動生圖留後續；沒有把提示詞當成已生成圖片。

下一包：短影音。不露臉腳本／分鏡、素材對應、本人配音匯入、字幕與外部剪輯試製，回收真正可播放的短片。缺少本人錄音時先用明示的隔離測試音訊驗證技術路徑，不冒充本人聲音。
