import Link from 'next/link';
import CreativeIcon from '@/app/components/creative/CreativeIcon';
import '../tools/tools.css';
const entries = [
  {href:'/liaojie/tools/sanko-prompt',icon:'sun',title:'單篇指令與抽牌',note:'選擇方法、記下抽牌，產生這一篇的協作指令。'},
  {href:'/liaojie/tools/sanko-batch',icon:'calendar',title:'批次題目與解析',note:'安排多日題目，整理逐日抽牌與解析。'},
  {href:'/weaving/works',icon:'document',title:'接續文字與圖文作品',note:'帶著整理好的內容，繼續編寫與製作。'},
] as const;
export default function Page() {
  return <section className="screen sanko-home">
    <header className="original-tools-hero"><span>聊解室 · 內容創作</span><h1>日上三更</h1><p>從這次想分享的主題開始，整理題目、抽牌與作品。第三更方向、發布頻率與行銷用途由你調整。</p></header>
    <div className="sanko-entry-list">{entries.map((entry,index)=><Link href={entry.href} key={entry.href} className="sanko-entry"><span className="original-tool-number"><CreativeIcon name={entry.icon}/></span><span className="sanko-entry-copy"><small>0{index+1}</small><strong>{entry.title}</strong><span>{entry.note}</span></span><CreativeIcon name="chevron"/></Link>)}</div>
  </section>;
}
