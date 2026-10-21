'use client';
import Image from 'next/image';
import type {ComicDraft} from '@/lib/dojo/comic/model';
import type {ImageUse} from '@/lib/dojo/illustrated/model';
function Picture({image}:{image:ImageUse|null}){return image?<div><Image unoptimized width={180} height={180} src={`/api/dojo/illustrated/assets?id=${image.assetId}`} alt="比較圖片"/><p>圖片識別：{image.assetId}</p><p>來源：{image.sourceNote}；{image.kind}；公開確認：{image.publicConfirmed?'已確認':'未確認'}</p><p>工具：{image.tool}</p><p>製作紀錄：{image.prompt}</p></div>:<p>未加入圖片</p>;}
export default function ComicComparison({draft:d}:{draft:ComicDraft}){return <div className="comic-comparison full-text-preview"><h3>{d.title}</h3><p>{d.caption}</p>{d.characters.map(c=><section key={c.id}><p>角色：{c.name}（{c.id}）</p><p>角色描述：{c.description}</p><Picture image={c.reference}/></section>)}{d.panels.map((p,i)=><section key={p.id}><h4>第{i+1}格（{p.id}）{p.confirmed?'已確認':'待確認'}</h4><p>{p.scene}</p><p>{p.speaker}</p><p>{p.dialogue}</p><p>角色引用：{p.characterIds.join('、')}；{p.fit}／重心{p.position}</p><Picture image={p.image}/></section>)}</div>;}
