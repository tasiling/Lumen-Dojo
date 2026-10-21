'use client';
import Image from 'next/image';
import type {PodcastDraft} from '@/lib/dojo/podcast/model';
export default function PodcastDraftComparison({draft:d}:{draft:PodcastDraft}){
 return <div className="podcast-comparison"><h3>{d.title}</h3><dl><dt>節目名稱</dt><dd>{d.showName||'未填寫'}</dd><dt>這次想說什麼</dt><dd className="full-text-preview">{d.angle||'未填寫'}</dd><dt>單集介紹</dt><dd className="full-text-preview">{d.description||'未填寫'}</dd></dl>
  <details open><summary>原始逐字稿</summary><p className="full-text-preview">{d.rawTranscript||'未填寫'}</p></details>
  <h4>原始錄音</h4>{d.recording?<><audio controls preload="metadata" src={`/api/dojo/podcast/media?id=${d.recording.assetId}`}/><p>錄音識別：{d.recording.assetId}</p><p>{d.recording.kind==='self'?'本人錄音':'隔離測試音訊'}；{d.recording.publicConfirmed?'已確認可公開':'尚未確認公開'}</p><p className="full-text-preview">{d.recording.sourceNote}</p></>:<p>尚未匯入錄音</p>}
  <h4>封面配圖</h4>{d.cover?<><Image unoptimized width={160} height={160} alt="比較封面配圖" src={`/api/dojo/illustrated/assets?id=${d.cover.assetId}`}/><p>配圖識別：{d.cover.assetId}</p><p>{({own:'本人創作／拍攝',generated:'AI生成',licensed:'已取得使用許可'})[d.cover.kind]}；{d.cover.publicConfirmed?'已確認可公開':'尚未確認公開'}</p><p className="full-text-preview">{d.cover.sourceNote}</p><p>製作工具：{d.cover.tool||'未填寫'}</p><p className="full-text-preview">製作紀錄：{d.cover.prompt||'未填寫'}</p></>:<p>尚未加入配圖</p>}
  {d.segments.map((s,i)=><section key={s.id}><h4>{i+1}．{s.title||'尚未命名'}</h4><p>章節起秒：{s.startSeconds??'未設定'}</p><p className="full-text-preview">{s.script}</p><p className="full-text-preview">{s.editNote||'未填剪輯註記'}</p></section>)}
 </div>;
}
