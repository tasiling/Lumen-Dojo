# 長影片製作設計

## 意圖與授權
Crystal已授權Native持續建置，接續第九包：個人生活／洞察固定原稿→章節長腳本、分段配圖與本人聲音→外部剪輯接續與真正MP4回收→聊解室。不重建舊工具，不自動全平台或形式，不把讀取許可當公開。隔離試製用既有虛構雲豆圖與非語音測試音，非本人經驗或聲音。

## 決策
獨立longVideo模型／資料／路由，重用短片已驗owner媒體、operation鎖與草稿原語，避免放寬既有短片或Podcast。首版每章節是一個可排序分段，含配圖、腳本、字幕與原音；先支援橫式圖像敘事及外部NLE接續，不另造站內DAW／任意多軌影片編輯器。直接修改短片會混淆180秒與直式限制；完整NLE則超出此包可交付範圍。

## 資料契約
LongVideoDraft={title,angle,style,rawTranscript,scenes}，Scene={id,title,narration,caption,duration,motion,image,voice}。1–40章節，每段5–300秒，草稿總長最多3600秒；ready需總長超過180秒且最多3600。章節title100字、narration4000、caption180、rawTranscript80000，style水彩／蠟筆／mixed，motion still／drift／paper。每段聲音VoiceUse={assetId,kind:self|test,sourceNote,publicConfirmed}，每段配圖ImageUse沿用。Ready要求title／angle、每章節名稱／圖片／來源及公開／聲音確認、字幕在同源畫面3行內、每段真原音與預定時間差<=0.5秒；不裁切或假冒配音。

章節時間從固定版次的分段累加產生，排序／秒數一改就重新算；SRT、章節JSON／文字、長腳本與外部HTML都從同一版次生成，原逐字稿不改寫。每段可個別下載原音，JSON包按SHA包含所有原圖／音訊，驗同completionId及sourceDigest後重匯新版本。dirty時拒絕匯入；所有資產校驗完成前不套用。JSON／HTML整包上限256MiB（含base64與metadata），下載前先核總預算，JSON匯出／匯入同一門檻；超過可逐章下載素材／原音／稿或外部壓縮後另存，不改一小時專案與單檔256MiB保存上限。

## 媒體與持久化
固定server profile long-video：256MiB、最多3600秒、獨立long-video-media目錄；短片64MiB／181秒與Podcast128MiB／音訊專用不變。H264／AAC MP4，圖像尺寸沿用限制，long解碼採有界300秒、其他60秒不變。每段WAV／MP3／M4A本人或測試音，真probe與SHA，完整解碼成功才原子安裝。回收成品需16:9、width>=640、總長與固定章節差<=0.5秒。最大容量／一小時正式環境效能需另驗，不據4分鐘樣本宣稱全上限流暢。

Project→不可覆寫Version→Output固定完整draft及真媒體ID／工具／註記。來源政策、版次、每段圖片及原音在output與handoff最終副作用同鎖重核；partial撤權／unknown marker沿用無重複寫入與保留未知鎖規則。聊解新增longVideoOutputRefs，與其他五形式共存，不覆寫原稿或既有發布狀態。

## UI與同源預覽
/weaving/long-video及織光／固定原稿入口。粉紫藍五步、44px、手機單欄／桌面擴充，現有React/CSS規則。章節列表顯示起秒／長度；編輯分段與其原音，預覽滑桿及章節音訊；同一sceneSvg供React frame、外部HTML及試製PNG。首版1280×720設計，回收可為其他16:9有效解析度。SVG字幕3行，長標題拒絕溢出，不把placeholder當成品。

外部製作包提供JSON、HTML、SRT、章節、腳本、各段原音。HTML按章節配置clip／audio相對檔名，需保存配套音檔，瀏覽器播放器不等於已生成MP4。回收欄位跨刷新保存，候選影片綁版本，必須本人實際播放／公開核對才固定。保存、圖片上傳與操作以同步gate防連按／換章綁錯；衝突完整bundle和所有稿、圖片與錄音來源可比較。圖片載入失敗有就地重試，不丟本機稿。

## 驗收
先失敗測試再實作；domain上限／章節時間／獨立原音與短片不放寬／escaping／SRT跨小時；真API owner／防重／immutable／stale／時長／partial撤權／unknown／交接。dev與production主流程、375／390／430／320／1024排版及關鍵操作，空白／非空、dirty、保存503／衝突、匯入失敗保留、候選刷新、定稿及交接。FFmpeg skill實際將同源畫面＋隔離原音製作四章節4分鐘MP4，保留原稿、工具dry-run／結果、probe／check／look與回收。沒有本人錄音先驗獨立部分；不購買、開計費、社群發布或正式Notion。一次fresh全包review、修正、build／tsc／lint與相關回歸後推送PR101；本包無merge/deploy。
