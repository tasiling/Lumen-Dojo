# 行光道場｜模擬測試檔

**野採目前測第 7 版。** 採集匣、「回看所拾」、Threads 十篇原帖與跨篇原文共讀屬於同一站。用手機可直接開[原測試站](https://yecai-inbox-review-1120.liiy21110.chatgpt.site)；要接手改程式，下載[野採採集匣 v7 原始碼與測資](yecai-inbox-v7.zip)。原站沿用既有存取權限。

下列版本核對於 2026-11-21。Sites 的版本號、HTML 內寫的版號與正式站版號各自獨立。這個目錄保存可編修的測試副本；需要本人驗收的項目仍留在測試階段。部分原站使用私人的書摘、日記、讀書討論或客戶資料，公開副本中的示例會在表中註明。

## 野採的四份檔案

| 要驗什麼 | 下載與來源 | 第一輪怎麼測 |
| --- | --- | --- |
| **採集匣、回看所拾、Threads 與原文共讀** | [v7 測試包](yecai-inbox-v7.zip) · [原站](https://yecai-inbox-review-1120.liiy21110.chatgpt.site) · `8088ef7` | 開 `/` 整理一筆採集；開 `/threads` 看原帖入口；開 `/reading` 匯入隨附的十篇示範原文，選兩段原文比對、保存連結理由，再匯出及還原筆記。原帖的來源連結與段落核對資訊保留；裝置上保存的原帖全文與私人筆記需由持有人匯入。 |
| **素材採集匣獨立版** | [v7 測試包](material-inbox-v7.zip) · [原站](https://quanzero-material-inbox-lab.liiy21110.chatgpt.site) · `4258e21` | 從空匣建立或匯入素材、整理與重開。`dist/` 是前端，`selfhost/` 是 Mac 伴隨服務；畫面內仍可下載原有的安裝包。需驗證跨裝置同步、擷取或 AI 時再啟動伴隨服務。 |
| **影片逐字稿試用** | [v2 測試包](yecai-transcript-v2.zip) · [原站](https://yecai-bilinote-trial.liiy21110.chatgpt.site) · `03455fe` | 播放示範短片，試手動貼回與 Mac 回傳示例，再重開原卡。裝置上實跑語音辨識前執行 `python3 prepare-model.py`，會下載並核對原版模型。公開包以合成語音與本機示範取代私人影片、Mac 位址；真實已配對 Mac 的收件另行驗收。 |
| **小紅書截圖・回看所拾** | [11/21 單檔測試](yecai-xhs-fieldnotes.html) · 獨立操作示範 | 用兩則素材的五張示例圖試跨頁定位、畫線、釘選與原文／整篇註記。沿用原測試模板，截圖與 OCR 換成同結構自寫測資。尚未確認獨立試用站網址。「雙欄＋創作範例簿」仍待另一份可操作版本驗收。 |

### 本機開啟野採第 7 版

從 repo 根目錄執行以下三行。使用 Node 22，這份模擬版可直接啟動。

```sh
unzip simulations/yecai-inbox-v7.zip -d /tmp/dojo-yecai-v7
cd /tmp/dojo-yecai-v7
npm run dev
```

開啟 [採集匣](http://127.0.0.1:5173/)、[十篇原帖](http://127.0.0.1:5173/threads) 或 [原文共讀](http://127.0.0.1:5173/reading)。套件內的 `README.md` 有操作順序和測試指令，`fixtures/` 同時保存十篇自寫原文、原有的 5,000 筆壓測資料、HTML 和 Safari 封存格式範例。移到新裝置前，先在原瀏覽器匯出備份。

## 創作、閱讀與覺察

| 模擬檔 | 版本與開啟位置 | 測試重點及資料差異 |
| --- | --- | --- |
| [織光堂與聊解室・創作流程](creative-studio-v16.zip) | [原站 v16](https://lumen-creative-studio-trial.liiy21110.chatgpt.site) · `5d70a90` · 解壓後開 `index.html` | 從織光杼接到文字、圖文、漫畫、影片或音訊，試 A／B／C／D 與 D 心智圖。公開副本以虛構工作坊替換本人逐字稿、客戶及私人筆記。 |
| [織光堂與聊解室・草稿操作測試](creative-draft-v23.zip) | 檔內標示第 23 版；解壓後開 `weaving-liaojie-media-test.html` | 驗證 B 指令複製、草稿帶回、研究採用、討論與媒體分流。隨附 `lumen-v20-six-stage-comparison.html` 對照早期六階段規劃。公開副本以系統字型顯示。 |
| [閱讀筆記與心智圖](reading-map-v3.zip) | [原站 v3](https://lumen-reading-map-lab.liiy21110.chatgpt.site) · `dfb7ce8` · `index.html` | 從原文與筆記出發，用閱讀技巧比較觀點，檢查心智圖節點能否回到來源。公開副本附示例素材。 |
| [心知閱讀討論試習](reading-discussion-v11.zip) | [原站 v11](https://xinzhi-reading-trial-1118.liiy21110.chatgpt.site) · `eaeaa27` · `index.html` | 試讀次、選段、討論帶回、學習關聯與書頁 OCR。公開副本使用示例書頁與學習資料；本機辨識資產的準備方式見包內說明。 |
| [心・情覺察日記](heart-journal-v3.zip) | [原站 v3](https://lumen-dojo-heart-journal-mock.liiy21110.chatgpt.site) · `e8c688a` · `index.html`，另有 `offline-v1.html` | 檢查推薦格式、完整問答回看及帶回結果。公開包用示例對話，原站由本人登入後使用真實紀錄。v1 可獨立試暫存／完成兩種回傳。 |
| [覺察日記與道藏](awareness-dao-v1.html) | [原站 v1](https://lumen-awareness-preview.liiy21110.chatgpt.site) · `41855c3` · 單一 HTML | 試覺察與道藏之間的入口、候選及回看；沿用原模擬檔的虛構測資。 |

### 另存的兩個早期專項

這兩份仍可獨立復測。最近可核對的試作時間是 11 月 4–5 日，是否繼續本輪驗收待本人確認。

| 專項 | 下載與原站 | 用途 |
| --- | --- | --- |
| 織光堂圖文與簡報風格 | [v1 測試包](weaving-style-v1.zip) · [原站](https://weaving-style-lab-20261105.liiy21110.chatgpt.site) · `76fc218` | `dist/index.html` 測 4:5 圖卡、16:9 簡報、預覽與輸出。公開副本改用虛構書店內容。 |
| 聊解室閱讀與觀點探索示範 | [v3 測試包](liaojie-reader-v3.zip) · [原站](https://liaojie-reader-demo-20261105.liiy21110.chatgpt.site) · `5521cc8` | `dist/index.html` 測讀者側的選讀、搜尋與回看，保留原始示例及測試。 |

## 其他檔案怎麼開

GitHub 手機預覽顯示的是程式碼。要直接操作請使用表中的原站；接手 AI 可在 checkout 解壓 ZIP，取得 HTML、JS、樣式及必要資產後修改。每個 ZIP 各自解到空目錄，以免同名檔案相互覆蓋。

純前端模擬檔可在含 `index.html` 的目錄執行 `python3 -m http.server 8000 --bind 127.0.0.1`，再開 `http://127.0.0.1:8000/`。獨立素材採集匣、兩個早期專項的靜態入口在 `dist/`；野採第 7 版請用上方 Node 指令，以便同時啟用它的 HTTP 路由。瀏覽器測試資料依網址／裝置保存；不同模擬版可使用不同本機埠，正式站的環境憑證留在正式服務。

## 這批已驗證的範圍

- 野採 v7 的三個入口均在本機回應 HTTP 200。用隨附測資實跑 5,010 篇、10,056 個段落的分頁和搜尋、四種閱讀方式、備份及重複還原。小紅書截圖示範另通過 40 項切換與定位檢查。
- 素材採集匣完成 27 項 JavaScript 和 14 項 Python 測試。影片逐字稿試用從空目錄下載並核對 10 個引擎／模型檔後，以測試 MP4 的音軌跑過真實 Whisper 辨識；同源回傳、儲存和重載另用測試視窗驗證。
- 以 DOM 互動測試逐項開過創作工作室 A／B／C／D、五種媒體入口、閱讀筆記與心智圖、心・情日記及道藏。心知閱讀試習的 27 項程式測試通過，橫排／直排 OCR 另以 Node worker 測過。這批未做 iPhone Safari 真機驗收。

正式功能的入口、資料歸屬及部署設定見 [HANDOFF.md](../HANDOFF.md)。
