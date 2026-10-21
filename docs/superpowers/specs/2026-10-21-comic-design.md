# 短漫製作設計

## 意圖與範圍
依Crystal已授權Native持續建置，第八包將生活觀點製作成真正可閱讀短漫。接續PR101的固定文字來源、公開設定、不可覆寫版本及聊解交接；不重建舊工具、不自動全形式或平台。來源讀取與公開分開，試製只用虛構白鳥雲豆與植物故事，不用本人私人資料。

## 選擇與取捨
採獨立Comic資料與路由，重用已驗收owner圖片資產、operation鎖、保存／衝突草稿及PNG匯出。將短漫硬塞入圖文會混淆角色／確認格／合成；通用任意畫布則延遲完成路徑。首版固定左至右、上至下四格一頁，1080×1350，1–12格／1–3頁；少於四格保留空間，不冒充有畫面。這不是任意氣泡編輯器；對白在格內下方專用區，避免生圖錯字，人物可逐步換為本人繪圖。

## 資料與邊界
ComicDraft={title,caption,characters,panels}。角色0–8個，每個{id,name,description,reference:ImageUse|null}；角色參考也有來源／公開確認。格{id,scene,dialogue,speaker,characterIds,fit,position,image:ImageUse|null,confirmed}，1–12、ID不可重複、角色引用必須存在。角色名80字、描述2000字；格scene2000、speaker40、dialogue160，對白超過版面不得輸出。圖片8MiB／PNG JPEG WebP、SHA與解碼沿用。固定文字只作來源，不覆寫原稿。

確認格不等於全作品定稿。當舊格confirmed且新格仍confirmed時，不可改圖片／對白／分鏡／角色等內容，不能刪除；需先明確解除確認。替換未確認格只改該格；其他格與確認狀態不變。被確認格引用的角色若改定義或參考，需先解除相關格確認，防止人物來源被暗換。保存成新版本，歷史不變。

ComicProject→ComicVersion→ComicOutput固定頁面PNG與完整稿快照。prepare與output／handoff最終副作用同鎖重核來源公開、全資產來源及現在版本。每頁renderRef對應sheet-1..N，尺寸必須1080×1350。重試／部分寫入／未知回應沿用marker恢復，不能繞過撤權或重建副本。

## 操作與視覺
/weaving/comic，固定原稿入口及織光入口。五步圖示與已確認粉紫藍／Noto繁中／44px規則，手機單欄，桌面編輯＋頁面預覽。1選固定原稿／名稱，2角色與分鏡／排序，3逐格圖片／來源／對白／確認，4同一React SVG預覽與PNG，5來源JSON／逐頁PNG／聊解交接。JSON包含原圖片、SHA、completionId與sourceDigest，可重新匯入並另存。dirty時拒絕匯入，不丟稿；圖片未載好不可輸出。操作鎖避免await期間換格或改稿綁錯。衝突比較顯示全部稿、角色與圖片來源。聊解顯示固定PNG、配文與下載，不自動社群發布。

## 驗收
先失敗測試再實作：strict／確認格保護／局部替換、owner API／防重／immutable／stale／撤權／partial與unknown／交接。五尺寸375／390／430／320／1024同源實際渲染，空白／非空、dirty、保存失敗／衝突、JSON回載／失敗保留、圖片競態、定稿及交接。imagegen實際生成角色參考與每格圖，保存提示、素材、版本、原稿JSON與真正合成頁；有一次局部改圖及其他格不變證據。build／tsc／lint及相關回歸，一次fresh全包review後集中修正Important。正式Notion／部署／真機／本人作品審美不由隔離驗收代替。
