# R2-5C 跨站成果接收與修習歷程整合

本包實作 Context Room 的受控查詢 adapter、DB14 來源收據／同步游標、跨 API／Notion Session 身分對照、明確同步／重試及既有修習歷程內的來源呈現。**來源收據不是另一套主紀錄，尚未核准的外部契約不建立可計數 Completion Event／Learning Record／光步／週盤，也不 ack。** VF 尚未接入。這是可獨立驗收的接收與待核對路徑，不宣稱跨站已可正式上線。

## 基線與實際來源

2026-10-06 重新 fetch；工作區為新建完整 Git clone，無未提交 Dojo 成果，也未找到同名分支／PR。沒有假稱恢復未保存的舊工作。讀取 AGENTS.md、package.json 及 Next 16.2.10 實際 Route Handler 指引。只修改 Dojo。

| 項目 | 核對結果 |
|---|---|
| 最新 master | `0818a14407bbecc035917fb9ffd598de4ad0dfb9` |
| R2-3 base | `codex/r2-3-learning-records-events`，`e65123240d20d857c3f0a42e06adb177137f202f`；#76 Draft，未合併 |
| 本包分支 | `codex/r2-5c-external-results-bridge`；stacked Draft base 為 R2-3，Depends on #76，transitively #75/#72；只審本包 diff |
| R2-5A | Context Room #24 Draft，head `397599a03266f1d9f0c5a99ab8881f3666181811`；未合併／未部署；文件與 fixture 已讀實際內容 |
| R2-5A 契約／路由 | `context-room-practice-results/v1`；`GET /api/integrations/lumen/practice-results` |
| R2-5B | GitHub repo PR 搜尋 R2-5B 得 0；VF main tree `cebfbe75c5b83c903b2c22fa99d41b257974fb17` 未找到 R2-5B／practice-result／event-contract 路徑。未取得可驗證的契約／路由／fixtures，不宣稱不存在或已交付 |
| Dojo 事件 | 沿用 `docs/r2-practice-event-contract-v1.md` 的 eventVersion 1；目前 sourceSystem=`dojo`、sourceType=`english-journal-segment`、completionKind=`journal-self-translation`、quantity=1/unit=段；**外部來源尚未列入其可接受 schema** |

父 PR 合併後須重新 fetch，核對 merge-base 與本包 diff，再調 base；不得盲目重播父 commits。本包不合併、不部署、不使用正式來源 token／Notion／DB、不 backfill、不派送。

## 實際 API 與使用

所有新 GET／POST 及舊語境成果 route 使用 `requireLearningOwner`：本站 access-key cookie 的 server owner，mutation 拒絕不同 Origin；前端沒有共享來源 secret。

- `GET /api/dojo/external-results?cursor=<Notion-native-cursor>`：只讀 DB14 已保存的來源收據及 checkpoint，20 筆 native 分頁；無來源 fetch、seed、事件、投影、ack。GET 不生成新事件。空快取表示未知，不代表零次修習。
- `POST /api/dojo/external-results`，body `{"action":"sync"}`：一次最多一個來源 page，來源 limit=50（R2-5A 上限200，但本 reader 固定50）。有持久 cursor 即繼續；無 cursor 時 inclusive after 重疊讀取。
- 同 route `{"action":"reconcile"}`：從 epoch 開始完整對帳；中斷的 window 繼續，不盲目換 after/windowUpper。每七日下一次明確 sync 也啟動 full reconciliation；没有背景排程或 GET 自動同步。未出現的項目不判刪除。
- 同 route `{"action":"notion-alias","pageId":"<Notion-page-UUID>"}`：使用既有 Notion bridge 配置，retrieve 並核對固定 data source、sourceEventId UUID、syncVersion=1、非封存／垃圾；只保存別名與既有 ack 狀態，不信任 body owner/revision/completion/sourceId。API 權威結果尚未快取時 409；先明確來源 sync。
- 同 route `{"action":"retry","id":"<saved-receipt-64hex>"}`：只查已保存來源收據／owner；目前回 `CONTRACT_PENDING_NO_PROJECTION`，無新事件、投影、ack。未知 create 不走此 route 解鎖。
- 原 `/api/dojo/context-room-results` POST：有 Notion page 使用同上 authority alias 路徑，回409 pending，不 ack；有 frontend 宣告的 sourceEventId 而未從固定 Notion source 核對，回409 `AUTHORITATIVE_SOURCE_REQUIRED`。無 ID 的手動卡保留保存與舊格式，明確拒絕來源摘要自動完成週盤格。

範例（伺服器已配置隔離資料源；cookie 由既有登入取得，不在文件放 secret）：

```http
POST /api/dojo/external-results
Content-Type: application/json
Origin: <same Dojo origin>

{"action":"sync"}
```

```json
{"saved":1,"remaining":false,"counted":0,"contractStatus":"pending","checkpoint":{"after":"2026-10-06T02:00:00.000001Z","cursor":null,"windowUpper":null,"connection":"ready","lastSuccessAt":"2026-10-06T02:01:00.000Z"}}
```

GET 回應的收據形狀（節錄；完整型別 `lib/dojo/externalResults/model.ts`）：

```json
{"schema":"external-source-receipt/v1","id":"<identity-sha256>","eventId":null,"acceptance":"needs_review","source":{"contractVersion":"context-room-practice-results/v1","sourceSystem":"context-room","sourceType":"practice-session","sourceId":"00000000-0000-4000-8000-000000000001","sourceEventId":"00000000-0000-4000-8000-000000000001","sourceRevision":"legacy:opaque","practicedOn":"2026-09-20","occurredAt":"2026-09-20T23:59:59.123456Z","timeZone":null,"completionStatus":"completed","sourceAvailability":"available","activityMode":"quick_retell","originalContext":null},"reasons":["R2_3_EXTERNAL_CONTRACT_PENDING","SOURCE_TIMEZONE_UNKNOWN"],"projections":{"record":"blocked","lightStep":"blocked","weekly":"unlinked","ack":"not_applicable"}}
```

## 權限與伺服器配置

reader 預設關閉。只在獨立評審後由 server 配置 `CONTEXT_ROOM_RESULTS_ENABLED=1`、`CONTEXT_ROOM_RESULTS_OWNER=<server learningOwner>`、既有 `LUMEN_CONTEXT_ROOM_SYNC_SECRET`。owner 必須等於 server DB14 owner。**本次沒有設置任何正式憑證／環境。** reader 固定 origin `https://lumen-context-room-production-4a2c.up.railway.app`，固定路徑，不採用前端 URL／dispatch URL override；redirect:error，來源 timeout 8秒，回應最大512KB，純 JSON allowlist。若來源換 origin，需要明確 code/config 評審，不接受任意代理。

R2-5A 不回傳 owner 欄位，來源歸屬由專用 Bearer 綁定的 server APP_OWNER_KEY 保證；Dojo 的 explicit owner 配置是本站綁定防護，不能獨立證明遠端 APP_OWNER_KEY。正式接入前須管理者核對兩站憑證／帳號綁定。跨 owner 的快取 row、Notion data source 或 body owner 拒絕，不用來源名稱猜 owner。

錯誤碼包括 UNAUTHORIZED(401)、ORIGIN_OR_OWNER_MISMATCH／OWNER_MISMATCH／NOTION_SOURCE_OWNER_MISMATCH(403)、CLIENT_SOURCE_CLAIM_REJECTED(400)、SOURCE_*INVALID(422)、STALE_REVISION_CONFLICT／SOURCE_ORIGINAL_FACT_CONFLICT／AUTHORITATIVE_SOURCE_NOT_CACHED(409)、SOURCE_NOT_CONNECTED／SOURCE_TEMPORARILY_UNAVAILABLE(503)、WRITE_LOCK_OR_INTENT_REQUIRES_REVIEW(409)、STORAGE_UNAVAILABLE_OR_UNKNOWN_OUTCOME(503)。UI 保留上次資料與最後成功查核，不用失敗日改原日期。

## 身分、版本與日期對照

| R2-5A／渠道 | Dojo 來源收據 | Completion Event 相容／待決策 |
|---|---|---|
| API sourceId=sourceEventId=Session UUID | sourceId 保留；`SHA256(JSON.stringify([serverOwner,"context-room","practice-session",UUID]))` UTF-8，沿用 R2-3 算法；只在接收 mutation 保存 | 目前 eventId=null，不建立不符合 R2-3 enums 的事件；將來同語意身分，不重編 Session |
| Notion sourceEventId | authority 核對後 aliases；同一 UUID 同一收據 | syncVersion=1 只表示 Notion schema；不更新／比較 Session revision、日期、完成狀態 |
| opaque sourceRevision + updatedAt | revision 原文；updatedAt 以驗證過的 UTC string 補齊6位微秒比較；新時間更新、舊時間忽略；相同資料不重寫（lastVerifiedAt 為最後新增／更新查核時間，checkpoint.lastSuccessAt 為整頁查核時間）；同時間不同資料拒絕、同 revision 不同內容拒絕 | 沒有把 legacy:... 當數字，不用 GET 時間當 revision；R2-3 external revision 優先級仍待核准 |
| practicedOn／occurredAt／timeZone | 可為 null；保存原值、dateSemantics；原 occurredAt/capturedAt 接受並保留 RFC3339 Z 或 +00:00/+08:00 等 offset／微秒，與嚴格 UTC Z cursor 驗證分開；接收／查核時間分開 | R2-3 sourceDate 與 null date/zone 的正式 envelope 尚待核准；不使用當前 DOJO_TIME_ZONE 冒充來源時區 |
| originalContext | legacy null 明示未知；新快照只證明完成寫入位置 | 不用 currentContext 名稱冒充學習當時名稱；原日期／快照意外改變拒絕本頁，需來源／owner 核對 |
| completionStatus completed／withdrawn／unverified | 來源有效性與本站 acceptance 分開 | completed 仍可能原日期為匯入日；只有 source completed 不代表本站已接受可計數事件 |
| completionKind=context-room-session, quantity=1, unit=次 | 來源原值保留，僅次數量測，不當作能力評分 | 外部 completionKind／quantity／unit 對照、各模式光步 mapping 與週盤同單位規則待核准 |

同 Unit 第二個 UUID 是第二筆来源收據；多 Path／多學科不進身分 key。不猜舊無 ID 手動卡與來源的合併，手動卡不轉成自動事件。已有舊 Session-ID receipt 精確核對來源 ID，保留其 pageId／linkedActivityId／完成時間；不重完成週盤格。Notion alias 不回退 API，原有 ack=true 可觀察保存，但本包不製造新 ack 成功。

## 儲存、分頁與恢復

additive DB14 JSON rows：`行光外部來源收據-<identity>`、`行光外部來源游標-<owner-scoped hash>`。不新增 Notion properties／database、不新增 SQL migration、不改 Completion Event／Learning Record schema、不建新主紀錄。新增 JSON 前綴列入既有 FORMAL_STATE_TITLE_PREFIXES，避免來源收據／游標被當成內容生產素材候選。舊 Session-ID receipt lookup 使用 DB14 native query 單頁上限100，不跑無界 queryAll；尚有舊頁時 legacyLookupComplete=false／LEGACY_SCAN_INCOMPLETE 明示未完整查核，不宣稱舊 ledger 已全對帳。未來啟用計数之前须另完成持久的舊收據完整對帳；本包未提供一般 legacy backfill／管理介面。

收據只包含必要摘要旗標、稳定 Session/Project/Unit 指標、日期語意、歷史／目前脈絡、來源状态、別名與既有receipt參照。沒有全文回答、私人筆記、原卡、token；GET 再做 allowlist view。

全部 mutation 使用既有 shared persistent POSIX `LEARNING_WRITE_LOCK_DIR`、`withLearningWriteLock`、`createPracticeOnce` fsynced identity intent、writeOutcome／無 create retry。缺持久鎖目錄拒絕，不用正式 /tmp 替代。只有隔離測試目錄使用 tmp。未知 create／update 回應沿用 R2-3 保留 mutex/outcome；單純已明確拒絕可釋放本次鎖，cursor 不越過未保存頁。receipt 已保存而 checkpoint 未保存，重跑只同 key upsert，不新增修習。

來源排序 `(updatedAt, Session UUID)`：同 after/windowUpper，cursor 中時間保留微秒，確認 next cursor 等於最後來源 row 的 time/id；每頁≤50，一次只讀一頁。來源回應 timeout8秒；保存循環40秒後在下一筆前停止，來源頁 cursor 不提交；每筆已確認收據後保存 checkpoint.pageReceipts（最多50筆 allowlisted 來源快照 hash），重跑同頁跳過已確認相同快照，不再次查／寫已處理 prefix。來源內容／revision／時間不同時 hash 不同，重新查核，不能靠 hash 略過變更。新的 first page 重試可能取得新上界（來源沒有首頁指定 upper 的 API），仍保留 inclusive after／完整對帳，非凍結快照。Notion 個別 request 沿用既有有界 SDK timeout／節流；不是保證整個 HTTP handler 在40秒整終止。pageReceipts 只表示本頁逐筆已確認保存，unknown mutation 不標記；cursor 只在全頁收據可恢復保存後推進。inclusive after=上個windowUpper；source長交易可在watermark之前晚到，因此七日明確刷新或手動完整對帳不可省略，沒有固定幾秒「永不遺漏」保證。full reconciliation 完成也不以 absence 判 missing。

來源 available／archived／explicit missing/deleted／withdrawn／unverified 分開；503、逾時、暫空、單頁沒有不等於刪除。刪除後保留授權必要歷史與失效連結，沒有 Project 重建。withdrawn 不投影；舊已套用收據呈現待 owner 核對，無自動扣減手動格／補償或管理介面。API 無 ack endpoint，標不適用；Notion schema/ack不變，待契約接收後才可能新增 ack，本包沒有該 countable acceptance，因此 ack retry 真實網路驗收 SKIPPED。

未知結果恢復：先停止受控 writers、保留 lock/intent，owner 核對同 identity 的 DB14 row 與供應商結果。找到已保存 row 後核對 owner／資料／request outcome，再沿用 R2-3 管理者人工恢復程序；查詢暫無 row 不代表未送達，不 TTL 解鎖、不刪 intent重送。回退須先停 writers，保留新增收據／cursor／intents及來源保護；回退程式不等於刪 Notion，不恢復會盲信 completion flag 或重送未知 create 的舊 writer。

## UI

既有 `/practice/records` 完整歷程的「外部修習來源」區塊；不是新工作台。頁面初載、返回、reload 只 GET cache。明确「刷新來源成果」「完整來源對帳」「核對已保存來源」，每页後顯示可繼續。包含来源、模式、原日期／日期限制、必要摘要、當時／目前脈絡、學科待連結、完成／來源／投影狀態、既有receipt與登入來源入口。全文能力未新增；按來源連結回外站登入工作台。

## Fixtures 與驗收

- `docs/fixtures/r2-5c/context-room-response.json`：來源 PR24 文件的實際回應例快照，offset 完成時間／capturedAt 經可執行 adapter 測試。
- `docs/fixtures/r2-5c/context-room-identity.json`：來源 PR24 fixture 原文快照。
- `docs/fixtures/r2-5c/identity-and-recovery.json`：hash 向量、跨渠道／版本／恢復期望，2個来源Session／0個已接受事件的區別。
- `tests/external-results.test.ts`：可執行 adapter/service 行為，非字串匹配。
- `scripts/test-r2-5c-api.mjs`：執行 actual handler/store/lock/intent，SDK transport 使用磁碟保存隔離 fixture；重新載入 provider row 與 module 驗證重啟。**這不是真實跨站／Notion integration PASS。**
- `scripts/test-r2-5c-ui.mjs`：實際 Next + Chromium UI，攔截隔離 API fixtures；375/390/430、長中英文、reload/back、safe area CSS、縮減viewport、離線保留快取；**不是 iPhone Safari 或原生鍵盤實機**。

驗收結果與具體尚未完成項在交付前更新。沒有使用正式來源連線或 Notion 寫入。

### 本次最終驗收（2026-10-06）

執行環境：Linux、Node `v24.19.0`、Next `16.2.10`、Playwright `1.56.1`／Chromium141。UI 另以隔離 `UI_CJK_FONT=/tmp/r25c-NotoSansCJKtc-Regular.otf` 載入 Noto Sans CJK TC，實際檢視375/390/430 screenshots；字体不是產品新增 dependency。標準 build 使用既有網路 proxy/CA 設定，正式 DB／Notion／來源 token 均不帶入；只有隔離 secret sentinel 做編譯後 browser artifact 補充掃描。

| 驗收 | 本次結果與範圍 |
|---|---|
| 1 五模式、draft／unverified／缺必要旗標、unknown、quick無Second | PASS executable adapter/service；原有私有內容及前次證據由 R2-5A 權威 endpoint 判定，不在接收端重造條件；真實來源隔離憑證 SKIPPED |
| 2 API/Notion、重試、restart、同時間／重疊 | PASS actual handler/store 的磁碟 fixture transport + service 微秒 keyset；來源 UUID對照、schema1不當revision |
| 3 同Unit第二Session、多Path／多學科 | PASS 2個来源UUID保留2收據，沿用4字串hash且不含Path/subject；本次因契約pending接受event數0，不能拿收據數當完成次數 |
| 4 新／舊／legacy revision、不覆蓋local正文 | PASS opaque識別／微秒先後／conflict拒絕，alias不回退API，local evidence revision42保持 |
| 5 名稱／移動／封存／explicit刪除撤回 vs503／空頁 | PASS fixture handler，原脈絡未知維持null，刪除失效連結且保留历史；真來源生命周期 SKIPPED |
| 6 原日期、null／offset／時區 | PASS 原值／nullable限制，R2-5A文件實際+00:00與+08:00/capturedAt，UTC微秒cursor獨立；從查詢／午夜／DOJO_TIME_ZONE不產生原日期 |
| 7 owner／登入／origin／來源／任務／secret | PASS auth403/401、拒絕browser source claims、Notion parent、cross-owner cache、manual binding拒絕，無全文JSON；browser compiled sentinel補充掃描PASS |
| 8 保存／投影／ack失敗恢復 | PASS 本包receipt／checkpoint已確認部分保存可恢復、未知create保留mutex/intent；本包所有外部投影／新ack blocked，不宣稱其真實寫入PASS。R2-3現有事件-first／正文／Daily／weekly retry測試重新執行PASS |
| 9 分頁中斷、同步更新、完整對帳 | PASS 同after/upper、同time IDtie、變動源hash重新核對、pageReceipts持久續跑、900ms讀+2700ms寫的50筆budget反覆中斷可完成，7日明確full reconcile；任意長來源交易需對帳，非凍結快照 |
| 10 週盤／手動／舊receipt | PASS 本包不接受猜測binding、不重完成舊格；舊manual保存去重仍可用且不混合自動來源；R2-3穩定binding／unit／manual ledger等現有測試本次重跑PASS；舊receipt超過100筆時明示legacy scan未完整 |
| 11 GET無副作用／離線本地可用／旧流程 | PASS actual handler 無fetch/write/ack、UIreload/back只GET、離線保留快取，本地正文不被修改；舊Notion預覽保留、確認改authority/pending，不盲加 |
| 12 VF | PASS 尚未接入／無VF接受action／不從詞數推輪次；R2-5B真完成回合契約、endpoint、fixtures及live整合 SKIPPED |
| 13 UI | PASS 隔離Chromium 375/390/430長中英文、back/reload、縮減430px視窗、安全區padding／無横向overflow；iPhone Safari、原生鍵盤／實際safe area SKIPPED |

本次執行 PASS：

```text
npm run test:english-images
npm run test:capture-exploration
npm run test:html-entity-overflow
npm run test:weekly
npm run test:learning-foundation
npm run test:learning-foundation-api
npm run test:learning-foundation-ui
npm run test:practice-workspaces
npm run test:learning-records
npm run test:practice-events
npm run test:r2-3-api
npm run test:r2-3-ui
npm run test:external-results
npm run test:r2-5c-api
UI_CJK_FONT=/tmp/r25c-NotoSansCJKtc-Regular.otf npm run test:r2-5c-ui
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

lint為0 errors／1筆既有plurk img warning。沒有 `npm test` script，沒有假設不存在的命令。首次字型網路build失敗（隔離env漏proxy）保留 log，帶回既有網路配置重跑標準build PASS；沒有改產品字型。審查發現原時間offset拒絕、分頁重寫／慢速讀取starvation、ack時間截短均已修正，加入可執行回歸後複審無 Critical/Important。初次UI fixture／測試font在離開頁面被中斷產生未處理promise錯誤已修正測試載入，最終有CJK字体UI重跑PASS；未把舊PR PASS當本次證據。當前無未修正 FAIL。

SKIPPED：真實隔離Notion DB14／遠端Session data source與來源來源owner Bearer（沒有隔離配置，不碰正式資料）；R2-5A未部署endpoint真實端到端；外部countable事件／正文／光步／週盤／新ack及補償因未核准而不啟用；VF真整合；Railway持久volume／多instance writer lock／部署；iPhone Safari。腳本中的替身是transport fixtures，不冒充資料庫或真正跨站驗收。

### 尚未完成的具體接通條件

1. R2-3 核准外部 `sourceSystem/sourceType`、`sourceDate`、null日期/zone与import/dateSemantics、completionKind/quantity/unit、per-mode光步mapping，才能沿用現有 Completion Event + Learning Record writer接收可計數事件。本包沒有用環境旗標跳過這些決策，不能翻一個 enabled 值便自動計次。
2. Notion跨渠道版本／新ack接收政策、withdrawn既有投影owner補償規則待核准；API仍無ack。既有已完成格receipt保留，不自動扣或重打勾。超100筆legacy舊卡須完整核對；本包有界查詢明示限制，不正式backfill。
3. R2-5A 合併／部署與真正隔離帳號、DB14和來源憑證之owner綁定驗收；服務端沒有owner欄位的獨立交叉證明，不能借正式連線代測。
4. VF R2-5B真契約、endpoint、round ID／version／原日期fixtures、有效回合門檻、vocabulary同日類別與輪次規則；沒有以上不啟用VF來源計數。

證據在 `docs/evidence/r2-5c/`。本包 head SHA 及內容tree以 Draft PR交付記錄與 `git rev-parse HEAD HEAD^{tree}` 為準（文件本身不宣稱可自包含自己的commit SHA）。修改檔案清單：

```text
app/api/dojo/external-results/route.ts
app/api/dojo/context-room-results/route.ts
app/components/ExternalResultHistory.tsx
app/components/PracticeEventHistory.tsx
app/components/EnglishContextRoomBridge.tsx
lib/dojo/externalResults/{adapter,model,service,store}.ts
lib/dojo/contextRoomNotionInbox.ts
lib/dojo/contextRoomResultStore.ts
lib/dojo/formal.ts (only formal-state exclusion prefixes)
package.json (three test scripts only; no new dependency)
tests/external-results.test.ts
scripts/test-external-results.mjs
scripts/test-r2-5c-api.mjs
scripts/test-r2-5c-ui.mjs
docs/r2-5c-external-results-bridge.md
docs/fixtures/r2-5c/*
docs/evidence/r2-5c/*
docs/superpowers/plans/2026-10-06-r2-5c*.md
```

程式／隔離驗收交付，跨站已可計數／正式上線條件未成立。交付Draft PR後停止，不合併、部署、正式backfill、正式來源連線／Notion寫入、外部派送，不接續R2-6/R2-7。
