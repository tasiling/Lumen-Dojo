# 短漫隔離試製來源

原創虛構「雲豆等小芽」，非Crystal日記／真實經驗／真人肖像。使用內建image_gen，未開計費服務或送出私人資料；沒有正式Notion／社群發布。繁中對白由產品同一React SVG排版，不是生圖內建文字。

## 實際素材與調整

- `assets/character.png`：白鳥藍圍巾角色參考。
- `assets/panel-1.png`／`panel-2.png`／`panel-4.png`：同角色參考逐格生成。每格單獨圖，未從一張假格子占位裁切。
- `assets/panel-3-before.png`：第一版雨窗喝茶，錯誤提早出現小芽。
- `assets/panel-3-edited.png`：實際image_gen針對同格移除葉芽，保留角色／杯子／雨窗；畫面內仍可能有生成微幅漂移，不聲稱像素級局部編輯。
- 完整工具提示與輸入角色／修圖目標見 `prompts.json`；本輪已目視檢查每格、修圖及最後PNG。
- `local-replacement.json`：產品實際替換第三格前後SHA；1、2、4格全部欄位與confirmed值deepEqual。不是重畫全部四格。

## 真正輸出

`final.png`為產品ComicPreview／comicSvg→瀏覽器rasterize的1080×1350四格合成。文字與圖片可修改，原圖沒有寫字。`ui-source.json`是產品實際下載、嵌入所有原圖的可修改來源，包含固定文字來源digest、角色與格序；它屬隔離fixture，不能冒充正式作品的來源ID。沒有預設把題目轉全部平台。

`empty-390.png`及`workspace-{375,390,430,320,1024}.png`來自實際產品元件與CSS，production UI完整重跑覆蓋。為QA載入OFL Noto Sans TC（Google Fonts，https://github.com/google/fonts/tree/main/ofl/notosanstc），沒有替本人iPhone字型作驗收。可用 `UI_PRODUCTION=1 node scripts/test-comic-ui.mjs` 重做合成與驗證；需先build與本機QA字型 `/tmp/illustrated-fonts/NotoSansTC.ttf`，原始生圖不重呼叫，使用已保存圖像。

本包不含任意畫布／自由氣泡、站內生圖API、真機或正式磁碟驗收。確認格需先解除並保存，才可改內容或其引用角色；這是避免換圖誤改其他已確認格的取捨。

`ui-source.json`原始輸出約17MiB；遠端工具單次16MiB限制，倉庫以`source-package.gz.part-*`＋manifest保存相同bytes。`node scripts/restore-comic-evidence.mjs`實際可還原並驗SHA-256；單一JSON為重建檔，未重複提交。產品下載／匯入格式不改。
