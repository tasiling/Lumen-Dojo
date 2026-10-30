import Link from 'next/link';
import { ORIGINAL_TOOLS } from '@/lib/liaojieTools/catalog';
import './tools.css';
export default function OriginalToolsPage() {
  return <section className="screen original-tools-hub">
    <Link href="/liaojie">← 聊解室</Link>
    <header className="original-tools-hero"><span>行光道場 · 相容入口</span><h1>原工具與裝置備份</h1><p>保留實測好用的原方法與既有裝置資料。新版作品從織光堂開始，日上三更從聊解室進入。</p></header>
    <div className="original-tools-grid">{ORIGINAL_TOOLS.map((tool, i) => <article key={tool.id} className="ritual-card original-tool-card"><span className="original-tool-number">{['◇','☀','▦','☏','▤'][i]}</span><h2>{tool.name}</h2><p>{tool.purpose}</p><p className="original-tool-detail">{tool.detail}</p><Link className="button-link" href={'/liaojie/tools/' + tool.id} aria-label={'開啟'+tool.name}>開啟工具 →</Link></article>)}</div>
    <p className="original-tools-note">草稿自動保存在這個裝置的瀏覽器；請下載備份以便保管或換裝置。AI 指令仍可交給你慣用的 AI 對話執行。工具裡的示範內容請替換成你的內容。</p>
    <Link href="/liaojie/workbench" className="button-link">前往作品發布整理 →</Link>
  </section>;
}
