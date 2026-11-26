# 行光道場開發交接

核對日期 2026-11-21（墨爾本）。GitHub 預設分支 `master` 與 Railway 正式服務當時成功部署的版本同為 `e97d353`。以下「正式版」指這份程式碼；使用者的手機驗收及外站收件結果另列。日後接手時，先比對 `master` 與 Railway 成功部署的 commit。 [程式基準](https://github.com/tasiling/Lumen-Dojo/commit/e97d3534b5b53e6efc7a089ef06a2e6ebfa6e4cb)

**要接手模擬測試，從[模擬檔索引](simulations/README.md)開始。** 索引附各版本的原始試用站、可下載的檔案、啟動方式及待驗項目，野採列在最前面。 要接手原文共讀、閱讀心智圖或手機介面調整，從 [Skill 原檔與測試入口](skills/README.md) 選取對應指引。

## 產品與正式入口

行光道場是全零自用的繁體中文、手機優先工作站。擁有者在同一處記下生活、做練習、收進素材，把閱讀發現發展成作品，並管理自己的內容與服務。個人日誌和創作排程可以同日出現在行事曆，各自保有資料來源和進度。

| 已上線的入口 | 使用者實際可以做什麼 |
| --- | --- |
| 今天 `/`、行事曆 `/calendar`、週盤 `/bingo`、回看 `/review`、收光 `/closing` | 記晨間計畫、白天實際行動、晚間日記，從週盤排入今天或以真實紀錄連回進度。底部「新增」依當前頁面開啟。 |
| 修習所 `/practice`、心知閱讀 `/reading` | 管理學習項目、階段與修習紀錄。書架以讀次為單位，可整理畫線與跨頁摘錄、寫筆記、從選段和 GPT 討論，再確認要保存的觀點與洞察。心・情從 `/practice/emotion` 進入。 |
| 野採 `/forage`、一般採集匣 `/forage/captures`、英文影像匣 `/forage/english` | 收文字、網址、圖片及 LINE 剪藏。「回看所拾」整理來源與去向。書頁可送心知閱讀，英文可送語境修習室或 VocabForge；遊戲介面保留逐張原圖、操作條件與證據。 |
| 織光堂 `/weaving`、聊解室 `/liaojie` | 從真實材料試讀、觀點卡與 GPT 討論立杼；編修文字、圖文、漫畫、短片、長片或 Podcast。聊解室可管理服務、承接固定版本、準備平台文案並記錄實際發布結果。 |
| 道藏 `/dao` | `/dao/explore` 跨筆記、洞察與主張查找；`/dao/knowledge` 審閱候選主張、適用界線、採用版本及歷史。 |
| 內容生產後台 `/backstage` | 日上三更、Session 與明細、組稿、序列展開、生產日、回饋評分及噗浪蓋樓。舊規格的 P3、P6 已有 `/production-day`、`/feedback` 與對應 API。 |

閱讀、洞察、知識主張和作品有不同的身分；同一段原話拆出的兩張卡仍是同源。名詞與舊路由的沿革可從這兩份文件追溯。 [用語表](GLOSSARY.md) · [主站整合決定](docs/schema/行光道場正式版整合.md)

## 進行中、待驗收與下一步

| 狀態 | 接手工作與完成條件 |
| --- | --- |
| 已合併，優先做手機驗收 | 織光堂與聊解室已切至工作室首頁，真實材料及織光杼 GPT 討論也已接上。用一張本人允許的卡從首頁立杼，分別建一篇文字與一份漫畫，實際走過帶入素材、保存、重開、定稿與回杼。這能定位先前回報的「選了形式之後無法接著做成品」。 [#127](https://github.com/tasiling/Lumen-Dojo/pull/127) · [#128](https://github.com/tasiling/Lumen-Dojo/pull/128) |
| 模擬版先行，待本人確認 | 正式工作室目前的 A 為診斷草稿／確認意圖，B 為研究與主文或媒體腳本，C 為確定稿轉譯，D 為從成品建立知識脈絡。[創作流程模擬 v16](simulations/creative-studio-v16.zip) 已可操作 A／B／C／D、D 心智圖及五種媒體通道。下一輪由本人逐一核對各工具的輸入、GPT 回傳、採用與保存位置。草稿 PR 有另一版原生編修流程，移植前先逐項比對。 [目前按鈕](public/weaving-studio/workspace.js) · [指令對應](public/weaving-studio/diamond.js) · [草稿 PR #114](https://github.com/tasiling/Lumen-Dojo/pull/114) |
| 已合併，跨服務實測待核對 | LINE 收圖重試及遊戲介面教材已進主線。用一組多圖核對原圖順序、截圖分類、目的地、語境修習室重開後的內容；另核對送 VF 的表達、目標豆倉與接收端詞卡。抖音的正式入口在 #126，#125 是另一個獨立試驗；完整轉錄需已配對且在線的 Mac。 [#129](https://github.com/tasiling/Lumen-Dojo/pull/129) · [#130](https://github.com/tasiling/Lumen-Dojo/pull/130) · [正式 #126](https://github.com/tasiling/Lumen-Dojo/pull/126) · [試驗 #125](https://github.com/tasiling/Lumen-Dojo/pull/125) |
| 部分已做，仍有分支或規劃 | 閱讀書架、歷史討論成果與跨書搜尋已進主線；閱讀卡片的手機操作另有開放中的 #123，先比對目前卡面。心・情的「GPT 依情境推薦日記格式、回看整輪本人原話」仍屬模擬驗收。書寫修習已有英文字型工作臺，逐筆動畫、描摹畫布與後續中文／左手細部練習列在 #109。 [閱讀 PR #123](https://github.com/tasiling/Lumen-Dojo/pull/123) · [書寫議題 #109](https://github.com/tasiling/Lumen-Dojo/issues/109) · [書寫交付範圍](docs/handwriting-workspace-launch-20261103.md) |
| 尚未交付 | 聊解室的對外自助預約／改期、安全交付門戶，以及舊工具媒體與排版的完整原生轉換仍待開發。現有服務管理由擁有者操作。 [創作與服務驗收紀錄](docs/creative-studio-acceptance.md) |
| 舊產線待辦 | P4 固定項目註冊器與 P7 修正提案審核台尚無獨立操作入口；現有 `/review` 是生活回看。P8 目前可組稿，批次呼叫模型自動生成屬後續階段。 [後台入口](app/backstage/page.tsx) · [組稿 API](app/api/generate) |

修習所另有四個較早的 R2 草稿 PR。要續做私密覺察、能力評核或學習成果回流，先逐項對照目前路由與測試，避免再併入後來已實作的部分。 [成果回流 #79](https://github.com/tasiling/Lumen-Dojo/pull/79) · [覺察 #83](https://github.com/tasiling/Lumen-Dojo/pull/83) · [評核 #84](https://github.com/tasiling/Lumen-Dojo/pull/84) · [整合 #85](https://github.com/tasiling/Lumen-Dojo/pull/85)

## 技術架構與目錄

Next.js 16.2.10 App Router、React 19.2.4、TypeScript、Tailwind CSS 4 和場域專用 CSS。頁面透過 Route Handlers 呼叫伺服器端資料層。Notion SDK 處理結構化紀錄，Node 檔案系統及 SQLite 承擔部分持久工作；媒體使用 Sharp、FFmpeg，書頁辨識使用瀏覽器端 Tesseract。 [套件與指令](package.json) · [建置設定](next.config.ts)

| 位置 | 改哪裡時看它 |
| --- | --- |
| `app/`、`app/components/`、`proxy.ts` | 頁面、底部導覽、手機表單、場域外殼與共用解鎖。`app/api/dojo/` 是主站資料操作；`app/api/integrations/` 是外部服務來呼叫的端點。 |
| `app/weaving/studio/route.ts`、`app/liaojie/studio/route.ts`、`public/weaving-studio/` | **正式創作首頁**。兩個 `page.tsx` 會轉址，這兩個 handler 產生 HTML，載入工作室 JS/CSS。`lib/dojo/weavingStudio/` 提供材料目錄及儲存。只改舊 React 工作台，使用者從首頁會看不到更新。 |
| `lib/dojo/` | 按功能找資料模型與服務。`formal.ts` 定義標題前綴、日期與舊資料預設；`notionStore.ts` 存取 DB-14 JSON；`learningFoundation/` 管寫入鎖與版本；`readingKnowledge/`、`weavingWorkflow/`、`creativeStudio/`、各媒體子目錄管理對應功能。 |
| `lib/notion/`、`lib/reading/` | Notion schema、client、屬性、查詢、寫入；書頁剪藏、書架、討論、選段及封存閱讀。`lib/generate/`、`lib/plurk/`、`lib/closing/` 分別負責組稿、蓋樓及收光。 |
| `lib/liaojieTools/`、`public/`、`assets/` | 原 HTML 工具、內嵌橋接與場域樣式；對外靜態資產及選單原圖。`next.config.ts` 明列應打包的原工具與 Mac worker 檔案。`public/reading-ocr/` 由開發／建置前置腳本產生。 |
| `scripts/`、`tests/`、`docs/` | 可執行測試、隔離伺服器、預覽及維護腳本；領域與契約測試；規格、交付紀錄、截圖與測試證據。歷史驗收的日期和分支會影響適用範圍。 |

### 資料存在哪裡

- **Notion** 保存任務、日記、閱讀及大部分業務紀錄。DB-14 的不同標題前綴對應不同型別，內容常為 JSON。查詢保留 owner、前綴及類型限制，避免把私人紀錄或系統 JSON 當作通用知識。 [資料層](lib/dojo/notionStore.ts) · [型別與前綴](lib/dojo/formal.ts)
- **Railway 持久磁碟** 保存學習寫入鎖與操作收據、閱讀討論及剪藏草稿、工作室的 `weaving-studio/workspace.json`、媒體原檔及抖音轉錄 SQLite 佇列。工作室目錄彙整 Notion 與磁碟兩邊的資料。SQLite 的根目錄優先取 `RAILWAY_VOLUME_MOUNT_PATH`，再取 `LEARNING_WRITE_LOCK_DIR`，其下為 `yecai-douyin/work.sqlite`。 [工作室保存](lib/dojo/weavingStudio/store.ts) · [閱讀討論](lib/reading/discussionStore.ts) · [轉錄佇列](lib/dojo/douyin/queue.mjs)
- **使用者裝置** 保存五個原 HTML 工具的 IndexedDB 草稿。兩個場域共用同一工具的草稿識別，換手機或瀏覽器需透過工具的備份匯出／匯入。正式工作室另有伺服器保存。 [原工具交付](docs/liaojie-original-tools-delivery.md)

## 本機安裝、執行與測試

在 repo 根目錄執行。建議使用 `.nvmrc` 的 Node 22 最新修補版；本次驗證使用 22.23.5。`package.json` 的 Node 下限只涵蓋部分程式，抖音佇列還會載入 `node:sqlite`。處理音影片需讓 `ffmpeg` 和 `ffprobe` 可從終端執行。

```sh
nvm install
nvm use
npm ci
```

若要操作頁面，在被 Git 忽略的 `.env.local` 私下設定 `ACCESS_KEY`。需要讀寫業務資料時，再準備測試用 `NOTION_TOKEN`、有權限的測試資料來源，以及 `LEARNING_WRITE_LOCK_DIR` 指向的可寫絕對目錄。多數 Notion data source ID 在程式的 schema 對照裡；更換整合憑證本身不會換庫。只跑下列隔離測試可直接使用乾淨 checkout。 [變數範本](.env.example) · [資料庫對照](lib/notion/schema.ts)

```sh
npm run dev
```

開啟 `http://localhost:3000/unlock`，用本機設定的金鑰解鎖。要驗證接近正式環境的建置，在同一目錄執行以下指令。一般 `npm run start` 會先嘗試設定 LINE Rich Menu；本機測試時把正式 LINE 憑證留在正式服務。

```sh
npx next typegen && npx tsc --noEmit && npm run build
npm run start
```

`npm run` 可列出所有腳本。專案以功能分組執行測試，沒有統一的 `npm test`。以下是交接基準上實跑的結果。

| 測試 | 本次結果 |
| --- | --- |
| 正式建置指令及 `npm run start` | 通過。以本機隔離程序驗證解鎖、受保護 API、織光堂與聊解室轉址，及兩個工作室的 HTML。 |
| `npm run test:weekly`、`npm run test:reading-knowledge`、`node scripts/test-reading-shelf.mjs` | 通過週盤、閱讀來源／關聯及書架檢查。 |
| `npm run test:english-images`、`npm run test:unit-arrangement` | 通過多圖收件、遊戲教材、派送與重試的隔離測試。 |
| `node scripts/test-weaving-studio-v12.mjs`、`node scripts/test-line-douyin.mjs`、`node --test tests/threads-reader.test.mjs` | 通過卡片來源與工作室保存、Mac 佇列、Threads 原文解析的隔離測試。 |
| `node scripts/test-reading-clips.mjs` | **失敗**。測試替身缺 `findKnowledgeEntryByTitle`，兩張 LINE 書頁的案例在 `entries.size` 斷言得到 0、預期 1。先補齊目前收圖路徑所需的測試替身，再驗證原流程。 |
| `npm run lint` | **失敗**。在乾淨基準執行得到 5 個錯誤、52 個警告，其中一處是 `LearningRecordWorkspace.tsx` 在 effect 中同步更新 state。這是獨立檢查；Railway 的建置指令未執行 lint。 |

瀏覽器回歸可在另一個乾淨 worktree 安裝依賴、執行 `npx playwright install chromium`，再按功能選擇 `npm run test:weaving-ui` 等腳本。共用的隔離伺服器會拒絕載入含 `.env.local` 等環境檔的目錄。有些 UI 測試使用預先建好的 production bundle；以該腳本為準。 [隔離伺服器](scripts/isolated-practice-server.mjs) · [全部測試指令](package.json)

## Railway 正式部署

| 項目 | 2026-11-21 唯讀核對結果 |
| --- | --- |
| 專案／環境／服務 | `fortunate-harmony` → `production` → `Lumen-Dojo`，來源 `tasiling/Lumen-Dojo` 根目錄、`master`，服務設定指定 commit。最近成功部署為 `e97d353`。核對新版要看成功 deployment 的 SHA。 |
| 建置 | Railpack。設定的 Build Command 為 `npx next typegen && npx tsc --noEmit && npm run build`。repo 根目錄沒有 Railway 設定檔，實際覆寫值在服務 Settings。 |
| 啟動／網路 | Start Command 使用下方 shell 程序；最後直接執行 Next。公開服務網域 `lumen-dojo.up.railway.app`，目標埠 8080，單一 replica。 |
| 附屬資源 | production 只有主站服務，掛載 `lumen-dojo-learning-locks` 於 `/data`。此環境沒有獨立 PostgreSQL、Redis 或 bucket；轉錄 SQLite 隨主站使用磁碟，語境修習室、VF 和財富帳本各由外部服務維護。 |
| Webhook | 此 Railway 專案的部署事件 webhook 數為 0。接收 LINE 訊息的是下方列出的應用程式 HTTP 端點。 |

正式 Start Command 調整排版後如下。它要求媒體工具就緒，確認資料目錄可寫，並在指定備份檔尚未存在時保存一份快照，才開始接流量。

```sh
sh -eu -c '
  command -v ffmpeg >/dev/null
  command -v ffprobe >/dev/null
  case "${LEARNING_WRITE_LOCK_DIR:-}" in
    /data/*) ;;
    *) echo "Persistent learning directory must remain under /data" >&2; exit 1 ;;
  esac
  test -d "$LEARNING_WRITE_LOCK_DIR"
  test -w "$LEARNING_WRITE_LOCK_DIR"
  umask 077
  backup=/data/creative-release-backups/2026-10-21-v2
  mkdir -p "$backup"
  if [ ! -f "$backup/learning-state.tar" ]; then
    tar -C "$LEARNING_WRITE_LOCK_DIR" -cf "$backup/learning-state.tar.tmp" .
    mv "$backup/learning-state.tar.tmp" "$backup/learning-state.tar"
  fi
  echo "Creative runtime preflight and persistent backup ready"
  exec node node_modules/next/dist/bin/next start
'
```

這份快照只涵蓋當時的學習目錄。完整備份須另核對 Notion、後續磁碟變更與轉錄 SQLite 的一致性；回退 Git 版本也無法回退這些資料。 [備份與回復紀錄](docs/creative-release-ready.md)

### 環境變數

下表列出主站 production 當時直接定義的 21 個名稱。核心與磁碟支撐主站，其餘按啟用的服務使用。

| 名稱 | 用途 |
| --- | --- |
| `ACCESS_KEY` | 擁有者解鎖主站。 |
| `NOTION_TOKEN` | 主站讀寫已分享的 Notion 資料來源。 |
| `LEARNING_WRITE_LOCK_DIR` | 設定可寫的持久目錄，保存鎖、收據、工作室、閱讀狀態及媒體。 |
| `RAILPACK_DEPLOY_APT_PACKAGES` | 告知 Railpack 要安裝的執行階段系統套件，供媒體工具使用。 |
| `LINE_CHANNEL_SECRET` | 驗證 LINE 對 webhook 請求的簽章。 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 向 LINE 取得媒體、回覆訊息或維護選單。 |
| `LINE_ALLOWED_USER_ID` | 辨識獲准使用剪藏功能的 LINE 擁有者。 |
| `CONTEXT_ROOM_INTEGRATION_URL` | 語境修習室的 API 位置。 |
| `LUMEN_CONTEXT_ROOM_SYNC_SECRET` | 語境派送及寫作修習室讀取日記來源的跨服務授權。 |
| `LUMEN_SOURCE_IMAGE_PROXY_SECRET` | 接收端以附件識別取回來源圖片時的專用授權。 |
| `CONTEXT_ROOM_NOTION_SESSIONS_DATA_SOURCE_ID` | 指向語境修習室待回流成果所在的 Notion data source。 |
| `VOCABFORGE_INTEGRATION_URL` | 取得目標豆倉與派送詞彙的 VocabForge API 位置。 |
| `LUMEN_VOCABFORGE_SYNC_SECRET` | Dojo 與 VocabForge 之間的 API 授權。 |
| `LUMINARA_WEALTH_URL` | Dojo 呼叫財富帳本的後端位置。 |
| `LUMINARA_WEALTH_APP_URL` | 供擁有者從回覆開啟帳本待辦匣的前端位置。 |
| `LUMINARA_WEALTH_BANK_ENABLED` | 控制 LINE 銀行分流功能。 |
| `LUMINARA_WEALTH_S2S_SECRET` | 簽署主站傳給財富帳本的請求。 |
| `LUMINARA_WEALTH_OCR_SECRET` | 驗證財富帳本回呼 Dojo OCR 的請求。 |
| `OPENAI_API_KEY` | 英文影像分析與銀行 OCR 使用 Responses API 的授權。 |
| `OPENAI_ENGLISH_IMAGE_MODEL` | 選擇英文影像辨識模型。 |
| `OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD` | 英文影像功能的每月估算費用上限。 |

另外幾個名稱來自程式或平台。以下設定可依需求使用，與上表的服務自訂變數分開核對。

| 名稱 | 用途 |
| --- | --- |
| `CONTEXT_ROOM_NOTION_TOKEN`、`CONTEXT_ROOM_URL` | 成果收件匣的專用 Notion 授權，省略時沿用主站授權；第二個名稱供舊的語境修習室位址設定使用。 |
| `NEXT_PUBLIC_DOJO_TIME_ZONE`、`NEXT_PUBLIC_APP_URL` | 道場日期邊界、LINE 回站連結的公開站點位置。部分行動紀錄另採墨爾本時鐘。 |
| `OPENAI_BANK_OCR_MODEL`、`CREATIVE_PROPOSAL_WORKER` | 覆寫銀行 OCR 模型、選擇是否啟用創作提案背景程序。 |
| `RAILWAY_VOLUME_MOUNT_PATH`、`PORT` | 平台提供的掛載根目錄與 HTTP 監聽埠。 |

## 外部串接與 Notion 資料庫

| 串接 | 方向、用途與程式入口 |
| --- | --- |
| LINE Messaging API | LINE → `POST /api/integrations/line/webhook`。驗簽並辨認擁有者，收網址與成組圖片、分派書頁／英文／銀行用途。Dojo → LINE 取得媒體、回覆或補推處理結果。 [入口](app/api/integrations/line/webhook/route.ts) |
| 語境修習室／寫作修習室 | Dojo → 接收端 `/api/integrations/lumen/import` 查能力並派送 Project／Unit／Source Item；接收端 → Dojo 的 `/api/integrations/context-room/images/…` 以穩定附件識別取圖，`/api/integrations/context-room/writing-sources` 唯讀選取 DB-14 與 DB-18 的日記。語境成果另由 Notion 收件匣讀回、保存後確認。 [派送契約](docs/source-handoff-v2-dispatch.md) · [成果收件匣](lib/dojo/contextRoomNotionInbox.ts) · [日記讀取](docs/context-writing-source-bridge.md) |
| VocabForge | Dojo 查詢既有詞目、可選豆倉，提交使用者選取的詞彙／表達。Dojo 負責送件與收據；詞卡內容、配圖及複習進度要到接收端核對。 [派送程式](lib/dojo/englishImageDispatch.ts) |
| Luminara Wealth | Dojo 先向帳本確認銀行模式，送銀行圖與業績紀錄；財富帳本可回呼 `POST /api/integrations/wealth-bank/ocr`。交易與帳本由財富服務保存，路由結果不明時保留重試。 [銀行分流](lib/dojo/wealthBank.ts) · [OCR 入口](app/api/integrations/wealth-bank/ocr/route.ts) |
| OpenAI 與外部 ChatGPT | Responses API 用於英文影像判讀與銀行 OCR。閱讀、織光杼和單元編排另有「複製討論包 → 到 GPT → 貼回預覽 → 本人採用」的流程，原圖、本人原話、模型建議與正式版本各留來源。 [影像分析](lib/dojo/englishImageAnalysis.ts) · [單元編排](docs/unit-arrangement-dispatch.md) |
| Threads／抖音／本機 BiliNote | Threads 透過 Jina Reader 解析指定公開貼文，保留原連結與不完整標示。抖音由已配對 Mac 向 `/api/integrations/douyin/worker/{pair,claim,update}` 領件，經本機 Docker／BiliNote 轉錄，把逐字稿和時間戳寫回原採集卡。 [Threads 解析](lib/dojo/threadsReader.ts) · [Mac worker](lib/dojo/douyinMac/worker.py) |
| Canva／社群 | 工作室保存固定版本的 Canva 交接、素材及回收連結。IG、Threads、Plurk 的發布結果由本人回填；噗浪蓋樓台提供編稿與分樓複製。 [Canva 交接](lib/dojo/creativeStudio/canva.ts) · [發布設計](docs/creative-release-ready.md) |

Notion 對接以 data source 為單位。下表採用程式內的中文表名；欄位、選項、對照與分頁查詢以實作為準。多數新功能沿用既有欄位；遇到 404 先核對整合分享權限、data source 類型與對照。 [Schema](lib/notion/schema.ts) · [查詢](lib/notion/queries.ts) · [寫入](lib/notion/mutations.ts)

| 資料庫 | 用途 |
| --- | --- |
| DB-01 牌組表、DB-02 牌卡表 | 選牌組；依序取得牌卡、正逆位與組稿所需素材。 |
| DB-03 抽牌 Session、DB-04 抽牌明細 | 前者保存任務表頭與生命週期，後者按日期保存抽牌內容、明細狀態、草稿或產出連結；兩層分別推進。 |
| DB-05 解讀規則庫、DB-08 月主題包 | 查現行解讀／輸出規則及當月主題，供生產日與組稿。 |
| DB-06 固定項目註冊表、DB-07 序列節點表、DB-15 場次表 | 三者分別提供活動、節點模板及實際場次，用錨點預覽排程，確認後寫入。 |
| DB-09 回饋紀錄、DB-10 修正提案 | DB-09 寫入評分及問題標籤；DB-10 對應後續修正提案，目前在 schema 登錄，沒有獨立寫入路徑。 |
| DB-11 服務原子庫、DB-12 素材庫、DB-13 精進區實驗庫 | DB-11 供生產日比對服務；後兩者分別為原產線素材及實驗庫，目前僅見 schema 對照。野採有自己的 Capture 保存路徑。 |
| DB-14 知識庫、DB-16 標籤詞庫 | DB-14 兼有可用知識、語氣指引與依前綴區分的應用紀錄，如每日、採集、修習與作品。DB-16 解析主題／服務等關聯標籤。 |
| DB-18 日記庫、DB-19 生活痕跡庫 | DB-18 存七題日記；DB-19 供生活痕跡與非私人快速紀錄同步。私人快速紀錄保留在受保護的 DB-14。 |
| DB-21 書籍庫、DB-22 洞察卡片庫 | DB-21 一列是一個讀次，筆記在該頁的 blocks；DB-22 保存可追溯來源書籍的洞察卡。 |
| 語境修習室 Sessions 資料來源 | 屬於外站。Dojo 讀待同步的成果，保存後回寫確認，供擁有者在修習紀錄接續。 |

## 設計取捨與曾遇過的問題

- **工具需從本人實際使用的入口驗收。** 主站曾移除假的功能連結和固定示例資料。另存的 HTML 模擬版適合試流程；要列為正式工具，需核對首頁可達、可儲存、重載可回找，以及本人測試結果。舊網址轉址仍需保留。 [主站整合](docs/schema/行光道場正式版整合.md) · [手機介面命名](docs/interface-naming-checklist.md)
- **素材、主張與作品各有生命週期。** 野採 C0–C3 記創作成熟度，K0–K1 記來源整理；K2 候選、K3 評估、K4 本人採用屬獨立的知識主張。早期自由文字關聯改成穩定 ID，保留來源與版本。新候選不覆蓋已採用版本，作品定稿可以維持私人。 [雙成熟度決定](docs/schema/野採雙成熟度與知識主張第一階段.md)
- **週盤依實際行動記錄。** 今日、週盤與內容排程共用視圖，各項紀錄仍保存出處。舊週盤在讀取時補預設，後續由使用者操作才寫入。跨午夜問題先看道場日界與紀錄時鐘，避免直接拿伺服器 UTC 日期當使用者日期。 [週盤相容規則](docs/schema/彈性週盤v2.md) · [行動紀錄時鐘](lib/dojo/captureContext.ts)
- **版本衝突和逾時要分開處理。** Notion 缺少跨筆交易。涉及學習寫入時在共享 POSIX 目錄取鎖並重讀版本；遠端結果未知會保留鎖或操作收據。先依同一操作識別核對已寫入的部分，再決定如何恢復。盲目刪鎖、重送或增加獨立磁碟副本都可能造成重複。 [寫入鎖處置](docs/R2-1-lock-closeout.md) · [派送重試規則](docs/unit-arrangement-dispatch.md)
- **多張截圖是一組有序來源。** 曾因圖片已保存、後續版本衝突而讓 LINE 看似卡死。保留事件、原順序與附件識別；遊戲介面練按鈕與操作限制，劇情圖練閱讀。短效 Notion 圖片網址在讀取時重新取得。 [收圖修正](https://github.com/tasiling/Lumen-Dojo/pull/129) · [逐圖教材](https://github.com/tasiling/Lumen-Dojo/pull/130)
- **提交遵循一批一個 PR。** 從最新 `master` 分支送審，描述對應委派或擁有者追加指示，逐項交代存量資料、新增必填欄位、空值行為。純文件可將三項標為不適用並說明原因。正式部署採已合併的預設分支。 [開發送審流程](docs/開發送審流程.md)

### 可選的協作技能

接手環境若已安裝，`use-railway` 可核對部署與掛載狀態，`systematic-debugging` 可重現上方兩項基準失敗，`unslop` 可檢查手機模擬版的介面與用字。
