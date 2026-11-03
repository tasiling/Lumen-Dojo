import Link from 'next/link';
import CreativeIcon from '@/app/components/creative/CreativeIcon';
import {ORIGINAL_TOOLS, type ToolRealm} from '@/lib/liaojieTools/catalog';
import '@/app/liaojie/tools/tools.css';
export default function ToolHub({realm}:{realm:ToolRealm}) {
 const name=realm==='weaving'?'織光堂':'聊解室';
 return <section className="screen original-tools-hub">
  <Link className="original-workspace-back" href={'/'+realm}>← {name}</Link>
  <header className="original-tools-hero"><span>{name} · 寫作與製作</span><h1>創作工具</h1><p>從文字整理、占卜貼文到圖文編排，選一個工具開始。兩個場域共用同一份工具草稿。</p></header>
  <div className="original-tools-grid">{ORIGINAL_TOOLS.map((tool,i)=><article key={tool.id} className="ritual-card original-tool-card"><span className="original-tool-number"><CreativeIcon name={(['diamond','sun','layers','chat','document'] as const)[i]}/></span><h2>{tool.name}</h2><p>{tool.purpose}</p><p className="original-tool-detail">{tool.detail}</p><Link className="button-link" href={`/${realm}/tools/${tool.id}`} aria-label={'開啟'+tool.name}>開啟工具 →</Link></article>)}
   <article className="ritual-card original-tool-card"><span className="original-tool-number"><CreativeIcon name="layers"/></span><h2>噗浪・蓋樓台</h2><p>把長文分樓，逐樓複製並整理發文排程。</p><p className="original-tool-detail">保留原有範本與草稿；到點提醒，由你確認並貼上噗浪。</p><Link className="button-link" href={`/${realm}/plurk`}>開啟噗浪蓋樓台 →</Link></article>
  </div>
  <p className="original-tools-note">五個原工具的草稿保存在這個瀏覽器；換裝置前請下載草稿備份。噗浪草稿與範本沿用原有保存方式。AI 寫作指令可交給慣用的 AI 對話執行。</p>
  <Link className="button-link" href={realm==='weaving'?'/weaving/works':'/liaojie/workbench'}>{realm==='weaving'?'編輯文章與圖文':'前往作品發布整理'} →</Link>
 </section>;
}
