# 行光道場 × 人生海域 × Luminara Wealth
## Shared Practice Architecture Design Spec

- Status: Design baseline
- Date: 2026-10-04
- Repository: `tasiling/Lumen-Dojo`
- Design branch: `codex/lumen-life-sea-architecture-spec`
- Scope: 行光道場（內修）× 人生海域（外行）× Luminara Wealth（財富現實證據）× 世界遊戲化投影
- Non-scope: 功能實作、production migration、正式資料搬移、部署、XP／等級平衡、海域視覺美術定稿

---

# 1. 核心裁決

本架構以以下一句話為最高優先原則：

> **行光道場修「我」；人生海域行「我」。**

因此，系統不能把「行光道場」「人生海域」「財富記錄本」理解成三個平行的 App，也不能再用一個中立的「Lumen Core」凌駕它們。

正確關係是：

1. **行光道場（Dojo）是人的基準點。**
   - 回答：我是誰、我此刻如何、我正在修煉成為誰、今天選擇怎麼活。
   - 內在狀態、角色、修習、晨間選擇、晚間收光均以 Dojo 為權威。

2. **人生海域（Life Sea）是外在實踐層。**
   - 回答：我把正在修煉的自己帶去哪裡、怎麼走、做了什麼、現實發生了什麼。
   - 海域、願景航線、航點、外在行動、現實事件、抵達證據與抵達狀態均屬於此層。

3. **Luminara Wealth 是人生海域中的財富／資源實踐工具。**
   - 回答：真實資金如何流動、配置、預留與支付。
   - Wealth 提供現實證據，但不擁有人生願景，也不能宣告一個人生航點已完成。

4. **群島／設施／地標是外行結果的遊戲化投影。**
   - 它們不是生命資料的權威來源。
   - 投影可以重算、改版、刪除後重建，不得反向改寫 Dojo、人生海域或財務帳本的真實資料。

---

# 2. 產品世界觀與資料世界必須一致

## 2.1 三層主循環

正式主循環為：

```text
【行光道場｜內修】
此刻的我
   ↓
創現角色／正在修煉的特質
   ↓
今天的選擇
   ↓
可選：帶到人生海域
   ↓
【人生海域｜外行】
海域 → 願景航線 → 航點
   ↓
真實行動／現實回應／外部證據
   ↓
抵達、改道、暫停、轉化
   ↓
【行光道場｜回照】
收光回望
   ↓
新的此刻的我
```

這個循環優先於任何 XP、成就、徽章或遊戲數值設計。

## 2.2 內修不是外行的任務清單

Dojo 的「狂 A、冥想、Affirm、Vision、光行、光法、晨間選擇、晚間回望」不是為了替人生海域刷進度。

以下行為禁止成立：

- 狂 A 100 次直接生成一座島。
- 冥想 30 天自動完成某個航點。
- 光行標記直接轉成財務進度。
- 修習次數直接增加真實金額或預留款。
- 沒做修習造成世界倒退或已完成成果消失。

修習能做的，是形成「我」與「我的實踐方式」；它可以被使用者主動關聯到外行，但不能自動冒充現實成果。

## 2.3 外行不是內修的評分表

人生海域也不能反向把所有現實結果解讀成修行分數。

例如：

- 學費繳清不代表「信任 +10」。
- 旅行成行不代表「探索屬性升級」。
- 收入提高不代表「修為更高」。

外行結果可以成為收光回望的材料；對結果的意義仍由使用者在 Dojo 中理解與書寫。

---

# 3. 核心概念定義

## 3.1 行光道場（Dojo）

Dojo 是「人的修煉空間」。

Dojo canonical data 包含但不限於：

- 此刻的我
- 創現角色
- 角色稱號
- 核心特質
- 角色留言
- 狂 A / Affirm
- Vision / 視覺化沉浸
- 冥想與其他修習
- 光行／光法
- 晨間選擇
- 晚間收光
- 修習紀錄
- 週盤及其他 Dojo 專屬回顧結構

這些資料不因人生海域或 Wealth 的存在而搬家。

## 3.2 人生海域（Life Sea）

人生海域是「外在實踐的世界」。

它不回答「我是誰」，而回答：

> 我正在把這個自己活在哪裡？

Life Sea canonical data 包含：

- 人生海域
- 願景航線
- 航點
- 航線分支／路徑關係
- 出航意圖
- 外在行動
- 現實事件
- 抵達證據
- 抵達確認
- 改道／暫停／轉化等歷程

## 3.3 海域（Life Domain）

海域是「外在實踐領域」，不是財務 category，也不是人格屬性。

例：

- 學習海域
- 財富海域
- 工作／創造海域
- 關係海域
- 探索海域
- 生活／安穩海域

這些名稱目前僅是例子，schema 不把它們寫死。

海域可以由使用者建立、重新命名、排序、封存。

同一個內在特質可同時流入不同海域；特質不屬於海域。

## 3.4 願景航線（Vision Route）

願景航線是「一段外在人生規劃」。

特性：

- 航線可以跨海域。
- 航線不是 category。
- 航線可以新增航點、改道、分岔、暫停、重新排序。
- 改變願景不是失敗。
- 航線不因某一個財務 plan 完成而自動結束。

例：

```text
2027 回台與旅行航線

財富海域   ✦ 準備旅費
              ↓
工作海域   ✦ 安排工作與假期
              ↓
探索海域   ✦ 回到台灣
            ↙       ↘
關係海域 ✦ 與家人相聚   ✦ 泰國旅行 探索海域
            ↘       ↙
生活海域   ✦ 返回澳洲並重新安頓
```

## 3.5 航點（Waypoint）

航點是一個心願、階段目標、體驗或外在結果。

航點回答：

> 我想抵達什麼？

它不等於：

- 一筆帳單
- 一次修習
- 一個遊戲任務
- 一座島

每個航點第一版只有一個 primary life domain；跨海域由航線中的不同航點完成。

## 3.6 群島（Islands）

群島代表「已經在現實中形成、正在被生活出來的部分」。

它與願景航線的差異：

- **航線偏未來規劃。**
- **群島偏已經形成的現實。**

群島不是 canonical life data，而是 Wealth／人生海域視覺層的 world projection。

並非每個小航點都必須生成一座島。多個航點可以共同形成一個島、一個區域或一個設施。

---

# 4. 權威資料邊界

## 4.1 Authority Matrix

| 資料 | Canonical owner | Dojo | Life Sea | Wealth |
| --- | --- | --- | --- | --- |
| 此刻的我 | Dojo | 建立／修改 | 不複製 | 不複製 |
| 創現角色／特質 | Dojo | 建立／修改 | 只保存明確 export snapshot/reference | 只讀安全摘要 |
| 狂 A／冥想／Vision 等修習 | Dojo | 建立／修改 | 可接收使用者明確關聯的 reference/evidence | 不建立第二份 |
| 晨間選擇 | Dojo | 建立／修改 | 使用者選擇「帶到人生海域」時建立外行意圖 | 不直接寫 |
| 晚間收光 | Dojo | 建立／修改 | 只保存 reference | 不直接寫 |
| 人生海域 | Life Sea | 可讀 | 建立／修改 | 可讀 |
| 願景航線 | Life Sea | 可讀／可從 Dojo 入口編輯 | 建立／修改 | 可讀／可提供 lens |
| 航點 | Life Sea | 可讀／可關聯 | 建立／修改 | 可讀／可關聯財務證據 |
| 外在行動 | Life Sea | 可建立／回讀 | canonical | 可建立財務相關 evidence，不冒充一般行動 |
| 現實事件 | Life Sea | 可建立／回讀 | canonical | 可提供財務事件 reference |
| 抵達證據 | Life Sea | 可提供修習／反思 reference | canonical | 提供財務事實 evidence |
| 抵達確認 | Life Sea | 可由 Dojo／Life Sea UI 觸發 | canonical | 不自動宣告 |
| 銀行／帳戶／交易 | Wealth | 不碰 | 只保存 opaque reference + safe summary | canonical |
| 財務安排／預留／付款 | Wealth | 可引用 | 接收 evidence | canonical |
| 群島／建築／地標／海洋視覺 | Wealth projection | 不管理 | 提供 canonical input | projection only |

## 4.2 單一真相規則

同一種事實只能有一個 canonical owner。

禁止：

- Dojo 與 Wealth 各存一份「同一個願景」並雙向同步。
- Wealth 另建一份「航行者角色」與 Dojo 創現角色競爭。
- Wealth 另建一份每日狂 A 計數作為新的真相。
- Life Sea 複製完整銀行交易作為自己的帳本。
- Life Sea 保存完整私人修習內容，只為了方便顯示。

跨系統一律採：

> **reference / snapshot / evidence / projection，而不是 duplicated authority。**

---

# 5. 內修 → 外行 Bridge

## 5.1 出航不是每筆修習都自動發生

Dojo 內的紀錄預設只屬於 Dojo。

只有使用者明確做出「帶到人生海域」的選擇時，才建立 Life Sea 的外行資料。

例如晨間：

```text
此刻的我
→ 創現角色
→ 今天的選擇：「把 Brighton 下一期學費安排好」
→ [帶到人生海域]
```

才產生一筆：

`practice_intent`

## 5.2 Practice Intent

Practice Intent 是「從內修出發的外行意圖」。

最小資料：

- id
- practitioner_id
- local_date
- occurred_at
- timezone
- choice_text
- role_reference
- role_snapshot（只保存必要安全摘要）
- source_dojo_record_id
- linked_route_id（可空）
- linked_waypoint_id（可空）
- status
- revision
- created_at
- updated_at

role snapshot 用途是保留「當時我是以什麼角色／特質出航」，但不取代 Dojo role。

## 5.3 角色 snapshot 不反向同步

如果之後 Dojo 的創現角色改名：

- 過去 Practice Intent 的 snapshot 保留當時內容。
- current role 仍由 Dojo 查詢。
- Life Sea 不修改過去歷史。

---

# 6. 外行資料模型

第一版建議建立獨立 PostgreSQL schema：

`life_sea`

它可以與 Wealth PostgreSQL 位於同一個 PostgreSQL cluster，但必須：

- 使用獨立 schema owner／DB role。
- 不使用 Wealth app 的完整 DB credential。
- Dojo 只透過 server-side Life Sea store 存取。
- Wealth 不直接 SQL 寫入 `life_sea.*`。
- Wealth 透過 signed internal API 提交 evidence。
- 未來若要搬到獨立 DB，API contract 不需改變。

## 6.1 第一版最小 tables

### `life_sea.practitioners`

技術 identity，用於跨系統穩定識別。

它不是產品上的「比 Dojo 更高層的人格 Core」。

### `life_sea.system_identity_bindings`

將：

- Dojo owner/install identity
- Wealth owner_id
- 未來其他 Lumen system identity

綁到同一 practitioner。

不得把 `wealth.app_users.id` 直接當全系統 person id。

### `life_sea.domains`

海域。

必要欄位：

- id
- practitioner_id
- name
- description
- status: active / archived
- sort_order
- revision
- created_at
- updated_at

### `life_sea.routes`

願景航線。

必要欄位：

- id
- practitioner_id
- title
- description
- status: draft / active / paused / completed / archived
- revision
- created_at
- updated_at

Route 本身不保存 domain_id。

### `life_sea.waypoints`

航點。

必要欄位：

- id
- practitioner_id
- route_id
- primary_domain_id
- title
- description
- target_date（可空）
- status
- revision
- created_at
- updated_at

第一版 waypoint status：

- `planned`
- `underway`
- `ready_to_confirm`
- `arrived`
- `paused`
- `transformed`
- `released`

不使用 `failed` 作為人生願景的預設狀態。

### `life_sea.route_edges`

支援航線分岔與重新編排。

欄位：

- id
- route_id
- from_waypoint_id
- to_waypoint_id
- relation_kind: next / optional / branch / merge
- sort_order

同一路線不得形成未經允許的循環；第一版預設 DAG。

### `life_sea.practice_intents`

Dojo → Life Sea 的出航意圖。

### `life_sea.outward_actions`

使用者實際採取的外在行動。

例：

- 聯絡學校
- 訂票
- 完成報名
- 送出申請
- 實際付款以外的生活行動

### `life_sea.life_events`

現實實際發生的事件。

例：

- 正式開始上課
- 抵達台灣
- 收到重要回覆
- 與家人完成一次旅行
- 收到支持

事件不必有正負分數。

### `life_sea.waypoint_evidence`

把外部或內部證據連到航點。

必要欄位：

- id
- practitioner_id
- waypoint_id
- source_system
- source_type
- source_id
- evidence_kind
- occurred_at
- timezone
- local_date
- safe_summary
- evidence_status
- source_revision / source_hash（若有）
- created_at
- updated_at

禁止保存完整銀行 OCR、帳號、token、完整私人修習內容。

### `life_sea.arrival_confirmations`

記錄使用者真正確認「我抵達了」。

必要欄位：

- id
- waypoint_id
- confirmed_at
- timezone
- local_date
- note
- actor
- evidence_snapshot
- created_at

這是 audit record，不因 waypoint 後續編輯而消失。

### `life_sea.integration_receipts`

跨系統 idempotency / receipt。

必要欄位：

- source_system
- idempotency_key
- request_hash
- result_ref
- first_seen_at
- last_seen_at

### `life_sea.audit_events`

只記安全 metadata，不保存 sensitive payload。

---

# 7. 航點狀態機

## 7.1 狀態不是「遊戲任務完成率」

```text
planned
   ↓
underway
   ↓
ready_to_confirm
   ↓
arrived
```

任何階段可以：

```text
→ paused
→ transformed
→ released
```

## 7.2 Evidence 只能改變 readiness，不得自動宣告人生完成

外部 evidence 可以：

- 讓 planned → underway。
- 讓 underway → ready_to_confirm。
- 更新「已有什麼現實證據」。

但第一版不得因規則自動把 waypoint 改成 `arrived`。

`arrived` 必須來自使用者明確確認。

## 7.3 Evidence 不需要全部完成

航點不是 checklist engine。

第一版允許使用者在有足夠證據時自行確認抵達；系統可以提示，但不必建立固定「3/5 條件」。

未來若特定航點真的需要 objective completion rules，再另加明確規格，不在本次基線中預設。

---

# 8. Wealth → Life Sea 邊界

## 8.1 Wealth 是財富事實的唯一 authority

以下一律留在 Wealth：

- accounts
- transactions
- ledger entries
- payroll
- plans
- reserves
- bank inbox
- bank OCR/candidate
- actual financial status

Life Sea 不複製帳本。

## 8.2 財務 plan 可以「關聯」航點

例如：

```text
Waypoint:
完成 Brighton 本期學習準備

↕ linked evidence source

Wealth plan:
Brighton 學費 AUD 1,550
```

這是 link，不是 merge。

## 8.3 財務 evidence 分兩類

### Current-state assertion

例如：

- 已預留 AUD 300 / 1550
- 已預留足額

這種狀態應以固定 evidence key upsert，不為每次調整新增無限歷史列。

### Immutable event evidence

例如：

- 學費於 2026-10-19 實際付款

這種是一次性事件，使用 source transaction ID 去重。

## 8.4 財務成功不能被 Life Sea rollback

正確流程：

```text
Wealth command
   ↓
Wealth PostgreSQL COMMIT
   ↓
Wealth integration outbox
   ↓
signed Life Sea API
   ↓
Life Sea receipt/evidence
```

如果 Life Sea 暫時不可用：

- 真實財務操作仍然成功。
- outbox 保留 pending。
- 使用同一 idempotency key 重送。
- UI 顯示「人生海域同步待處理」。
- 絕對不能再次執行財務付款。

## 8.5 Life Sea 永遠不能寫 Ledger

Life Sea API 沒有任何端點可以：

- 建立交易
- 修改餘額
- 調整預留
- 付款
- 改銀行 candidate

若人生海域 UI 要觸發財務行動，必須導回 Wealth 明確執行。

---

# 9. Dojo 修習與 Life Sea 的邊界

## 9.1 Dojo practice 保持 canonical

現有：

- Affirm Practice
- Vision Practice
- generic DojoEntry
- 光行／光法
- 未來冥想類紀錄

仍由 Dojo 保存。

Life Sea 預設只看得到：

- source reference
- practice type safe label
- date/time
- 使用者明確授權的摘要

## 9.2 私人紀錄不得被默認外送

Dojo privacy 為「私人」時：

- 不自動建立 Life Sea evidence。
- 即使使用者關聯航點，也只傳遞必要 reference / safe summary，完整正文仍留在 Dojo。
- 任何跨系統展示都不能繞過 Dojo 的 privacy rule。

## 9.3 Manifestation Milestone 需拆語意，不整批搬

現有 Dojo `ManifestationMilestone` 同時含：

- action
- response
- trait
- reflection

這混合了「外行事實」與「內修理解」。

新流程應逐步拆成：

```text
Life Sea outward_action / life_event
        ↑ reference
Dojo manifestation milestone / reflection
```

歷史 milestone 不自動拆解；避免錯誤推論。

---

# 10. 外行 → 回照 Bridge

## 10.1 晚間收光需要讀到「今天在外面發生了什麼」

Dojo 晚間可讀 Life Sea 的：

- 今天建立的 Practice Intent
- 今天完成的 Outward Action
- 今天發生的 Life Event
- 今天新增或更新的 Evidence
- 航點狀態變化
- 抵達確認

但這些只是回望材料，不是自動生成的結論。

## 10.2 Reflection 仍然存在 Dojo

使用者寫：

- 一束光
- 實踐回望
- 卡點與消耗
- 發現
- 小調整

內容 canonical 留在 Dojo。

Life Sea 只保留：

- dojo_reflection_id
- linked practice_intent / route / waypoint
- local_date
- optional safe label

不複製完整晚間內容。

## 10.3 回照可以影響下一輪規劃，但不偷偷改航線

Dojo 可提示：

- 「要不要重新看這個航點？」
- 「要不要改道？」
- 「要不要暫停這條航線？」
- 「要不要把今天的發現帶到明天？」

任何 route/waypoint mutation 都需要使用者明確操作。

---

# 11. 時間模型

現況存在：

- Wealth 使用 `Australia/Melbourne`
- Dojo 既有部分功能使用 `taipeiTodayISO()`

跨系統後不得只存 date。

Life Sea 事件類資料一律至少保存：

- `occurred_at timestamptz`
- `timezone text`
- `local_date date`

規則：

1. local_date 是使用者當下所在地／明確選擇 timezone 的日曆日期。
2. occurred_at 是可排序的實際時間。
3. timezone 保存 IANA 名稱，例如 `Australia/Melbourne`。
4. 旅行時保留當時的 timezone，不事後重算。
5. 不得用 DB server timezone 重建歷史 local_date。

---

# 12. API 與技術落點

## 12.1 第一版不建立新的「高層產品 Core」

技術上需要 shared service boundary，但產品語意仍是：

> Dojo → Life Sea → 外部實踐系統

因此第一版建議把 Life Sea API 放在 Lumen-Dojo server 內：

```text
Lumen-Dojo
  /api/life-sea/...
  lib/life-sea/...
        ↓
  restricted PostgreSQL role
        ↓
  life_sea schema
```

未來若流量或部署邊界需要，再抽成獨立 service；API contract 保持不變。

## 12.2 Wealth 不直接連 Life Sea tables

Wealth 使用 server-to-server API：

```text
/internal/v1/life-sea/evidence
/internal/v1/life-sea/references
```

實際 URL 可在 implementation plan 再定，語意與 auth contract 在此先鎖。

## 12.3 Service-to-service mutation 必須具備

- caller identity
- HMAC / bearer-style service authentication
- timestamp
- nonce / replay protection
- idempotency key
- request hash
- bounded payload
- audit receipt
- retry-safe response

可沿用目前 D-3.7 已建立的 handoff / receipt / idempotency 思維，但不得直接重用不相容 schema。

## 12.4 UI mutation 使用 optimistic concurrency

Route、Waypoint、Domain 等 mutable entity 具有 `revision`。

修改時要求 expected revision。

若已被其他裝置更新：

- 409
- 重新讀取
- 不 last-write-wins 靜默覆蓋

---

# 13. DB 權限模型

即使 `life_sea` 與 Wealth tables 在同一 PostgreSQL cluster，也不得共用全權 credential。

至少：

## `life_sea_app`

- CRUD `life_sea.*`
- 無權修改 Wealth financial tables

## `wealth_app`

- 保留既有 Wealth tables 權限
- 無權直接修改 `life_sea.*`

## migration/admin role

- 僅 deployment / migration 使用
- App runtime 不持有

Dojo server 使用專用 `LIFE_SEA_DATABASE_URL` 或等價 restricted credential。

不得把 Wealth 的 production `DATABASE_URL` 原樣放進 Dojo。

---

# 14. Integration Failure Rules

## 14.1 Dojo 保存成功、Life Sea export 失敗

如果晨間選擇已保存在 Dojo，但「帶到人生海域」失敗：

- Dojo 紀錄保持成功。
- export 顯示 pending/failed。
- 使用同一 key 安全重送。
- 不重建第二筆晨間紀錄。

## 14.2 Wealth 保存成功、Life Sea evidence 失敗

- Wealth 真實操作保持成功。
- outbox 保留。
- 不重複財務操作。
- Life Sea 恢復後重送。

## 14.3 Life Sea 讀不到 Dojo

人生海域仍可顯示自身 canonical 外行資料。

需要 current role 時：

- 顯示「角色資料暫時無法讀取」
- 可顯示 Practice Intent 當時 snapshot
- 不假裝 current role 沒有變

## 14.4 Life Sea 不可用

Dojo 的：

- 修習
- 晨間
- 晚間

不能因此整體失效。

Wealth 的：

- 記帳
- 付款
- 預留
- 銀行流程

也不能因此失效。

Life Sea 是跨系統外行層，不是兩個核心 App 的單點故障開關。

---

# 15. 既有資料處理

## 15.1 Dojo 資料

### 保留 Dojo authority，不搬

- CreativeRoleProfile
- AffirmPracticeRecord
- VisionPracticeRecord
- generic DojoEntry
- 光行／光法
- 晨晚／週盤

### 不自動轉換歷史 ManifestationMilestone

原因：同一 record 混合 action / response / trait / reflection。

之後可提供「整理到人生海域」人工工具，但不是 migration prerequisite。

## 15.2 Wealth 資料

### `wealth_visions`

視為 Life Sea waypoint / route candidate。

不得自動依名稱猜 route/domain。

Migration 流程：

1. preview
2. 顯示原 vision
3. 使用者選：
   - 建成一條新航線
   - 加入既有航線作為航點
   - 暫不搬
   - 封存 legacy
4. 寫 migration source map
5. rerun-safe

### `wealth_vision_updates`

不得全部一對一轉成同一種類。

依內容與 kind 進 preview：

- imagination / intention → 規劃歷程候選
- preparation / action → action/evidence 候選
- milestone / event / result → life_event / evidence 候選
- reflection → 不自動搬；優先保留 legacy 或人工整理至 Dojo

### `abundance_events`

語意上較接近 Life Sea `life_event`。

仍需 migration preview；有 transaction_id 時只保存 external reference，不搬 transaction payload。

### `wealth_practices`

現有資料只有每日 aggregate count。

禁止：

> count = 5 → 製造 5 筆 practice_event

處理：

- legacy read-only aggregate
- 新 Life Sea/Dojo 流程啟用後停止增加
- UI 可標示「舊版每日練習計數」
- 不作為新航行者養成的 canonical event

---

# 16. Migration Source Map

建立可追蹤 migration mapping：

`life_sea.migration_source_map`

至少包含：

- source_system
- source_type
- source_id
- source_hash
- target_type
- target_id
- migration_status
- migrated_at
- reviewed_at

要求：

- idempotent
- rerun-safe
- 不靠 title dedupe
- source hash 不同時停止並要求重新 preview
- migration 不刪原資料
- cutover 與 cleanup 分開

---

# 17. 世界遊戲化投影

## 17.1 世界狀態不是生命真相

Wealth 或未來 Life Sea visual client 可以建立：

- world regions
- islands
- facilities
- landmarks
- route visual states
- fog / discovered state
- visual progression

但它們必須是 derived projection。

## 17.2 Projection inputs

第一版主要輸入：

- active domains
- routes
- waypoints
- waypoint statuses
- arrival confirmations
- selected life events
- selected evidence
- user-chosen world mapping

Dojo practice count 不直接成為 island completion。

## 17.3 可重建原則

若遊戲規則改版：

```text
Canonical Dojo + Life Sea + Wealth facts
               ↓
        rebuild projection
               ↓
   新版群島／設施／地標
```

不得要求 rollback 人生資料。

## 17.4 群島的現實性

群島代表已形成／正在形成的現實，因此：

- 純規劃中的願景先存在航線與航點。
- 發生真實外行後可以逐漸出現陸地輪廓。
- confirmed arrival 或其他明確現實成果可形成永久地標。
- 改道不抹除已經真實發生的歷史。

---

# 18. 不做事項（Hard Boundaries）

本架構第一階段明確不做：

- 不建立中立「Lumen Core」作為人的最高 authority。
- 不把 Dojo 全部搬進 PostgreSQL。
- 不把 Notion 全面淘汰。
- 不搬 Learning Foundation、野採、週盤等無關資料。
- 不重構所有 Wealth public tables 到 `wealth.*` schema。
- 不讓 Wealth 擁有願景航線。
- 不讓 Life Sea 直接寫帳本。
- 不讓 Dojo 直接 SQL 讀 Wealth financial tables。
- 不用修習次數換 XP 來代替真正的系統連結。
- 不做 streak 斷線懲罰。
- 不讓外部 evidence 自動宣告人生願景完成。
- 不把同一資料雙寫成兩套 authority。
- 不在 migration 後立即 drop legacy tables。
- 不用名稱相似自動合併願景。
- 不在沒有明確授權時把私人 Dojo 內容外送。

---

# 19. 建置流程與 Gate

整體建置拆成 D0–D8。每個 Gate 必須獨立驗收；前一 Gate 未通過，不開始下一 Gate 的 production cutover。

## D0｜Architecture Contract

輸出：

- 本 Design Spec
- entity ownership matrix
- state machine
- API boundary
- failure semantics
- migration map
- privacy rules
- timezone rules

Gate：

- 使用者確認設計
- 無未解決的 authority 衝突
- 不實作 code

## D1｜Life Sea Foundation

新增：

- `life_sea` schema
- migrations
- restricted DB role
- practitioner / identity binding
- domains
- routes
- waypoints
- route_edges
- practice_intents
- outward_actions
- life_events
- waypoint_evidence
- arrival_confirmations
- integration_receipts
- audit

要求：

- additive only
- isolated PostgreSQL integration test
- migration rerun safe
- 沒有 production data migration
- 沒有 Wealth / Dojo cutover

## D2｜Dojo → Life Sea 出航

建立：

- Dojo server-side Life Sea adapter
- 「帶到人生海域」明確操作
- Practice Intent
- route / waypoint basic authoring
- role snapshot/reference
- privacy gate
- retry/idempotency

Gate：

- Dojo 本地保存即使 Life Sea 失敗仍正常
- export retry 不重複
- private data 不外洩
- timezone 正確

## D3｜Life Sea → Dojo 回照

建立：

- 今日外行摘要
- 晚間收光可讀取今日外在實踐
- reflection reference 回寫 Life Sea
- 不複製完整晚間內容

Gate：

- 內修 → 外行 → 回照可完整跑一輪
- 任何 Life Sea 異常不阻斷 Dojo 內修

## D4｜Wealth Evidence Bridge

建立：

- Wealth source linking
- Wealth transactional outbox
- signed evidence API
- current-state assertion upsert
- immutable payment event
- receipt / retry / dedupe

Gate：

- Wealth commit 成功後才送 evidence
- Life Sea failure 不 rollback Wealth
- 重送不重複付款／evidence
- Life Sea 無法修改 ledger

## D5｜Waypoint Readiness / Arrival

建立：

- evidence aggregation
- ready_to_confirm 提示
- user explicit arrival confirmation
- transformed / paused / released
- audit

Gate：

- 沒有 auto-arrival
- 改道不視為失敗
- arrival confirmation 可追溯

## D6｜Legacy Wealth Migration

只做 preview-first：

- wealth_visions
- wealth_vision_updates
- abundance_events
- wealth_practices legacy freeze

Gate：

- source map 完整
- hash/revision 檢查
- rerun-safe
- 不刪原資料
- 使用者可逐項接受／跳過

## D7｜World Projection / Gamification

才開始：

- 豐盛海洋
- 海域視覺
- 跨海域航線
- 航點
- 群島
- 設施
- 地標
- 航行者視覺呈現

Gate：

- projection 可由 canonical data 重建
- projection mutation 不改 canonical facts
- 不以花更多錢／收入更高作為主要遊戲獎勵
- 不以修習刷次數作為世界建設捷徑

## D8｜Hardening & Legacy Cleanup

只有穩定運作一段時間後：

- freeze legacy writes
- read-only archive
- remove obsolete UI
- final rollback assessment
- 才考慮 drop obsolete structures

Drop 不與 migration/cutover 同一工作包。

---

# 20. 測試策略

## 20.1 Domain tests

必測：

- cross-domain route
- branching route
- reroute
- transformed waypoint
- evidence aggregation
- explicit arrival
- role snapshot history
- timezone boundary
- privacy export

## 20.2 Integration tests

### Dojo → Life Sea

- request success
- response loss
- retry same idempotency key
- Core unavailable
- private practice
- role changed after snapshot

### Wealth → Life Sea

- transaction committed + evidence success
- transaction committed + evidence timeout
- outbox retry
- duplicate receipt
- source state revised
- Life Sea unavailable

### Life Sea → Dojo

- evening summary available
- summary partial failure
- reflection save success + reference failure
- reference retry
- Dojo remains authoritative

## 20.3 Migration tests

- preview only
- no mutation
- accepted migration
- repeated same migration
- source changed after preview
- skip
- rollback before cutover
- legacy data remains readable

## 20.4 Security tests

- Wealth credential cannot mutate life_sea DB directly
- Dojo runtime credential cannot mutate financial tables
- invalid service signature
- stale timestamp
- replayed nonce
- mismatched idempotency hash
- sensitive financial payload rejected/log redaction
- private Dojo body absent from Life Sea

---

# 21. Acceptance Criteria

這套架構只有在以下條件成立時才算符合設計：

1. 使用者只需要維護一個創現角色；Wealth 不建立第二角色。
2. 狂 A／冥想等修習只在 Dojo 有 canonical record。
3. 同一條願景航線能跨越多個人生海域。
4. 航點能接收 Wealth、Dojo 與人工外行的不同 evidence。
5. Wealth 可以證明「學費已付款」，但不能自行宣布「學習願景已完成」。
6. 使用者能明確確認「抵達」。
7. 晚間收光能看到當天外行發生的事，但回望正文仍只屬於 Dojo。
8. Life Sea 壞掉時，Dojo 修習與 Wealth 記帳仍可正常使用。
9. 財務操作成功後，不因跨系統同步失敗而 rollback 或重做。
10. 群島世界可以重建，不會成為人生真相的唯一來源。
11. 舊資料 migration 不猜測、不覆蓋、不刪除。
12. 日期在 Melbourne、Taipei 或旅行時區下都能保留原本 local date。
13. 所有跨系統 mutation 都可安全重試。
14. Dojo 始終是「我修煉的基準點」；人生海域始終是「我在外的實踐場」。

---

# 22. 目前保留到後續設計的議題

以下不是本架構的 blocker，留到 D7 Gameplay Design 再決定：

- 最終有哪些人生海域與預設名稱
- 海域是否有固定視覺 archetype
- 群島與航點的投影規則
- 一個島可容納多少航點／願景
- 設施／地標的種類
- 航行者外觀
- 世界探索迷霧呈現
- 是否存在任何非競爭性的成長量表
- 海圖的實際 UI layout
- 美術風格與動畫

這些不能反過來改寫本 Spec 的 authority boundary。

---

# 23. 架構總圖

```text
                         ┌──────────────────────┐
                         │      行光道場        │
                         │        DOJO          │
                         │                      │
                         │ 此刻的我             │
                         │ 創現角色／特質       │
                         │ 狂A／冥想／修習       │
                         │ 晨間選擇             │
                         │ 晚間收光             │
                         └──────────┬───────────┘
                                    │
                         明確選擇「帶到外面」
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │      人生海域        │
                         │      LIFE SEA        │
                         │                      │
                         │ 海域                 │
                         │ 願景航線             │
                         │ 航點                 │
                         │ 外在行動             │
                         │ 現實事件             │
                         │ 抵達證據             │
                         │ 抵達確認             │
                         └───────┬──────┬───────┘
                                 │      │
                     evidence    │      │  今日外行
                                 │      │
               ┌─────────────────┘      └──────────────┐
               ▼                                       ▼
      ┌──────────────────┐                    回到 Dojo 收光
      │ Luminara Wealth  │
      │                  │
      │ 帳戶／交易       │
      │ 預留／付款       │
      │ 薪資／銀行       │
      └────────┬─────────┘
               │
               │ canonical facts
               ▼
      ┌────────────────────────┐
      │ World Projection       │
      │ 豐盛海洋               │
      │ 航線視覺               │
      │ 群島／設施／地標       │
      └────────────────────────┘

          「內修 → 外行 → 回照」永遠是主循環
```

---

# 24. 最終設計句

> **行光道場是我修煉自己的基準點；人生海域是我把正在修煉的自己帶進現實的外在實踐場。願景航線描述我要怎麼走，航點描述我想抵達什麼，群島留下已被我真正活成現實的部分。Wealth 等外部系統只提供現實證據；所有經驗最後回到行光道場，被我重新理解，成為下一輪修煉與出航的起點。**
