# 織光堂／全零聊解室整合交付

第十包完成可獨立建置範圍，交 [PR101](https://github.com/tasiling/Lumen-Dojo/pull/101) 審閱；沒有正式 merge／deploy。Native 程式驗證 head `c1950f0aa54fb4f22f96bae5284735dc16f17d37`、tree `3bbf5e6996c0b16ded25841f44ad1e3fbb6bb3af`。交付文件與截圖為其後提交，完整 GitHub／Native 對應見同一 `creative-build-progress.md` 最後 checkpoint。

## 可以怎麼用

1. 六種形式依需要製作、固定成品並送往聊解室，不強迫全部轉製。既有日上三更與原發布欄位保留。
2. 在聊解工作台「作品發布紀錄」，明選一份固定成品或歷史平台文字版，再選噗浪／Threads／IG 中的一個平台。
3. 由本人到外站發布，回來填實際日期與完整連結；這裡只存私人紀錄，不會代發文。也可先保存待發布安排，或記成已撤下。
4. 寫下「交流與回看」和下一步。狀態改回待發布／已撤下時，不會自動抹掉已填日期或連結。
5. 從聊解室「作品發布回看」依形式／平台／狀態篩選，點「編輯這筆發布紀錄」回到精確版本／平台。原企劃封存或移除後，私人紀錄仍可補記；不存在的企劃不會改開另一件。

舊企劃及平台稿的發布連結另標為既有資料，唯讀彙整，回原處編輯；沒有批次遷移。舊 video／comic completion 沿用原發布欄位，不會被新紀錄誤標成純文字。

## 實際新增與改善

- `creativeReleases` model／source resolver／store、owner與same-origin API、global鎖／操作收據／marker、immutable source、revision保存與完整衝突恢復。同來源版本／平台防重，unknown寫入只讀找回同筆且保留未知鎖。
- 工作台選來源及平台、獨立私人紀錄編輯頁、全覽篩選、完整metadata比較與dirty／503保留。平台文字列歷史versionRefs，顯版號與ID。
- 長影片換序後預覽對齊、延遲企劃載入generation防護、固定兩真音檔對應回歸；短漫配圖失敗就地重試；Podcast接收區直接顯示固定封面。
- 原本隔離文字示範預覽補同一正式發布API，現在可在真loopback預覽建立→保存→回看。六形式整合另由完整UI fixture驗證，沒有把文字示範預覽稱為全部媒體展示。

## 驗證證據

| 項目 | 結果與範圍 |
|---|---|
| 六形式接同企劃 | 重用已保存真PNG／MP4／WAV，實際走正式save/output/handoff stores；保留固定原稿，所有形式可選。沒有把代表metadata或提示詞當已生成媒體 |
| 五寬完整紀錄流程 | production 320／375／390／430／1024px，每寬各建立→保存→回看，含長中文／URL與無橫向溢出；另選第六種形式及IG、狀態篩選 |
| 保存可靠性 | 空／非空、無效發布資料、503後保留、dirty離開、unknown提交回應找回、完整六欄位衝突比較及明確重套 |
| 審查修正 | 唯一fresh review 0 Critical／3 Important／0 Minor；集中一次RED→GREEN。真UI驗多紀錄精確導航、封存／缺parent仍可編、missing record、V2後選V1；video／comic拒絕誤標text |
| 同源可操作預覽 | `test-creative-preview.mjs`無Playwright API攔截，實際proxy到同一React及正式route，建立／保存／回看PASS，foreign origin拒絕 |
| 前包修復 | 四個真UI mode RED→GREEN；不同SHA／長度真WAV的duration map／HTML start-src／錯音拒絕PASS；原long-video／comic／podcast回歸PASS |
| 其他回歸 | weaving完整、liaojie-text、reading-knowledge完整及API、proposals domain／API／recovery、illustrated／short-video／podcast／comic／long-video domain與真API均PASS |
| 編譯與檢查 | 最後Next build／tsc PASS；全eslint 0 errors／2既有warnings，修正範圍0 warnings；git diff --check通過 |

實際截圖與log在 `creative-integration-evidence/`；`artifact-manifest.json`記錄SHA。全 lint 既有warnings為 `app/plurk/page.tsx` 的img建議及 `scripts/test-weekly-personalized-api.mjs` 的unused readdir，未混入本包修正。

Dev連續導航多次遇到Next manifest讀取 `Unexpected end of JSON input`；未找到由本diff引起的證據，沒有稱dev全流程PASS。相同程式的正式編譯／production完整流程及無攔截preview通過。早期字型只套表單造成方塊字的QA截圖已捨棄，全介面載字後重新截圖；產品使用裝置字型，不保證iPhone像素相同。

## 重現與接續

先 `npm ci`、準備ffmpeg／ffprobe並build。核心命令：

```sh
node scripts/test-creative-releases.mjs
node scripts/test-creative-release-review.mjs
UI_PRODUCTION=1 node scripts/test-creative-release-navigation.mjs
UI_PRODUCTION=1 node scripts/test-creative-release-ui.mjs
node scripts/test-creative-preview.mjs
node scripts/test-long-video-distinct-voices.mjs
```

完整UI截圖沿用前包OFL Google Fonts Noto Sans TC QA字型，路徑 `/tmp/illustrated-fonts/NotoSansTC.ttf`，本次SHA256 `864727d210d54f2537bbe23b3a839436c3992af72de9322af5270897246bd44f`。字型來源及授權見前包evidence；需在重建環境準備該字型，不用只含試片字元的subset代替。短漫／長片大型來源JSON如本機消失，helper可從repo gzip三段直接還原讀取，不要求本人重傳。全部測試用隔離fixture，沒有正式Notion憑證。

下一步為 [正式上線接續單](creative-release-ready.md)：當前整合版發布決定、正式持久環境／備份回復驗收、本人選定的真作品與錄音、真機操作。現有其他對話錄音不自動取用；不說本人尚未提供任何錄音。

## 保留邊界與裁定

這是可操作製作／外部工具接續／回收及私人發布紀錄，沒有站內社群publisher、完整NLE、所有媒體自動生成或無人工審閱成品。本人語氣、圖像／排版美感、權利與隱私仍由本人核對。每包媒體的上限與限制沿用各delivery，不由這次五寬紀錄驗收推論滿額40章／一小時影片、大型製作包、低記憶體、真機／所有字型／輔具或跨host皆已驗過。

審查每項set-aside已逐條裁定在 `creative-integration-review.md`，完整執行裁定在plan Ledger。沒有正式資料改寫、訂閱／計費、社群公開、merge／deploy或重試取消的Railway操作。獨立十包建置交付後停止重複建置；正式發布與本人驗收是清楚分開的接續動作。
