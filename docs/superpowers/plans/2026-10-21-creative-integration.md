# Creative Integration Implementation Plan

> Native inline；REQUIRED SUB-SKILL superpowers:executing-plans。一次fresh最終review，無每task代理。

**Goal:** 六形式固定成品→本人手動發布紀錄→回看，修正前包Minor並交正式上線包。
**Architecture:** 獨立creativeReleases model／sources／store與owner API，沿用operation與draft／recovery；既有製作及發布欄位不改語意。
**Tech Stack:** Next16／React19／TS／Playwright／既有FFmpeg真素材。
**Spec:** docs/superpowers/specs/2026-10-21-creative-integration-design.md

## Global Constraints
- prefix行光作品發布紀錄-v1-；三平台plurk／threads／instagram_post；六format＋platform-text來源。
- source不可PATCH；metadata URL2000／response5000／nextStep2000；published需http(s) URL＋真實YYYY-MM-DD日期；planned／published／withdrawn，私人手動紀錄不發文。
- owner／same-origin、same lock／marker／expectedRevision；同來源平台防重，版本固定不隨新版改寫。
- 五寬320／375／390／430／1024同React／CSS，每寬新紀錄建立保存回看；44px／正文16px。
- baseline Native a022f8f／remote2708bc5同tree955bcfd，master19ccc89；不merge/deploy、不改正式資料／計費／社群、日上三更與其他工作區。

## Review Focus
- 不同形式或別企劃的合法output ID不能被冒用；舊版本仍有明確來源（Task2）。
- 日期／URL無效、狀態降回待發布、撤下與既有URL回看不應假發布或丟歷史（Task2/3）。
- unknown寫入回應後重試必須找回同紀錄，stale比較不能覆蓋來源（Task2/3）。
- 延遲企劃載入／遠端換序／圖片GET失敗恢復不得換錯稿／圖／聲音（Task1）。
- 每寬完整流程、長中文與連結、零紀錄／既有紀錄、失敗後篩選不可藏掉未存輸入（Task3）。

## Task 1: 前包可操作收尾
Files: longVideo/LongVideoWorkspace.tsx、comic/ComicWorkspace.tsx、podcast/PodcastDelivery.tsx；scripts/test-creative-integration-repairs.mjs、test-long-video-distinct-voices.mjs。
Interfaces: 長片reset/reapply對齊章節；projectGeneration guard與完成時leave；comic imageAttempt／imageError；Podcast固定封面img。
- [ ] 寫真UI遠端換序恢復、延遲A後選B／dirty、漫畫GET503重試、接收封面；不同真WAV prepare／HTML換序與拒錯。Expected舊介面FAIL。
- [ ] 最小實作，Expected兩script PASS及既有long-video／comic／podcast回歸，commit。

## Task 2: 私人發布紀錄model／來源／API
Files: lib/dojo/creativeReleases/{model,sources,store}.ts；app/api/dojo/creative-releases/route.ts；formal／operations／store operation觀察；scripts/test-creative-releases.mjs。
Interfaces: ReleaseSource／CreativeRelease／ReleasePatch；parseReleasePatch／parseReleasePlatform／sourceKey；releaseSources(publicationId)／resolveReleaseSource(publicationId,kind,id,platform)；listReleases／readRelease／createRelease／saveRelease／legacyReleaseLinks。
- [ ] 寫strict、日期／URL、跨企劃／格式／平台、防重／immutable、stale、owner／CSRF／no-store、unknown marker零新增、六種真來源catalog與既有URL；Expected missing module／route FAIL。
- [ ] 實作prefix、source核membership及parent、private history鎖／marker，GET全覽＋企劃sources，POST明選／PATCH metadata；Expected script PASS，commit。

## Task 3: 工作台與回看同源UI
Files: app/components/creativeReleases/{ReleaseWorkspace,ReleaseHistory,ReleaseEditor}.tsx及release.css；app/liaojie/releases/page.tsx；LiaojiePublicationWorkbench及liaojie入口；scripts/test-creative-release-ui.mjs。
Interfaces: ReleaseEditor useWeavingDraft＋ConflictRecovery全欄位，ReleaseWorkspace明選來源／平台及同步gate，ReleaseHistory全覽篩選與既有唯讀links。
- [ ] 寫空／非空、dirty／save503／完整衝突、unknown回應找回、六形式來源選擇、每寬完整建立→保存→回看與長字串；Expected missing UI FAIL。
- [ ] 實作沿用視覺、手動不發文文案，Expected dev及production UI PASS，實際截圖目視，commit。

## Task 4: 整合交付
Files: docs/creative-integration-delivery.md、release-ready.md、creative-integration-evidence、同一progress／roadmap。
- [ ] 六形式／來源／知識／提案／文字交接適當回歸、build／tsc／lint，Expected PASS／既有warnings明示。
- [ ] 一次fresh最終review，Critical／Important集中RED→GREEN，Minor及每項set aside裁定記錄。
- [ ] 正式上線包、checkpoint／Native同tree保遠端parent／expected_sha非force推PR101，核最新master；無merge/deploy。
- [ ] 全部獨立工作完成後列本人驗收／正式授權、停用本持續建置（不動舊取消總排程）。

## Ledger
- Pre-flight: Task1不改output形狀；Task2 sources由既有immutable outputs產生ReleaseSource，Task3只消費server catalog且PATCH只metadata；Task4證據不當正式驗收。共享介面一致。
- Ruling: 使用者已授權Native持續建置與常規選擇，不因技能一般確認節點停工；單一feature checkout與持久Ledger延續前包 — 避免重複同意／雙writer — 仍需正式版本發布決定。
- Ruling: 新紀錄是私人手動收據，原output／handoff公開許可保留，收據可在素材撤權後保留歷史 — 不把記錄URL當外送資料 — 若未來加入publisher必須另加當下公開許可檢查。
- Ruling: 保留既有文字／Legacy發布資料並唯讀彙整，不批次遷移 — 不改正式歷史語意 — 回看會區分既有與新紀錄。
