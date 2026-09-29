# R2-1 跨學科學習底座交付

本包僅交付 R2-1；不合併、不部署，不執行正式初始化、backfill、Repair、清理或派送。

- Repository：`tasiling/Lumen-Dojo`
- Base：`master` / `06adf98cd38af82047b3986ca39fd590680fc037`
- Branch：`codex/r2-1-learning-foundation`
- Head：以本文件所在 PR 的 head SHA 為準（PR description 列出完整值）。
- 已讀根目錄 `AGENTS.md` 與已安裝 Next.js 16.2.10 route-handler 指引。

## 實際入口與行為

修習所 → 心 → 知 → 我的學習項目。

1. 先按「預覽缺項初始化」查看名稱、願景與影響，再按「確認初始化缺項」。GET 不寫資料。
2. 保留英文到 C1、按摩知識、易經、紫微斗數、奇門遁甲的既有紀錄、來源與 legacy key；初始化以既有目標作為願景，原紀錄不修改。
3. 新增塔羅、雷諾曼、心理學、中醫的已確認名稱與願景。塔羅／雷諾曼保留既有解牌能力定位及語言彈性；心理學／中醫保留自學、先修、備考的方向，不預選升學路線。
4. 支援自行新增第十項、空白項目、無階段與未指定階段的主題。
5. 項目、階段、主題均有編輯、整數排序、進行中／暫時擱置／已完成／封存；暫停、封存可恢復。主題只能移至同一項目內的階段。
6. 本期專注獨立於狀態，可複選。不設逾期或逐關解鎖規則。
7. 無刪除或級聯刪除入口；封存保留歷史 ID 與關聯。
8. 「預期成果」是自由文字學習目標，不是正式驗收、Claim、織光杼或作品。
9. 野採整理介面可連到任意已建立學科；保留五項舊欄位投影。無法解析的舊引用顯示待確認。
10. 新修習紀錄使用 `learningItemId` metadata；名稱可變動。五項舊紀錄以固定 legacy key 對應的原名稱回看；不全域改寫歷史。
11. `learningItem` URL query 保留選取，重新整理、計時返回與瀏覽器返回均可回到該項目。

若已有未對照的同名自訂項目，初始化不把名稱視為身份，也不建立同名副本；回報衝突，繼續完成其他缺項。需先人工確認或改名後再初始化。已初始化項目改名、暫停或封存不會被自動補回。

## 資料落點與 schema

全部沿用目前單一擁有者的 Notion **DB14 知識庫**，不建立新服務、資料庫或 Notion property。

| 資料 | 落點／格式 |
| --- | --- |
| 舊五項與週盤 activity log | 原 `行光修習-{legacyKey}` JSON，原 version 1/2 可解析 |
| 項目／階段／主題 | 每個 entity 一筆 `行光修習底座-{UUID}` JSON，schema 1 |
| 舊識別對照 | item 的 `legacyKey`，五個 key 維持不變；UUID 只在建立時生成並保存 |
| 初始化識別 | item 的 `seedKey`，改名、封存後仍保留 |
| owner | server 固定的 DB14 data-source ID；不接受前端指定 |
| 本期專注 | item 的 `focused`，不與 status 綁定 |
| 主題關聯 | `itemId`、可空的 `stageId`；server 驗證 parent 與 owner |
| 素材關聯 | 原 capture JSON version 2 的 additive `learningItemIds`；`learningTracks` 保留五項投影 |
| 無法解析的舊素材關聯 | additive `unresolvedLearningRefs`，讀寫 roundtrip 保留 |
| 修習紀錄關聯 | 原 dojo-entry version 1 的 additive `learningItemId` |
| 寫入控制資料 | 持久鎖目錄的一個 mutex 目錄與最多九個 seed intent 檔；不存學習歷史 |

無 SQL migration、Notion schema migration、正式資料遷移或 backfill。新資料不放入 localStorage。階段與主題是獨立分筆紀錄，不把全部長期歷史塞進單一 JSON。旧 activity log 的 160 筆上限沿用，未擴建成長期歷史系統。

新前綴加入正式狀態排除清單，底座紀錄不當成內容生產素材。

## 權限與版本

現有架構是全站 **ACCESS_KEY 單一擁有者**，不是多帳號登入。持有相同金鑰者共享同一 owner；本包不另建帳號模型。

- foundation、learning、captures、entries 的讀寫 handler 再驗證金鑰；新寫入拒絕異常 Origin。
- server 固定 DB14；按 page ID 存取時驗證 Notion parent data-source，拒絕別的資料源與已歸檔／垃圾桶頁面。
- foundation entity 先驗證整份 graph 的 owner、ID、seed／legacy 唯一性與 parent 關係；不接受 caller owner、revision 初始化值或修改 parent itemId。
- foundation 編輯用整數 `revision`，在鎖內重讀並比較；stale update 回 409。
- 舊 learning editor 用保存的 `updatedAt` 比較；server 保留 activity log 與既有未知擴充欄位。
- 素材全表單編輯要求相同 `updatedAt`，舊版本或缺版本回 409。舊表單省略 `learningItemIds` 時保留新欄位；未知歷史 ID 不可靜默移除；新增未知／封存學科 ID 拒絕。
- 反思、探索與既有素材保存共用 updater；啟用 R2 寫入時參與同一持久鎖。
- 舊週盤仍寫舊 namespace，保留 raw 擴充欄位；啟用 R2 寫入時也參與同一鎖。六常駐＋二彈性、範本、次數、排序、封存及已安排格子均未修改。
- 舊修習表單省略 ID metadata 時由 server 保留，新的關聯需存在於本 owner 的項目；R2 啟用時紀錄 POST/PATCH 也在共同鎖內操作。

## 唯一性、並發保證與部署限制

**部署前必需：**設定 `LEARNING_WRITE_LOCK_DIR` 為絕對路徑，位於持久 POSIX volume。最低可用配置是一個 app replica／host 上多個程序共用同一目錄；若多 host，必須實際提供與驗證支援 atomic mkdir／fsync 的共同檔案系統。

`.env.example` 僅提供空白設定，本包沒有建立或修改正式 volume／平台設定。未設目錄時新底座寫入及舊 learning editor 返回 503；已存在穩定素材關聯的寫入亦 fail-closed。GET 仍只讀。

實際保證：

- `mkdir learning-writer.lock` 是共同檔案系統上的互斥操作。獨立 Node 子程序測試證實競爭者無法同時進入；不是單程序記憶體 mutex。
- 每筆 foundation 的版本檢查與 Notion 更新均在鎖內，所有參與的同版 writer 序列化。
- 初始化先用 `wx` 建立 seed intent，fsync 檔案與 parent directory，再送出 Notion create。新底座 create 關閉 SDK 與應用層自動重試。
- 若 query 尚未觀察到曾嘗試建立的 seed，intent 阻止再次 create，明確回報需核對，不用成功訊息掩蓋。
- 非可確認的錯誤保留 mutex，阻擋後续寫入；不按 TTL 自動解鎖。即使遲到的 Notion請求完成，也不讓下一個 writer 立刻覆盖。
- 成功的部分初始化以已保存 seed key 重用；剩餘缺項可以繼續，但結果不明的項目需先核對。
- Notion 本身没有 unique constraint／原子 CAS。本方案**不是 Notion 跨程序 transaction，也不是多紀錄原子提交**。一批初始化可能部分完成，失敗時 UI 明確提示重新讀取。

保證的邊界：所有學習／素材 writer 必須运行本版並共用同一目錄，禁止新舊版本並行；外部直接修改 Notion 的 writer 不受鎖保護。若有這些 writer、目錄不共享、不持久、或 filesystem 不支援上述操作，本方案不能保證唯一性與並發安全，部署應保持 R2 寫入停用。server 不會自動建立正式資源，也不能單憑路徑字串證明 volume 的拓撲。

### 異常恢復／回復

1. 先停止所有同 owner writer，確認沒有仍在執行或可能重試的請求。
2. 核對 Notion 的 UUID、seedKey、revision 與所有已保存部分；重複／無法解析資料會回 409，不自動清理。
3. 有 seed intent 而 query 無項目時，先查清是否已有尚未可見或名稱變動的紀錄。只有確認完全沒有寫入的情況，管理者才可移除該 seed intent，允許明確重試。
4. 確認無遲到寫入後才由管理者移除殘留 mutex。程式不自動做此操作。
5. 本包回復應保留新的 Notion entity、UUID 關聯與 intent。不要直接用舊版開放寫入：舊 normalizer 可能不保留新素材欄位。安全方式是先停用寫入，或保留本包相容讀寫層再回復 UI。
6. 本包沒有執行任何正式刪除、清理或恢復程序。

## 本次驗證

全部測試使用隔離資料，沒有讀寫正式重要資料。API adapter 測試執行真實 handlers、capture updater 與 weekly writer，但 Notion IO 被 mock，**不等同真實 Notion integration**。模型測試另使用 temporary disk repository，重建讀取器、獨立 Node 程序與 durable intents。

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| npm ci | PASS | 最終 lockfile 安裝成功，371 packages |
| test:learning-foundation | PASS | 10 組行為 assertions，含跨程序鎖、斷線 intent、資料衝突 |
| test:learning-foundation-api | PASS | 7 組真實 handler/store assertions、隔離 Notion IO |
| test:weekly | PASS | 本次執行，沒有修改週盤設定 |
| test:capture-exploration | PASS | 本次執行 |
| test:english-images | PASS | 本次執行 |
| test:html-entity-overflow | PASS | 本次執行 |
| npx next typegen / npx tsc --noEmit | PASS | generated RouteContext 後檢查 |
| npm run lint | PASS | 0 error；`app/plurk/page.tsx` 一則既有 img warning |
| npm run build | PASS | 完整 production build；首次沙箱下載原有 Google Fonts 失敗，允許網路後成功 |
| git diff --check | PASS | 本次差異 |
| test:learning-foundation-ui | PASS | Chromium 141 mobile emulation、API 攔截隔離資料 |
| 真實 Notion 儲存／並發整合 | SKIPPED | 未提供隔離 Notion credential，不使用正式資料代測 |
| iPhone Safari／原生鍵盤／真實 notch | SKIPPED | 沒有實機；CSS safe-area 與 focus/Tab 不等同原生鍵盤驗收 |
| GitHub CI | SKIPPED | 不以舊 PR 結果代替；建立 PR 後另看該 head 的 CI |
| 正式初始化／volume 設定／合併／部署 | SKIPPED | 本包明確禁止／未授權 |

### 十项驗收

| 案例 | 結果 | 證據 |
| --- | --- | --- |
| 1. 舊五項與來源保留 | PASS | 初始化保留 legacy target；原紀錄不改；原素材引用保留 |
| 2. 四項／自訂項重新整理存在 | PASS | disk repository 重建；UI 初始化九項＋自訂第十項後 reload |
| 3. 第二次初始化不重複 | PASS | second initialization 不增加 IO；seed keys／intent 保護 |
| 4. 改名、移動、暫停／恢復、封存不改 ID | PASS | model 與 UI 行為驗證 |
| 5. 空白路徑可用 | PASS | 無 stage/topic 的自訂項可保存、計時 |
| 6. 新野採學科關聯不遺失 | PASS | psychology／中醫 UI 保存與 reload；actual capture writer roundtrip |
| 7. 舊週盤不清新欄位 | PASS | actual weekly writer 保留 raw extensions；新 namespace 保留 |
| 8. 舊版本表單拒絕或安全合併 | PASS | revision／updatedAt conflict 409；省略新 ID 欄位安全保留 |
| 9. 無權存取拒絕 | PASS | 缺 cookie、跨 Origin、foreign ID/owner、Notion parent guard |
| 10. GET 無資料寫入 | PASS | 真實 GET handler 與 snapshot 的 IO write counter |

UI 覆蓋 375／390／430px、長中文、連續長英文、新增／編輯／移動、暫停／封存／恢復、鍵盤 focus／Tab、底部 safe-area padding、返回與重新整理。截圖經視覺檢查；Linux 環境補了測試用 CJK 字型，字型不加入產品。無頁面 runtime error。真實 iOS 尚未驗收。

### 重跑方式

```sh
npm ci
npm run test:learning-foundation
npm run test:learning-foundation-api
npm run test:weekly
npm run test:capture-exploration
npm run test:english-images
npm run test:html-entity-overflow
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```

UI 需安裝 Playwright Chromium，在另一 terminal 用測試金鑰啟動本機 Next dev。API 全部被測試腳本攔截；不設定正式 Notion token。

```sh
npx playwright install chromium
ACCESS_KEY=r2-1-isolated-test npm run dev -- --hostname 127.0.0.1 --port 3017
# 另一 terminal
npm run test:learning-foundation-ui
```

可設 `CHROMIUM_EXECUTABLE_PATH` 指向已安裝 Chromium；`UI_BASE_URL` 調整測試 server；`R2_UI_OUTPUT_DIR` 指定 screenshot 目錄；Linux 缺中文 fallback font 時可設 `UI_CJK_FONT` 指向本機 CJK font，只影響測試。

## 未完成／部署前事項

沒有尚未實作的項目／階段／主題管理功能。未完成的是隔離真實 Notion integration、iPhone Safari 實機與部署環境持久鎖配置；不把這些列為 PASS，也沒有建立正式資源。首頁整體美化與後續 R2 包不在本包。

## 修改檔案

- `.env.example`
- `app/api/dojo/captures/route.ts`
- `app/api/dojo/entries/route.ts`
- `app/api/dojo/learning/foundation/route.ts`
- `app/api/dojo/learning/route.ts`
- `app/components/DojoShell.tsx`
- `app/components/ForageCaptureInbox.tsx`
- `app/components/LearningFoundationManager.tsx`
- `app/components/LearningPaths.tsx`
- `app/globals.css`
- `app/practice/page.tsx`
- `app/timer/page.tsx`
- `docs/R2-1-learning-foundation.md`
- `lib/dojo/captureStore.ts`
- `lib/dojo/constants.ts`
- `lib/dojo/formal.ts`
- `lib/dojo/learning.ts`
- `lib/dojo/learningFoundation/access.ts`
- `lib/dojo/learningFoundation/fileLock.ts`
- `lib/dojo/learningFoundation/model.ts`
- `lib/dojo/learningFoundation/relations.ts`
- `lib/dojo/learningFoundation/seedWrite.ts`
- `lib/dojo/learningFoundation/service.ts`
- `lib/dojo/learningFoundation/store.ts`
- `lib/dojo/learningStore.ts`
- `lib/dojo/store.tsx`
- `lib/notion/client.ts`
- `lib/notion/mutations.ts`
- `lib/notion/queries.ts`
- `package-lock.json`
- `package.json`
- `scripts/test-learning-foundation-api.mjs`
- `scripts/test-learning-foundation-ui.mjs`
- `scripts/test-learning-foundation.mjs`
- `tests/learning-foundation.test.ts`
