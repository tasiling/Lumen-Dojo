# 聊解室原工具接入

入口：聊解室 → 創作工具（`/liaojie/tools`）；原發布工作台也可開啟。知識鑽石、日上三更單篇／批次、雜誌對話、IG輪播共五個原工具均保留。

## 原檔來源與完整性

下列為Crystal於2026-10-18提供並明示實測好用的原附件。原HTML逐位元存放於 `lib/liaojieTools/originals`，不放public，也不以泛用編輯器替換。正式名稱「知識鑽石框架」，原內部v9工具標題與知識鑽石2.0規則不改。

| 原檔 | 對應檔 | SHA256 |
|---|---|---|
| mindmap_writing_tool_v9_final13.html | diamond.html | 14bc26b567c0e73d6f4af464fed90910c4c84678e8b4efaf62455c47a17410c5 |
| 日上三更-指令產生器.html | sanko-prompt.html | c0fe165f3e311670811581d2d26274d57198d8253b3c3365d82f85e1fd605509 |
| 日上三更｜出題產生器_v1.4.html | sanko-batch.html | 28b487163472ea746ea6001bb0545e443b9bcd0683f8ad88a4e73db8965011fc |
| magazine_dialogue_template_v0_3.html | magazine.html | 9d80a098c4cfc9b7ae46dc55d36103755b13681befc01a24f5d554985dc63d42 |
| ig-carousel-studio-v1.html | carousel.html | 664655b4bfce4c60ef4db50ab0dfa95d5a21496c27a104dd4668828d750a4d76 |

## 使用與保存

- 原工具在React外殼的隔離工作區執行。原指令、候選節點、雜誌與輪播頁型、原專案下載與PNG/TXT功能保留；不是全部重寫為React，也不是內建LLM。
- 本裝置IndexedDB自動保存，非雲端／跨裝置同步。五工具各自保存，不寫正式Notion；清除網站資料會刪除裝置草稿，換裝置請下載／匯入備份。
- 通用工具備份與原生專案格式不同，各有明確按鈕。通用備份含工具識別與版本，錯工具／損壞結構拒絕，不替換現稿。
- 同工具多視窗版本衝突拒絕覆蓋；目前視窗仍可下載備份。保存失敗仍保留輸入，最新備份會即時擷取，不使用上一輪快照。
- 原Google外部字型不發出網路請求；IG原檔內嵌字型仍可使用，其他字型依裝置。自訂字型保留於本工具快照／原專案。
- 尚未把這五個原生專案直接轉成織光堂固定成品。完成後可下載／複製交接，既有發布台與資料模型保持。

## 審查

獨立唯讀整包審查：0 Critical、3 Important、0 Minor。三項皆有RED→GREEN重現測試：知識鑽石節點HTML插入、壞備份先保存、雜誌選頁狀態未保存。修正採runtime節點文字escape、逐工具巢狀結構驗證、canonical雜誌狀態同步；原檔SHA不變。另補相同內容／備份並發時保存提示未清除的回歸。

隔離iframe不允許same-origin或主站DOM／cookies存取。資料及腳本不連Notion／AI／社群API；CSP不允許外部網路資產，節點來源按文字呈現，未以connect-src宣稱可以攔截任意document navigation。

## 驗證與邊界

驗證命令：`node --experimental-strip-types scripts/test-liaojie-tool-snapshot.mjs`、`UI_PRODUCTION=1 node scripts/test-liaojie-original-tools-ui.mjs`、`UI_PRODUCTION=1 node scripts/test-liaojie-original-tools-recovery-ui.mjs`、`node scripts/test-liaojie-text-domain.mjs`、受影響eslint、`npm run build`、`npx tsc --noEmit`。UI實際下載兩種1080×1350 PNG；320/375/390/430/1024px渲染無水平溢出。原檔都已列入Next production file trace。

正式Railway連線在本輪回覆UNAUTHORIZED／需要重新驗證；沒有更改正式服務、變數或資料。正式部署與iPhone真機驗收另記，不以production隔離測試冒稱已上線。
