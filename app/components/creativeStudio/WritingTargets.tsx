'use client';
import type { StudioData } from '@/lib/dojo/creativeStudio/model';
import { togglePlatform, writingPlatforms } from '@/lib/dojo/creativeStudio/targets';
export default function WritingTargets({s, edit}: {s:StudioData;edit:(p:Partial<StudioData>)=>void}) {
    return <section className="studio-targets" aria-label="本輪內容與平台設定"><div className="studio-target-group"><b>內容類型</b><div className="studio-target-grid" aria-label="內容類型">{Object.entries({article:'文章',story:'限動',illustrated:'圖文'}).map(([v,label])=><button key={v} aria-pressed={s.contentKind===v} onClick={()=>edit({contentKind:v})}>{label}</button>)}</div></div><div className="studio-target-group"><b>目標平台（可複選）</b><div className="studio-target-grid" aria-label="目標平台">{writingPlatforms.map(platform=><button key={platform} aria-pressed={s.targetPlatforms.includes(platform)} onClick={()=>{const targetPlatforms=togglePlatform(s.targetPlatforms,platform);edit({targetPlatforms,platform:targetPlatforms[0]||''});}}>{platform}</button>)}</div><p>{s.targetPlatforms.length?`本輪分別整理 ${s.targetPlatforms.join('、')} 的平台稿，與共用主稿分開保存。`:'未指定平台，先整理共用主稿。點選平台可加入，再點一次可取消。'}設定會帶入下一次複製的 B 指令。</p></div></section>;
}
