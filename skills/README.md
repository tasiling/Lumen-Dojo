# 行光道場的測試用 Skill

接手野採時，先開[野採 v7 測試包](../simulations/yecai-inbox-v7.zip)裡的 `/reading`。這一頁有四種原文共讀操作。要改提示或判讀方式，可直接讀下表的 `SKILL.md`，再回到測試包中的 `dist/corpus-engine.js`（選段與問題）、`dist/corpus-app.js`（筆記與保存）及 `dist/corpus-relations.js`（跨篇對照）。瀏覽器裡的操作由模擬程式執行，AI 接手時可另外讀取這些技能。

## 已收進 repo 的原始檔

下表的「檔案」開啟這份 repo 裡的原始指引。每個來源目錄附原授權，方法所需的參考檔、模板或腳本保留相對路徑。上游連結固定在此次交接核對的版本。閱讀模擬保留了來源名稱，當初試作的上游提交編號沒有留下紀錄。

| 方法 | 檔案 | 在道場怎麼試 | 固定版來源與授權 |
| --- | --- | --- | --- |
| 讀書搭子 | [SKILL.md](book-reader-skill/SKILL.md) | 野採 `buddy`。自訂一個共同問題，找出兩段原文各自如何回答。 | [silentdog918/book-reader-skill](https://github.com/silentdog918/book-reader-skill/tree/f910584b7abdeb7f589dd3616e45252836bd71b4) · [MIT](book-reader-skill/LICENSE) |
| 書籍深度蒸餾 | [SKILL.md](sansheng-distill/SKILL.md) | 野採 `distill`。保留兩段出處，寫下判作互補、分歧或證據不足的理由。 | [sanshengai/sansheng-distill](https://github.com/sanshengai/sansheng-distill/tree/a411cc2c923eee070f0e77a44239ee58164a335c) · [MIT](sansheng-distill/LICENSE) |
| 拆書計畫 | [SKILL.md](book-dissection-skill/SKILL.md) | 野採 `layers`。依序看表面論點、背後機制與更深一層的解釋，最後留一個能用自身經驗回答的問題。 | [esthersjw/book-dissection-skill](https://github.com/esthersjw/book-dissection-skill/tree/1da78bae79ce6efa909da5ce92dad431696002c3) · [MIT](book-dissection-skill/LICENSE) |
| 書籍百維拆解術 | [SKILL.md](100-angles/SKILL.md) | 野採 `angles`。切換詞義、成立條件或值得重查的情況，再回原段落判斷。上游完整分析角度在同目錄的 `references/`。 | [dx2020z/100-angles](https://github.com/dx2020z/100-angles/tree/ff5a6eb13d2cce9f6d9201990a4146a4839af6d1) · [MIT](100-angles/LICENSE) |
| 把好書變成 AI 外腦 | [原子習慣](100books-to-skills/skills/原子习惯-atomic-habits/SKILL.md) · [展示你的工作](100books-to-skills/skills/展示你的工作-show-your-work/SKILL.md) | 在[閱讀筆記與心智圖 v3](../simulations/reading-map-v3.zip)選第五種方法，或把五種方法一起帶到 GPT。每本書有自己的指引，此處收錄模擬實際參照的兩份。 | [muyuhill/100books-to-skills](https://github.com/muyuhill/100books-to-skills/tree/9ca4ff0ac1eb578fbfc6196193466d7077832416) · [MIT](100books-to-skills/LICENSE) |
| 心智圖 | [中文指引](mindmap-skills/skills/mindmap-zh/SKILL.md) · [英文指引](mindmap-skills/skills/mindmap/SKILL.md) | 閱讀 v3 可複製大綱、匯出 Markmap Markdown 或 SVG。[創作流程 v16](../simulations/creative-studio-v16.zip)另有 D 的心智圖操作。 | [galiacheng/mindmap-skills](https://github.com/galiacheng/mindmap-skills/tree/20449b37c3ce625c4052b12c38c91777790c3300) · [MIT](mindmap-skills/LICENSE) |
| Unslop 介面審查 | [SKILL.md](unslop/SKILL.md) | 野採 v7 和閱讀 v3 均在 HTML 標示以此方法調整介面。改版時走一次手機的「選段 → 判讀 → 存回 → 重開」並檢查畫面。 | [Damir Sokolovsky（heydamir）原作](https://github.com/heydamir/unslop/tree/620163eedb3529d9cd23a3994ed8d287d06f760d/skills/unslop) · [CC BY 4.0](unslop/LICENSE) |

**野採驗收例**　匯入 v7 的十篇測資，從兩篇文章各選一段原文。用「讀書搭子」問兩位作者各拿了什麼當理由，切到「深度蒸餾」留下連結理由，存檔後再打開並核對兩個來源。若只有摘記或 AI 摘要，先標出缺少的原段。GPT 提出的解釋與本人採用的筆記分開保存。

**執行依賴**　閱讀指引及範例可直接從 checkout 開啟。需要把心智圖 Markdown 渲染成互動 HTML 時，使用中文或英文目錄附的 `scripts/render.sh`，它會透過 Node／npx 呼叫 Markmap CLI。深度蒸餾的書檔轉換與頁面驗證按輸入使用 Python 套件、Calibre 或 Playwright，各路線見[上游工作目錄與依賴](sansheng-distill/references/workspace-layout.md)。執行 Unslop 的截圖或動態前後對照才需要 Playwright 或 FFmpeg。

## 創作測試交給下游的三個 Skill

以下 ZIP 各含 `SKILL.md`、授權與所需資產。解壓後直接開啟同名目錄內的指引。兩個 Baoyu 包保留之前使用的繁中適配。Motion 包保留上游 starter 與測試，語音測試用的假憑證改為執行時產生。這些模擬頁會產生可交給工具的指令，成品另由具備相應能力的環境產出。

| 檔案 | 從哪裡接手 | 本次封存的上游來源 |
| --- | --- | --- |
| [baoyu-xhs-images.zip](creative/baoyu-xhs-images.zip) | [圖文／簡報 v1](../simulations/weaving-style-v1.zip) 或 [草稿 v23](../simulations/creative-draft-v23.zip) → 多頁輪播圖。 | [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills/tree/5792c7dc8d09a28d6969e8970166c5eb090ce6ad/skills/baoyu-xhs-images) · MIT |
| [baoyu-slide-deck.zip](creative/baoyu-slide-deck.zip) | 圖文／簡報 v1 → 投影片圖像、PDF 或 PPTX。 | [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills/tree/5792c7dc8d09a28d6969e8970166c5eb090ce6ad/skills/baoyu-slide-deck) · MIT |
| [motion-showreel.zip](creative/motion-showreel.zip) | 草稿 v23 → 短片動效指令。合成影片使用 Node、Playwright／Chromium 與 FFmpeg。 | [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills/tree/f2d7adeaf53dcce3d0eb19cbffe8c04f4c636c2a/skills/motion-showreel) · MIT |

## 仍待驗收的外部工具

| 外部工具 | 已做到哪裡 |
| --- | --- |
| [xhs-claude-skills](https://github.com/chenxiachan/xhs-claude-skills/blob/e140727198e02f4919654b859a45dce930b625ef/skills/xhs/SKILL.md)、[social](https://github.com/coreyhaines31/marketingskills/blob/5b2b400eec1e7e1cec76245a715d0b0d4fd2a9c1/skills/social/SKILL.md)、[歸藏社交卡片](https://github.com/op7418/guizang-social-card-skill/blob/64d02d435fb092d3b403455a875e842fc8f29b8b/SKILL.md) | 待本人驗收。小紅書試到既有截圖與 OCR 段落定位；平台改寫試到測試稿能帶回並分別編修；歸藏試到截圖能置入 HTML。原帖擷取、實稿改寫與 PNG 輸出各自待測。這三項在此保留上游來源。 |

正式站的資料、部署及開發輔助工具見 [HANDOFF.md](../HANDOFF.md)，其餘模擬檔見[測試索引](../simulations/README.md)。
