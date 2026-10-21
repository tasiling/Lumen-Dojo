# 第四包：純文字與三平台版本實作計畫

> 執行方式：Native、測試驅動；每個任務先觀察失敗，再做最小實作並提交。正式 merge／deploy 不在本包。

## Task 1：文件與測試骨架

- 建立本 spec／plan 及隔離測試資料規則。
- 新增 domain 測試，先覆蓋單平台、分段限制、不可變版本與狀態驗證。
- 驗證測試因模組不存在而 RED。

## Task 2：平台版本 domain

- 在 `lib/dojo/liaojieText/` 建立 model、adaptation 與 validation。
- 新增正式資料前綴，避免通用知識列表混入系統狀態。
- 平台初稿只重排固定原稿；不增加觀點。
- 跑 domain 測試至 GREEN 並提交。

## Task 3：耐久 store 與 API

- 實作 list/read/create/save/restore/status 操作。
- 使用既有 durable receipts、stable operation steps、expected revision 與 source publication policy。
- 新增 `/api/dojo/liaojie-text-variants`，維持 owner access。
- 建立實際 API 測試：重送、部分成功、未知結果、衝突、來源撤權、版本歷史與單平台。
- 跑測試至 GREEN 並提交。

## Task 4：噗浪蓋樓交接

- 擴充噗浪 draft metadata，保留來源 variant/version。
- 實作 idempotent create/update bridge；相同版本不重建，新版明確交接才更新。
- 測試只建立草稿而不公開、字數規則及來源撤權。
- 跑測試至 GREEN 並提交。

## Task 5：同源 React 工作區

- 抽出共用 `TextPlatformPreview`。
- 在聊解室加入四步平台工作區、單平台建立、區塊編輯、語氣／修改註記、即時計數、歷史與回復、ready/schedule/published、噗浪交接。
- 用 `useWeavingDraft` 保留 dirty/failure/conflict recovery；外部 AI 僅提供可複製改寫指令與貼回介面。
- 將舊通用欄位降為相容資訊，不阻礙新流程。
- 新增 production UI 測試並提交。

## Task 6：全矩陣驗證與交付

- 以隔離素材跑文章固定成品到所選平台交接。
- 實際截圖 375／390／430／320／1024px，覆蓋空／非空、dirty、failure/conflict、ready、handoff。
- 跑 domain/API/UI、整套 weaving/reading/proposals 回歸、build、typecheck、lint。
- 請一位全新上下文 reviewer 唯讀審查整個分支差異；依原嚴重度一次修正，重跑相關及整體測試。
- 更新 delivery、evidence、roadmap 與 `docs/creative-build-progress.md`，提交並非 force 推送至同一 PR101。
