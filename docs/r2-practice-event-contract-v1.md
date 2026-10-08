# Practice Event Contract v1 — 修習完成成果契約

本契約記錄活動完成事實，不是能力 Assessment，不是素材 Source Handoff。
供 R2-5A Context Room、R2-5B VocabForge、R2-5C Dojo receiver 後續使用；R2-3 只實作 Dojo 日記段落，沒有外部 receiver、派送或外站變更。

## 身分與權限

- `eventVersion: 1`, `eventType: practice.completed`。
- 去重鍵：server owner + `sourceSystem` + `sourceType` + `sourceId`。Dojo 事件 ID 是這四個字串的 JSON array UTF-8 SHA-256；只在明確 mutation 計算與保存，GET 不生成 ID。
- 本地日記來源為 `dojo / english-journal-segment / {Notion practice page ID}:{persisted segment ID}`。標題、日期文字、按鈕次數、週盤格 index 都不是身分。
- 同來源重送回已保存事件；revision 更新不是第二次練習。新 session 的新來源 ID 才是新事件。
- owner 只使用 R2-1 的 server-configured DB14／登入金鑰；不得接受 caller owner、資料源或完成宣告。日記 handler 用伺服器既有內容與有效完成條件驗證。
- 所有新 GET/mutation 驗證登入；mutation 沿用 origin 檢查及共用持久檔案鎖。未授權 401，跨 owner／來源 403，缺資料 404，stale／重複身分／鎖占用 409，輸入不符 400，外部不可用／結果不明 503。

## 完成與日期

事件保存 `occurredAt`（ISO timestamp）、`practicedOn`（實際修習日期）、`timeZone`（當時 DOJO_TIME_ZONE）、`sourceDate`（原始日記日期）、`createdAt`。
`sourceRevision` 表示已驗證的 journal mutation revision。`syncedAt` 是投影更新時間，不取代 practicedOn。
例如 10/01 自譯 09/20，10/03 重試，事件與 output 仍屬 10/01。時區取既有設定，不能由前端覆寫。
有效、未完成段落達到初稿＋AI 修訂或定稿的現有條件才計入。略過、空白、複製 prompt、儲存草稿、重複完成不計。
`learningItemIds[]` 使用底座 ID，`learningRecordId` 指向唯一正文。英文底座尚未銜接時明確 409，不自動 seed，不假造學科 ID。
`completionKind: journal-self-translation`, `quantity: 1`, `unit: 段`。正文 completed 只表示紀錄寫完。

## Event first / projection second

1. 共用 writer lock 下讀取來源、驗證 revision／完成條件。
2. 逐筆保存事件；每筆 create 禁止 SDK 自動 retry，先 fsync source identity intent。
3. 保存 journal 狀態及對應逐筆 Learning Record 正文。
4. 投影 practicedOn 的 DailyRecord output。
5. 僅在明確 binding 時投影現存週盤任務。

事件最初保存有界的待寫正文 outbox；正文確認後清空 evidence，僅保留 learningRecordId，避免永久複製正文。
跨 Notion request 沒有 transaction，可能部分成功。事件保存各步 `pending/applied/needs_retry/unlinked/unmatched`、`projectionRevision`、`error`。
有已确认事件、投影失敗：重試只補尚未完成投影，不需重新完成練習。已 applied 是 no-op。
事件 create response 遺失：503，保留 mutex／intent；不可自動重送 create。確定零 dispatch 的讀取失敗會釋放鎖。即使呼叫端捕捉 exception，未確認 mutation 仍由 writeOutcome 阻止派送並保留 mutex。
只允許管理者根據實際 Notion page/source ID、intent、確認／結果不明寫入證據核對恢復；沒有 TTL、重啟解鎖或自動清理 intent。

## 光步與週盤

每日 output 是 set 類別，三段仍一個 output。共用鎖下讀最新 DailyRecord，保留 input/vocabulary/transfer、note、vocabForgeRounds、所有其他欄位。
舊每日表單 PUT 以 updatedAt 檢查版本；server-owned `practiceEventOutput` 由相容寫入層保留，不接受前端新設旗標。

binding 是 `{ weekStart, taskInstanceId }`，由使用者選擇現存本週任務；拒絕由 index 組成的 legacy ID。移格不改來源事件與 task ID。事件 GET 唯讀核對目前 binding，衍生 bindingStatus；已移除 target 顯示未連結，但不改寫既有投影事實。
不存在／封存／被移除／歧義：事件保留，週盤未連結；不搜尋相似文字，不新增格子，不改範本或歷史設定。
只支援單位完全相同的 single/count 自動投影。count 一個事件 +1，single 達 target；段／篇不轉換，specified/free 未匹配。
同週 cell `completionSources` 保存處理過的 event ID 與手動 progress，顯示 progress = min(target, max(manual, automatic))，不是盲目相加。相容 normalizer 保留 ledger；舊表單不能換掉事件來源。
未連結／未匹配是可見終態，不自動重綁。日後新增綁定／更改規則須另行明確版本化 mutation，本包不暗中重投歷史週盤。

## 來源生命週期

source update：既有 event identity／occurredAt／practicedOn 不變，不因更新 revision 再計數。Learning Record 可另外帶 revision 編輯。
source archived：明確日記 DELETE 成功後標記對應事件 sourceStatus archived，保留事件與正文，不撤回過去 output。
source withdrawn：契約預留 withdrawn，代表完成宣告撤回；不得刪事件、重建事件或自動減去手動成果。投影停止，需有明確 owner 核對／補償操作。R2-3 不公開通用撤回 API；外站無法用本地 retry API 改 source status。
projection retry：`POST /api/dojo/practice-events { action: retry, id }`，只接受既存本地事件。

## 分頁與長期保存

Learning Record 與事件在 DB14 各自一列 JSON，不放入 activityLog，不截 160 筆。
Learning Record title 含 practicedOn 與 stable ID，以 Notion title descending 排序、原生 start_cursor 分頁；事件按 created_time descending，實際 practicedOn 在每筆顯示。
GET filters 在單一原生頁後套用；篩選頁可能為空，但 cursor 仍可繼續，不能把空頁當歷程結束。不是固定 snapshot pagination；同時編輯日期／建立新列可能改排序，重新整理列表可取得最新狀態。
GET 不建立事件／seed、不修補投影、不更新週盤。舊 activityLog 僅相容摘要，不自動 migration。
SourceRefs 儲存 stable pointer、標籤及必要摘要；來源 available/archived/missing/unverified 不會抹去正文。新內部素材／閱讀 refs 由 server 驗證固定資料源，外部網址保留 unverified。
