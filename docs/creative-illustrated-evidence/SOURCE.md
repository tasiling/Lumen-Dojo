# 隔離圖文試製

題材為虛構「雨後窗邊的小芽」，不是 Crystal 的日記、人物或生活經驗。未使用正式 Notion 資料、沒有社群發布。

## 工具與調整

配圖由本次已連接的內建 `imagegen` 實際生成（工具未提供可引用的模型版本），2026-10-21。未建立訂閱或啟用計費 API。原圖 `assets/rain-sprout.png`，1122×1402；UI 匯入後選擇完整顯示，保留原圖與提示。

Prompt:

> Use case: illustration-story. Asset for a personal reflective social carousel, test-only fictional scene. Portrait 4:5 watercolor/crayon quiet rain-washed window, small green sprout in a blue ceramic cup on a wooden writing desk, closed unlabelled notebook, soft afternoon light; hand-painted washes, colored pencil/crayon marks, layered paper texture, muted cool blues/sage green/warm yellow. Sprout focal, calm negative space, no people/faces/words/letters/watermarks/logos, handmade collage feeling.

三頁以產品編輯器實際製作，第一頁匯入配圖，其餘兩頁採文字版型；頁序調整、來源與公開確認後匯出。`page-1.png` 至 `page-3.png` 是真正 1080×1350 PNG；`editable-source.json` 包含原圖、逐頁文字、版型與來源資訊，可在同一固定原稿重新匯入。第三頁的英文空格／Tab 是排版回歸測試內容。

調整紀錄：最初直接把 SVG 當圖片繪到 canvas 時，匯出缺少頁面載入的繁中字體；現改用同一 SVG 的實際文字節點、座標與字體在 canvas 繪字。另統一連續空格、Tab 與安全換行，匯出前核對真實字體邊界。UI QA 從官方 Google Fonts Noto Sans TC 字型檔注入，產品使用裝置可用中文字型；沒有把測試字型成功當成所有裝置已驗收。

測試 `scripts/test-illustrated-ui.mjs` 會重新生成截圖與輸出，並比較真實 SVG 與 PNG 的中文字區域。測試字型來源： https://github.com/google/fonts/tree/main/ofl/notosanstc （OFL）。

## 信任與環境邊界

PNG 由已登入本人的瀏覽器從產品 SVG 匯出，API 核對版本、頁序、格式、尺寸與來源公開許可。API 不做圖片像素與文案的獨立語意比對；直接呼叫 owner API 可以上傳其他同尺寸圖片，不能據此宣稱伺服器證明圖片內容。日後加入其他渲染客戶端時需另訂簽發及版本綁定協定。

圖檔需部署環境持久磁碟，沒有設定時拒絕保存；本包只用隔離磁碟驗證。未驗收正式部署磁碟、正式 Notion、iPhone 真機及社群平台發表結果。
