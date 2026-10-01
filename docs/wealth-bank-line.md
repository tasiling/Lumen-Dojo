# LINE 銀行記帳整合

本分支沿用既有 LINE webhook。使用者傳送「銀行記帳」後，模式在 Luminara PostgreSQL 保存 30 分鐘；「結束銀行記帳」立即退出。模式未開啟時，圖片仍走原有野採／英文影像流程。

銀行模式的圖片會先由 LINE Content API 取回，再透過獨立 HMAC 簽名服務介面送入 Luminara。只有 Luminara 回報已可靠保存後 webhook 才回 200；LINE 重送沿用 webhook event id 或 message id，不會產生第二批。辨識與正式記帳規則只存在 Luminara。

必要設定名稱：`LUMINARA_WEALTH_BANK_ENABLED=true`、`LUMINARA_WEALTH_URL`、`LUMINARA_WEALTH_APP_URL`、`LUMINARA_WEALTH_S2S_SECRET`。Luminara 端另需相同的 `WEALTH_S2S_SECRET` 及 `WEALTH_LINE_USER_ID_HASH`（`LINE_ALLOWED_USER_ID` 的 SHA-256）。本次未設定正式值，也未更換 webhook。

`LUMINARA_WEALTH_BANK_ENABLED` 是明確的 rollout 邊界。未啟用或設定不完整時，一般圖片完全不查詢 Luminara，原有野採／英文流程不受財富服務故障影響。使用者已成功開啟銀行模式後，Dojo 會暫存有效 lease；此時 Luminara 若不可用，圖片會 fail-closed 並要求 LINE 重送，不會降級送入野採、英文影像匣或 Notion。

隔離回歸命令：`npm run test:wealth-bank`。它覆蓋未啟用、一般模式服務故障、已啟用銀行模式服務故障與正常退出四條路徑。

部署順序：先部署保持自動入帳關閉的 Luminara 與資料庫 migration，再配置雙邊 S2S 設定並做隔離驗證，最後才部署 Lumen-Dojo。任一步失敗可先撤回 Lumen-Dojo；既有圖片流程不受資料表回滾影響。`003_integrated_delivery.sql` 是 additive migration，正式執行前仍需備份與演練。
