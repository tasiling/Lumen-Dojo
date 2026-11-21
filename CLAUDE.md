# Claude Code 開發規則

@AGENTS.md

本專案使用的 Next.js 版本包含破壞性變更。API、檔案結構與框架慣例都可能與先前版本不同。

- 寫程式前，先到 `node_modules/next/dist/docs/` 閱讀與本次修改相符的指南。全新 checkout 先執行 `npm ci` 取得專案鎖定版本的文件。
- 實作時依該版本的規範，留意棄用公告，採用指南指定的替代作法。

共用規則以 [AGENTS.md](AGENTS.md) 為準。專案架構、正式入口及驗證方式見 [開發交接](HANDOFF.md)。 做野採、閱讀或介面試作時，從 [Skill 索引](skills/README.md) 開啟對應的原始指引與測試檔。
