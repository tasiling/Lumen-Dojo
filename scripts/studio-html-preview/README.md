# 可獨立開啟的草稿 HTML

使用正式 React 元件及純資料／指令模組；`local-api.ts.in` 只模擬 transport 和本機資料，不連正式 Notion、AI、Canva 或社群服務，不取代原生 API 測試。

`.ts.in`／`.tsx.in` 是離線打包器的 TypeScript 輸入，使用檔案路由／transport 替身；不匯入 Next 的正式編譯目標。

先完成 `npm run build`，再執行 `npm run preview:creative-studio-html`。不要在 Next 建置中途打包 CSS。

- `STUDIO_PREVIEW_OUT`：輸出 HTML 的絕對路徑。
- `STUDIO_PREVIEW_SOURCE`：精確的來源 commit SHA；未提供則採目前本地 HEAD。
- `STUDIO_HTML_PATH=/absolute/file.html node scripts/test-studio-b-repair-ui.mjs`：執行自然貼回、多平台、研究用途、字體放大及整份備份還原驗收。

保持 `lumen-creative-draft-html-pr114-v1` 原本儲存識別，舊預覽資料經原生 normalize 函式補預設值。完整預覽備份只可從「載回這份 HTML 的預覽備份」恢復；正式舊資料匯入為另一個流程。更新交付時替換同一 Library 項目，不另建分岔。

## 在最新媒體草稿上更新研究討論

版本8已在其他工作中加入媒體製作。本次使用`upgrade-discussion.mjs`，不從舊入口重建整份HTML：

`STUDIO_DISCUSSION_BASE=/absolute/version8.html STUDIO_DISCUSSION_OUT=/absolute/output.html STUDIO_DISCUSSION_SOURCE=<commit> node scripts/studio-html-preview/upgrade-discussion.mjs`

腳本鎖定已審查版本8雜湊，核對兩個研究模組及依賴，驗證其他模組保留。更新的兩模組原生來源仍由Next build及原生API測試驗證。測試：`test-studio-discussion.mjs`、`test-studio-discussion-ui.mjs`，及HTML限定`test-studio-discussion-media.mjs`。
