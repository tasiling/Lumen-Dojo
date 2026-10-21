# 第十包證據

`workbench-{320,375,390,430,1024}.png`及`history-{…}.png`是同一正式React／CSS的最後production測試截圖。每寬各實際建立、保存及回看，不只變更viewport；載入全字元Noto Sans TC再截圖。純文字、圖文、短影音、Podcast、短漫各一寬，長影片另在1024完整建立及篩選。所有內容為隔離虛構資料。

六形式由 `scripts/creative-integration-fixture.mjs` 重用前包保存的真媒體bytes，重新呼叫正式save/output/handoff stores接同一企劃。圖片／短片／音檔／長片沒有在本包重新AI生成；原字稿仍不變；音訊為非人聲測試音。各前包evidence保留真正試製來源、工具輸出與調整結果。

- `production-ui.log`：五寬完整紀錄路徑與六形式整合。
- `navigation.log`：指定紀錄、封存／缺parent、missing ID、歷史平台文字V1的真UI回歸。
- `release-api.log`、`review-domain.log`：嚴格欄位、日期URL／owner／CSRF、來源綁定、防重／immutable／stale／unknown保鎖、版本與格式修正。
- `preview.log`：真loopback預覽、無Playwright API攔截，實際建立保存回看及foreign origin拒絕。
- `repair-*.log`、`comic-long-video.log`、`illustrated-video-podcast.log`、`weaving-knowledge-proposals.log`、`reading.log`、`proposal-recovery.log`：前包修復與適當回歸。
- `build.log`、`tsc.log`、`lint.log`、`focused-lint.log`：最後驗證。2 warnings均為既有。
- `review-*-red.log`與`preview-red.log`：修正前真正失敗，保留TDD證據。dev導航manifest限制詳delivery，沒有列為PASS。

`artifact-manifest.json`列本資料夾各檔SHA與byte數，不把文件、腳本或截圖當本人／真機／正式環境驗收。
