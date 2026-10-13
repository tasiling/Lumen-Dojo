# R2-5C 跨站修習成果接收

沿用原分支 `codex/r2-5c-external-results-bridge` / PR79。2026-10-13 正常合入 Dojo master `6a04dce0109eb4b79eea98f5fe9c5f1a430883ef`（merge `edd454a`），保留原有提交與 R2-1/2/3。沒有 reset、force-push、新 PR、master merge、部署或正式資料寫入。整体 UI redesign 留待後續。

## 已交付與来源契約

| 来源 | 唯讀 endpoint | 契約 | 身分／完成單位 |
|---|---|---|---|
| Context Room PR24 | `/api/integrations/lumen/practice-results` | `context-room-practice-results/v1` | `context-room / practice-session / Session UUID`，1次 |
| VF R2-5B | `/api/integrations/vocabforge/results` | `vocabforge-practice-results/v1` | `vocabforge / review-round / Session UUID`，真正標準五詞1輪；短／其他1次 |

來源由固定 server adapter 的 Bearer query 讀取。源站 `sourceOwner` 與道場 `learningOwner` 是不同 namespace；VF envelope 必須等於已配置的來源 owner。Dojo 事件 ID 仍是 UTF-8 SHA256 `JSON.stringify([serverOwner,sourceSystem,sourceType,sourceId])`。VF 源站 eventId 不取代此身分；API、重試、同頁／全量對帳與程式重啟不增生事件或正文。

來源固定 origin：Context `https://lumen-context-room-production-4a2c.up.railway.app`；VF `https://vocabforge-production-2baf.up.railway.app`（來源既有 CEFR 接續文件的入口）。不接受 browser URL、owner、完成宣告或 token。來源完整回答／詞卡／學習歷史不匯入；只留必要摘要、模式／計量、指標、原日期、來源版本與狀態。來源入口需要來源登入。

Context 五種有效模式與快速重說既有門檻不改。originalContext/capturedAt 與 currentContext 分開；legacy 原脈絡未知。sourceRevision 不透明，updatedAt 保留 UTC 微秒排序；旧版不回退，原日期／原脈絡不能改寫。practicedOn/occurredAt/timeZone 未知保留 null，來源保存／匯入時間不冒充真正練習時刻。archived/deleted 保留有效歷史；withdrawn/unverified 排除有效完成；來源 503、空頁或缺席不表示刪除。

VF 新完成日期必須是 occurredAt 在保存 IANA timeZone 下的 source-local practicedOn；未知或不符拒絕，不套今天／道場時區。標準五詞必须 exact5、spelling5、必要 understanding 至少15、standardRounds1；短1～4詞及其他模式 standardRounds0。R2-5B 当前是不可變 completed/available 事件，沒有撤回／删除 mutation；接收端不虛構這些操作。其 original/current context 均未知，不能猜書籍或專案位置。

## 操作與設定

`GET /api/dojo/external-results` 只讀已保存快取，回传各来源配置、最後成功更新／錯誤、receipt 與原生20筆 cursor。GET／頁面刷新／返回不拉源站、不 seed、不造事件／正文、不投影／ack。

```json
{"action":"sync"}
{"action":"reconcile"}
{"action":"sync","source":"vocabforge"}
{"action":"reconcile","source":"vocabforge"}
{"action":"retry","id":"<existing receipt SHA256>"}
{"action":"notion-alias","pageId":"<existing Notion page UUID>"}
```

以上皆 `POST /api/dojo/external-results`，验证登入、origin、server owner，持有 R2-1 共用持久 writer lock。retry 从已保存 receipt 确定来源，只补未完成投影。Context API 沒有 ack endpoint；Notion alias 保留既有真实 ack，不宣稱新增確認。Notion syncVersion1 只是 schema，不覆蓋權威 API revision。舊活動收據逐 Session 每次最多100筆續查；有舊計次或無穩定 ID 保留待核對，不按標題猜合併／重算週盤。

server 环境配置（值不回傳 browser）：

- Context：`CONTEXT_ROOM_RESULTS_ENABLED=1`、`CONTEXT_ROOM_RESULTS_OWNER=<Dojo learningOwner>`、`LUMEN_CONTEXT_ROOM_SYNC_SECRET`。
- VF：`VOCABFORGE_RESULTS_ENABLED=1`、`VOCABFORGE_RESULTS_OWNER=<Dojo learningOwner>`、`VOCABFORGE_RESULTS_SOURCE_OWNER=<source VF_REVIEW_OWNER namespace>`、`LUMEN_VOCABFORGE_SYNC_SECRET`。來源默认 namespace `vocabforge-default-owner`，須核對實際 source config 再設定。
- 沿用 DB14 與 `LEARNING_WRITE_LOCK_DIR` 真持久 mount；本包没有资源／schema migration。

## 保存、投影與恢復

DB14逐筆存既有 `行光完成事件-`、`行光學習正文-`；transport 使用 `行光外部來源收據-` 与来源分開的 `行光外部來源游標-`。VF receipt 是 additive `external-vocab-source-receipt/v1`；Context既有schema不改。事件保存先于正文／每日投影；正文完成后清掉 event evidence outbox。VF 与 Context都用同一 event/record/writer/intent machinery，沒有第二套主歷程。

Context正文來源 metadata 更新保留本地 evidence note、正文与學科。VF不可變重播不覆蓋使用者正文。外部正文可关联多學科；event GET唯讀从唯一正文衍生當前學科，用同一事件展示，不重新計次。未知日期正文仍在dated history后，不用recordedOn填造practicedOn。

Context光步／週盤未連結：没有已核准的模式映射或來源原有 binding，不猜對應。VF每个真完成在原 practicedOn 投影 vocabulary set；同日类别一次，只有標準五詞增加標準輪次。DailyRecord `practiceEventVocabulary` 保存 manualRounds 與 unique event IDs/standardRound provenance；`vocabForgeRounds = min(5,max(manual,automatic))`，保留現行上限，完整來源輪次不丟。舊表單／other writer不能覆蓋ledger；有版本檢查的明確daily edit可更新manual baseline。其他英文類別、note与整份daily內容保留。來源只新增词彙，不自動标output。

週盤預設、6＋2、已安排格、範本及手動进度都不改；外部事件沒有來源明確binding，因此未連結。沒有自动创建 Assessment、Claim、學成卡或作品。

每次明確sync最多一頁50笔、约40秒row预算；每个confirmed snapshot持久checkpoint後才前進，整页保存后才提交来源cursor。中斷、正文／Daily／receipt／checkpoint失败可续同页；已存event/body不重建。after inclusive重叠；至少每7天下一次明確sync做bounded full reconciliation，沒有背景排程。cursor保持原after/windowUpper，UTC微秒不由JS Date舍入。空页不会删缓存或历史。

未知mutation沿用fsynced identity intent/writeOutcome，保留mutex，無TTL／restart unlock／自动重送create。只允許按實際provider結果、來源身分、intent证据核对恢复。回退可關闭来源enabled旗標停止新接收；保留event/record/receipts/locks，不清数据。

## 當次隔離驗证

PASS：`test:external-results`、`test:vocab-results`、`test:vocab-projection`、`test:r2-5c-api`、`test:practice-events`、`test:learning-records`、`test:r2-3-api`。新增VF route/storage suite执行真实handler、event/body/provider adapter和fsynced lock/intent；磁碟backed隔離Notion transport，不是真正式Notion。

PASS：learning-foundation/model+API、weekly、english-images、unit-arrangement、capture-exploration、html-entity-overflow、wealth-bank、image-routing回归。初次practice-workspaces没有Playwrightbrowser而失败；安装后375/390/430px实际通过。

PASS：Context5A官方migration/trigger/实际reader的隔离PGlite输出（三组initial/archived/deleted，五模式）原样穿过receiver adapter；VF5B真实三模式fixture原样穿过receiver。Fixtures在 `docs/fixtures/r2-5c/context-room-reader-snapshots.json` 与 `vocabforge-review-events.json`。PGlite是补充验证，不是native PostgreSQL。

PASS：Chromium375/390/430px Context/VF來源、長中文／英文、纯cache GET/reload/back、明确同步／完整对账／重試、原日期与來源入口、離線缓存、本地工作仍可用、縮小keyboardviewport及safearea；R2-3及practice-workspaces回归。截图本机测试路径，不是iPhoneSafari实机。

PASS：Nexttypegen后tsc（初始裸tsc缺既有RouteContext globals，生成后通过）、lint（只有既有plurk img警告）、build、diff-check。当次完整验收最终HEAD另記ledger/PR。

SKIPPED：正式Context/VF跨站Bearer连线、正式Notion读写、真来源登录授权深连结、nativePostgreSQL端到端与iPhoneSafari实机；没有借用正式凭证。源码交付和fixture兼容不等于已部署／正式接通。来源发布、真实runtime及release由root统一执行。
