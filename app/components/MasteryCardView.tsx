'use client';
import {rankLabels,type MasterySummary} from '@/lib/dojo/mastery/model';
export default function MasteryCardView({card,onOpen}:{card:MasterySummary;onOpen:()=>void}){
 return <article style={{border:'1px solid #999',borderRadius:12,padding:16,margin:'12px 0',minWidth:0,overflowWrap:'anywhere'}}><h2>{card.name}</h2><p>{rankLabels[card.rank]}階 · {card.scope.level==='topic'?'主題':card.scope.level==='stage'?'階段':'路徑'}能力 · {card.status==='withdrawn'?'已撤回':'已收藏'}</p><p>取得：{card.acquiredAt.slice(0,10)} · 本階取得：{card.rankAchievedAt.slice(0,10)}</p><p>評核：{card.evaluatorType==='self'?'自評':card.evaluatorType==='teacher'?'教師':card.evaluatorType==='professional'?'專業人員':'AI 協助'} · 規準 v{card.rankDefinitionVersion}</p><p>CEFR 參考：{card.cefrReference??'未設定'}；不代表整體 CEFR 認證或專業資格。</p><button onClick={onOpen}>查看學成歷程</button></article>;
}
