# 聊解室原工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Native execution as previously authorized.

**Goal:** 五個既有HTML工具保留原方法並在聊解室可操作。
**Architecture:** 私有原檔與manifest，React總覽／外殼，opaque iframe及本裝置快照橋接；既有發布台不改資料模型。
**Tech Stack:** Next16/React19、IndexedDB、原HTML/Canvas、Playwright。
**Spec:** docs/superpowers/specs/2026-10-22-liaojie-original-tools-design.md

## Global Constraints
- 五份原檔保持SHA不變；知識鑽石為正式產品名稱。
- 不新增套件、不寫正式Notion、不自動發布社群。
- 本裝置保存與雲端資料明確區分。

## Review Focus
- 匯入錯工具／損壞JSON保留現稿。
- 兩視窗不默默覆蓋。
- 檔案和節點文字不能逃出隔離框架。
- 斷線／保存失敗仍可備份。
- 手機容器不裁切原圖輸出。

### Task 1: 原檔、路由與工具入口
- [x] 寫整合測試：未登入拒絕、總覽五入口、知識鑽石A產指令、IG對話／雜誌／拱門與PNG。
- [x] 執行觀察缺少路由失敗（HTTP404）。
- [x] 實作manifest、非public原檔loader、總覽、工作區，連接聊解室和發布台。

### Task 2: 保存與隔離
- [x] 測試刷新還原草稿與節點、跨工具隔離、錯誤JSON、保存衝突、真PNG下載（TXT為保留原功能，未新增獨立下載驗收）。
- [x] 實作opaque sandbox、快照適配、IndexedDB原子版本保存、JSON備份還原。
- [x] 執行production UI與五尺寸截圖；修正失敗。

### Task 3: 交付
- [x] tsc、受影響eslint、build，核對原檔SHA。
- [ ] 審查diff與安全／功能邊界，更新進度並push PR。
