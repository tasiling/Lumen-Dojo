# 第十包獨立審查與裁定

唯一一次 fresh 全包 review：`a022f8f..137b704`，gpt-6-astra high，唯讀；審查者讀 spec／plan／Ledger、AGENTS 與本機 Next 文件，獨立執行 API suite 及三個正式 store 的隔離重現。沒有第二次 review。

結果：0 Critical、3 Important、0 Minor。原 verdict：三項修正前不可稱 merge-ready；不代表授權正式 merge/deploy。審查肯定來源 parent／版次／owner 綁定、immutable source、unknown marker 唯讀恢復且保鎖，以及本人手動紀錄與六形式實際試製檔整合。

## 一次集中修正

| 問題 | 實際影響 | 修正與回歸 |
|---|---|---|
| 回看缺精確release ID，封存來源後workbench會fallback別企劃 | 點回看可能開錯企劃，封存後無法補回饋／撤下 | 新 `/liaojie/release?id=…` 直接編指定私人紀錄，獨立於parent；workbench顯式無效ID不選別企劃。真UI覆蓋active多紀錄、archived／missing parent、missing record及可保存 |
| catalog只列平台文字currentVersionId | V2後無法紀錄真正已發出的V1 | 枚舉versionRefs、逐版核parent／平台，顯第n版及ID；domain與真UI選V1並確認immutable綁定 |
| 舊video／comic completion被當text | 永久誤標純文字 | text／platform-text要求publication與work皆為text；catalog不列非文字completion。正式store隔離video／comic拒絕案例，六形式media交接維持 |

三項均先有 RED 重現，再集中修正並 GREEN；不是請另一位 reviewer 重複審查。精確驗證結果見 evidence 與 delivery。

## 每項 considered-and-set-aside：作者裁定

以下逐項採納審查的範圍判斷；不默默省略未實作行為。

| 行為 | 裁定與後果 |
|---|---|
| 跨企劃／跨形式media ID | membership、prefix、parent已拒絕；不擴寫另一套權限 |
| 舊media output版本 | 使用歷史versionRefs，保留；不強迫currentVersion |
| 平台文字錯平台／parent | 明確檢查維持；舊版選單缺口已修 |
| PATCH改來源／平台 | exact keys拒絕，editable draft只metadata；不提供改綁 |
| 無效日期URL／缺發布日期連結 | parser拒絕；不把填入狀態當系統已發布 |
| 已發→待發／撤下 | 除本人主動改欄位外保留日期連結；不自動刪歷史 |
| 既有Legacy URL | 唯讀彙整、驗scheme、不遷移；缺parent導航明示 |
| 防重／連按 | global鎖、tuple dedupe、UI同步gate維持 |
| unknown已寫回應遺失 | marker找回同筆、保留未知鎖；不自動清鎖 |
| stale／conflict reapply | expectedRevision＋完整metadata比較；source不在可編draft |
| dirty／503／篩選 | buffer及leave保留；篩選在唯讀歷史，單筆編輯另頁 |
| release GET競態 | generation或active guard；dirty draft不因props重讀被替換 |
| 長片延遲A→B | 共用generation及完成時leave檢查；保留修正 |
| 長片換序／刪章reset-reapply | 依結果重算selected/time並暫停音訊；保留修正 |
| 不同長片聲音 | 兩真WAV不同SHA／長度及HTML start/src固定回歸；不以同一音檔代替 |
| 短漫配圖失敗 | 專屬錯誤與重試成功清除、active guard；保留修正 |
| Podcast固定封面 | 使用immutable coverAssetId與authenticated unoptimized圖、保留下載 |
| 五寬／長中文URL／空非空 | production每寬完整紀錄流程；不推論真機／所有媒體滿額操作 |
| 六形式實際整合 | 重用已保存真試製bytes走正式save/output/handoff；未聲稱本包重新生圖或本人錄音 |
| 回歸／build／tsc／lint | 證據支持PASS與兩個既有warning；不為無關warning擴範圍 |
| dev manifest JSON競態 | 未找到由本diff造成的證據；公開記錄失敗，production重跑為交付依據，不宣稱dev完整PASS |
| 社群／正式Notion／計費／本人錄音／真機／merge-deploy | 不屬隔離建置；由正式上線接續單列本人及環境驗收，不冒用歷史發布同意 |

範圍內的三項 Important 已由實作者測試證明修正；跨host、滿額效能、真機、本人審美與正式環境仍是明示邊界，沒有被 review 替代。
