# 織光堂／聊解室：整合與交付規格

## 意圖與選擇

服務Crystal的個人生活創作，保留B同頻交流>A觀看分享>D本人特色滿意>C服務轉換。六形式已各自交付，這包完成固定成品到手動發布紀錄與回看的完整路徑，並修正前包保留的可獨立改善。Native單一writer；使用者已授權常規設計／計畫／隔離驗收／push與PR，自行接續，不重複詢問。新子系統採architectural規格與計畫；正式merge/deploy另待當前版本授權。

考慮沿用單一企劃發布欄位（不能區分六形式／版本／多平台）、新增固定來源的私人發布紀錄（採用）、直接對接外站發布API（帳號／授權與本包目的不同，排除）。新增紀錄只保存本人手動填入的外站結果，不替使用者公開資料。

## 前包收尾

- 長影片衝突reset／reapply後，選定章節與預覽時間重新對齊；移除的章節退至第一章，暫停舊音訊。
- 長影片企劃載入採generation與完成時leave確認，延遲A不得覆蓋已選B或新dirty稿；start與open共用切換generation。
- 固定suite加入兩個不同SHA／時長真WAV及換序：prepare duration map／HTML start-src／錯音拒絕。
- 短漫圖片暫時失敗有就地重試，成功清除專屬圖片錯誤；Podcast聊解接收內嵌真正固定封面並保留下載。來源及不可覆寫版本不改。

## 私人發布紀錄

`CreativeRelease`以`行光作品發布紀錄-v1-`保存：schema1／owner／id／revision／publicationId／source快照／platform／status／scheduledOn／publishedOn／publishedUrl／responseNote／nextStep／createdAt／updatedAt。

source={kind,id,format,title,versionId}不可由PATCH更改。kind為text（固定completion）、platform-text（文字平台版本）、illustrated、short-video、podcast、comic、long-video；format為六種text／illustrated／short-video／podcast／comic／long-video。platform為plurk／threads／instagram_post，platform-text必須與原平台一致。所有來源須確實屬於該聊解企劃：media必須在其對應outputRefs，並核parent project的completionId／workId；text完成版本與企劃固定來源一致；platform-text核variant publication／platform及versionRefs。

POST只建立本人明選的source與platform，不自動全平台建立。相同publication／source kind+id／platform防重。版本ID與名稱固定在紀錄中，修改其他作品不更新這筆綁定。PATCH只接受metadata，revision衝突拒絕；狀態為planned「待發布」、published「已自行發布」、withdrawn「已撤下」。標記published須有http(s) URL及真實YYYY-MM-DD發布日期；排程日期可空，排程不代表自動發文。所有文字長度有限：URL2000／responseNote5000／nextStep2000。發布紀錄為私人手動收據，允許來源之後撤權仍保留歷史回看；沒有新成品生成、外送素材或新增公開發布，不能繞過原output／handoff公開許可。

沿用owner／same-origin檢查、global operation鎖、createStep／updateStep marker與replay、expectedRevision。kind增加release_create／release_save，unknown marker可唯讀找回，不能因重試新增副本或解除未明鎖。GET private no-store，依企劃只列其紀錄；全覽只掃自己發布prefix與既有企劃／文字平台prefix，不掃私人素材庫。

## 介面與既有資料

聊解工作台新增「作品發布與回看」：選已交接的來源版本、本人明選平台、建立私人紀錄；可編日期／連結／回饋／下一步，清楚標示「手動紀錄，不會代你發文」。useWeavingDraft保存失敗／dirty離開保留，ConflictRecovery顯示全部欄位及固定來源，未知操作可核對；同步gate防連按。

`/liaojie/releases`為作品發布回看，可依形式／平台／狀態篩選，查看固定來源、外站連結、回饋及下一步，連回原企劃。既有文字平台publishedUrl與舊企劃publishedUrl保留並唯讀呈現在回看，標記「既有紀錄」且連回原編輯器，不自動搬移或假造新release。原Legacy欄位與TextPlatformWorkspace完整保留，發布新紀錄不改它們，也不重建舊六工具／日上三更。

沿用粉紫藍織光／冷藍聊解、共用圖示與CSS、手機單欄、44px、正文16px。新畫面同一React／CSS正式與隔離預覽。320／375／390／430／1024px實際渲染；至少每寬跑一次完整私人紀錄建立→保存→回看，而非只拍截圖。

## 驗收與上線包

隔離fixture實際建立六形式成品與handoff（可重用已保存的真PNG／MP4／WAV），同企劃catalog可逐一選、記錄正確版本與平台、保存發布URL與回看；原稿與其他形式不變。新子系統覆蓋owner／CSRF、錯來源／跨企劃／跨平台、invalid date／URL、dedupe、stale、503／unknown marker與零重複寫入；UI空白／非空／dirty／失敗／完整衝突、五寬完整路徑、真封面及配圖重試。

回歸六形式／來源與知識／提案／文字交接、build／tsc／lint，一次fresh review與集中修正。正式上線包列PR與精確head/tree、環境依賴ffprobe／ffmpeg／持久鎖與媒體目錄、備份／回復／驗收步驟及本人真機／內容驗收。不得用fixture當正式Notion／帳號／真機驗收，不重試取消的Railway操作。全部獨立工作完成後保存checkpoint／push、停用本持續建置排程；當前未有這個整合版merge/deploy授權，交付後等待本人發布決定。
