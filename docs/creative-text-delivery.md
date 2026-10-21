# 第四包交付：純文字與三平台版本

日期：2026-10-21（Australia/Melbourne）

## 已交付成果

- 聊解室從固定成品建立單一、由本人明確選取的平台稿；不自動轉製其他平台。
- 支援噗浪主噗／樓層、Threads 貼文串與 Instagram 配文。每次保存建立不可覆寫的新版本，語氣與修改註記均保留。
- 四步同源介面：選平台、改語氣、預覽定稿、準備發布；產品與預覽使用相同 React 資料與 CSS。
- 可複製每段或整份真正的稿件，也可複製 AI 改寫指令後貼回逐段核對。提示詞沒有被算成發布成品。
- 發布日期與發布連結納入草稿、未保存離開保護、保存失敗及衝突比較；狀態操作等待期間鎖住輸入，避免回應覆蓋後來輸入。
- 噗浪只建立或更新蓋樓草稿，不公開發文；同版本重送及新版交接沿用同一草稿，人工在蓋樓台修改後仍保留來源關係。
- 舊企劃、非文字成品與只有外部連結的作品保留原發布整理欄位，可繼續編輯；不強迫進入文字版本流程。

## 安全與恢復

- 同一企劃／平台的並行建立在持久寫入鎖內再檢查，不產生雙份稿件。
- 遠端已寫入但回應遺失時，以操作標記與固定版本唯讀確認，不用舊 revision 重送。
- 公開許可、來源摘要、目前版本與 expected revision 在同一寫入鎖內重新核對；撤權或舊視窗不能越過檢查。
- 超長噗浪來源在任何 seed 寫入前拒絕，避免留下無法讀取的半成品。
- reconcile 支援文字版本、文字稿與噗浪草稿的操作證據。

## 審查與修正

整包獨立唯讀審查結果為 0 Critical、9 Important、1 Minor。依既定一次修正原則，9 項 Important 與 1 項實際可用性問題均在同一修正批次完成：並行重複、噗浪 metadata 遺失、真正未知回應、鎖外權限檢查、等待期間輸入遺失、非保存操作衝突、超長來源、舊企劃相容、日期／連結 dirty guard，以及缺少真正稿件複製入口。各項均由失敗案例轉為通過，沒有延後項目或第二次重審。

## 驗證證據

- `npm run test:liaojie-text`
- `npm run test:liaojie-text-ui`
- `UI_PRODUCTION=1 npm run test:liaojie-text-ui`
- `npm run test:weaving`
- `npm run test:weaving-ui`
- source-settings domain／API／UI、proposals domain／API／UI、reading-knowledge domain／API
- `npm run build`
- `npx tsc --noEmit`
- `npm run lint`：0 errors；2 個既有 warnings

實際 production 渲染覆蓋 375／390／430／320／1024px，320px 無橫向溢出。狀態覆蓋空白、非空、dirty、保存前失敗、遠端寫入後回應遺失、版本衝突、狀態衝突、ready、噗浪交接、舊企劃編輯與封存 dirty guard。截圖在 `docs/creative-text-evidence/`。

## 尚未做與發布邊界

- Threads／Instagram 仍為複製稿件後人工發布與回填連結；沒有登入社群或自動公開。
- 本包未更動正式 Notion 資料，未做 iPhone 真機驗收，也沒有 merge／deploy。
- 個人文風仍需 Crystal 以實際稿件試用調整；本包提供可持續保存與回復的協作結構，不宣稱 AI 已學會本人語氣。
- IG 圖卡屬第五包，不把純文字配文算成圖文完成。

下一包為圖文實際製作：逐頁文案、配圖、頁序與排版，先以隔離素材實際試用外部工具，回收真正圖片與可修改來源。
