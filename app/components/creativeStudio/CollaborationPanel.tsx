'use client';
import { randomID } from '@/lib/dojo/weavingWorkflow/clientIdentity';
import { useState, type ReactNode } from 'react';
import { cBase, frameworks, type Collaboration } from '@/lib/dojo/creativeStudio/collaboration';
import { previewReply, applyReplyPreview, type ReplyPreview } from '@/lib/dojo/creativeStudio/reply';
import type { StudioData } from '@/lib/dojo/creativeStudio/model';
function Text({ label, value, change }: {
    label: string;
    value: string;
    change: (v: string) => void;
}) { return <label>{label}<textarea rows={3} value={value} onChange={e => change(e.target.value)}/></label>; }
function Choice({ label, value, options, change }: {
    label: string;
    value: string;
    options: Record<string, string>;
    change: (v: string) => void;
}) { return <div className="studio-choice" role="group" aria-label={label}><b>{label}</b><div className="studio-actions">{Object.entries(options).map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => change(v)}>{t}</button>)}</div></div>; }
export default function CollaborationPanel({ s, edit, check, round, routeCandidate, review, directions, sourceVersion, sourceText, promptControls }: {
    promptControls?: ReactNode;
    sourceVersion: string;
    sourceText: string;
    directions: {
        id: string;
        title: string;
    }[];
    s: StudioData;
    edit: (p: Partial<StudioData>) => void;
    check: () => void;
    round: () => void;
    routeCandidate: (id: string, mode: string) => void;
    review: () => void;
}) {
    const [parsed, setParsed] = useState<ReplyPreview | null>(null), [parseError, setParseError] = useState(''), [include, setInclude] = useState({ research: true, examples: true, candidates: true }), f = s.collaboration;
    const change = (p: Partial<Collaboration>) => edit({ collaboration: { ...f, ...p } });
    return <section className="studio-collaboration"><p>{({ A: '靈感給 A：從素材探索想說的方向；只有觀察、感受或問題也能開始。草稿結構診斷是可選用途。', B: '草稿給 B：已有草稿可直接開始，不必先完成 A。研究先另列，由你決定留作參考、寫入主文或不用。', C: '主稿給 C：選定本輪底稿，再轉製限動或擴寫；兩種模式各自保存回覆與輪次。', D: '完稿給 D：從本件固定完成版本做四軸三層延伸，不必先發布。' })[s.module]}</p><p>寫好要求後，複製指令到 ChatGPT。取得回覆，再貼回這個頁面。</p>
 {s.module === 'A' && <><Choice label="從哪裡開始" value={f.aMode} options={{ material: '從素材開始', clarify: '已有方向', draft: '已有草稿' }} change={aMode => change({ aMode })}/><Text label="目前想談什麼" value={f.aIntent} change={aIntent => change({ aIntent })}/><Text label="我想表達的意思" value={f.aAnswers} change={aAnswers => change({ aAnswers })}/><details><summary>表達界線與尚未解開的問題</summary>{([['expression', '這次想表達什麼'], ['boundary', '避開或不公開的內容'], ['keep', '希望保留的內容'], ['unresolved', '尚未解開，可繼續保留']] as const).map(([k, l]) => <Text key={k} label={l} value={f[k]} change={v => change({ [k]: v })}/>)}</details></>}
 {s.module === 'B' && <><Text label="這篇想寫什麼（選填）" value={f.aIntent} change={aIntent => change({ aIntent })}/><Text label="我想表達的意思" value={f.aAnswers} change={aAnswers => change({ aAnswers })}/><details><summary>寫作要求（可修改）</summary><Choice label="修改幅度" value={f.bMode} options={{ conservative: '保留原句', standard: '適度整理', focused: '聚焦主線' }} change={bMode => change({ bMode })}/><Choice label="文章框架" value={f.framework} options={frameworks} change={framework => change({ framework })}/><p className="studio-field-help">框架是文章的安排方式。不確定時選「依意圖建議」，讓 ChatGPT 先提建議。</p><Choice label="希望讀者讀完後得到什麼？" value={f.closure} options={{ '未定': '請 AI 建議', '認知閉合': '理解問題', '情感閉合': '安頓感受', '意圖閉合': '形成行動意圖' }} change={closure => change({ closure })}/><Text label="想請讀者嘗試的做法（選填）" value={f.practices} change={practices => change({ practices })}/></details><Choice label="要請 ChatGPT 找研究嗎？" value={f.researchMode} options={{suggest:"幫我找研究",skip:"這次先不找"}} change={researchMode=>change({researchMode:researchMode as Collaboration["researchMode"]})}/><p>即使草稿沒有研究，也可以請 ChatGPT 幫忙找。找到後再決定要不要引用。</p></>}
 {s.module === 'C' && <><Choice label="這次要做什麼" value={f.cMode} options={{ condense: '改成限動文案', expand: '擴寫原稿' }} change={cMode => change({ cMode: cMode as Collaboration['cMode'] })}/>{f.cMode === 'expand' ? <><Choice label="擴寫框架" value={f.cExpandFramework} options={frameworks} change={cExpandFramework => change({ cExpandFramework })}/><Choice label="擴寫強度" value={f.cExpandLevel} options={{ light: '輕度', standard: '標準', deep: '深度' }} change={cExpandLevel => change({ cExpandLevel })}/></> : <Choice label="限動框架" value={f.cFrameworkMode} options={{ auto: '建議合適框架', all: '五種框架比較' }} change={cFrameworkMode => change({ cFrameworkMode })}/>}<Text label={f.cMode === 'expand' ? '準備選用的擴寫文章' : '準備選用的限動文案'} value={f.cMode === 'expand' ? f.cExpandedManuscript : f.cManuscript} change={v => change(f.cMode === 'expand' ? { cExpandedManuscript: v } : { cManuscript: v })}/><Text label="這次交給 ChatGPT 的文章（保留送出時的內容）" value={cBase(f).text} change={v => change(f.cMode === 'expand' ? { cExpandedSource: v, cExpandedVersionId: 'manual' } : { cSource: v, cVersionId: 'manual' })}/></>}
 {s.module === 'D' && <Text label="想一起參考的其他資料（選填）" value={f.dSystems} change={dSystems => change({ dSystems })}/>}
 {(s.module === 'A' || s.module === 'B' || s.module === 'D') && <details><summary>保留寫作方向的建議</summary>{f.candidates.filter(x => x.module === s.module || (s.module==='B'&&x.module==='A')).map(r => <section key={r.id}>{(['title', 'statement', 'quote', 'locator'] as const).map(k => <Text key={k} label={{ title: '建議方向的名稱', statement: '想再討論的意思', quote: '原文中的句子', locator: '來源段落或位置' }[k]} value={r[k]} change={v => change({ candidates: f.candidates.map(x => x.id === r.id ? { ...x, [k]: v } : x) })}/>)}<p>來源版本：{r.sourceVersion || '本次選摘'}；{r.directionId ? '已連結方向' : '暫存候選'}</p><div className="studio-actions"><button onClick={() => routeCandidate(r.id, 'existing')}>在目前主題新增方向</button><button onClick={() => routeCandidate(r.id, 'new')}>另建題目與方向</button>{directions.map(d => <button key={d.id} onClick={() => routeCandidate(r.id, 'merge:' + d.id)}>接入「{d.title}」的新理解版本</button>)}</div></section>)}<button onClick={() => change({ candidates: [...f.candidates, { id: randomID(), module: s.module, title: '', statement: '', quote: '', locator: '', sourceVersion: s.module === 'D' ? '待選完稿' : s.source.selectedVersion, topicId: '', directionId: '' }] })}>自己新增一個寫作方向</button></details>}
 {promptControls}<div className="studio-actions studio-collaboration-tools" role="group" aria-label="對話紀錄與內容檢查"><button aria-label="記下這次回覆和寫作要求" onClick={round}><span>記下這次回覆</span><small>連同這次的寫作要求</small></button><button aria-label="複製內容檢查指令" onClick={check}><span>複製檢查指令</span><small>請 ChatGPT 幫忙檢查</small></button>{s.module !== 'B' && <button onClick={() => { setParseError(''); setParsed(previewReply(s, { versionId: sourceVersion, text: sourceText })); }}>預覽文章與研究</button>}</div>
 {parseError && <p role="alert">{parseError}</p>}
 {parsed && <details open><summary>辨識預覽（確認後分欄，主稿不變）</summary>{Object.entries(parsed.sections).map(([k, v]) => <details key={k}><summary>{k}</summary><p className="studio-manuscript">{v}</p></details>)}{parsed.warnings.map(w => <p key={w}>{w}</p>)}<p>{parsed.researchFailure?'研究辨識失敗，研究筆數無法確認':'辨識到 '+parsed.research.length+' 筆研究'}、{parsed.examples.length} 個例子、{parsed.candidates.length} 個候選。新研究用途待本人決定，例子不自動採用；已存在的採用設定保持原值。</p>{(['research', 'examples', 'candidates'] as const).map(k => <label key={k}><input type="checkbox" checked={include[k]} onChange={e => setInclude({ ...include, [k]: e.target.checked })}/>{{ research: '加入研究欄位', examples: '加入例子欄位', candidates: '加入候選欄位' }[k]}</label>)}<button onClick={() => {
                try {
                    edit(applyReplyPreview(s, parsed, sourceVersion, include, sourceText));
                    setParsed(null);
                }
                catch (e) {
                    setParseError(String(e));
                }
            }}>加入這次整理的文章與研究</button><button onClick={() => setParsed(null)}>關閉預覽</button></details>}
 <details><summary>查看或貼上內容檢查結果</summary><Text label="貼上 ChatGPT 的檢查結果" value={f.reviewReply} change={reviewReply => change({ reviewReply })}/><button disabled={!f.reviewReply.trim()} onClick={review}>記下這份檢查結果</button></details>
 <details><summary>過去的回覆（{f.rounds.length}）</summary>{f.rounds.map(r => <details key={r.id}><summary>{r.module} · {r.mode==='intake'?'確認分欄':r.mode==='review'?'AI 檢查':r.mode} · {r.createdAt}</summary><p className="studio-manuscript">{r.reply}</p><p>本人回答：{r.answers}</p><p className="studio-manuscript">來源 {r.sourceVersion}：{r.sourceText}</p><pre className="studio-manuscript">{r.settings}</pre></details>)}</details>
 </section>;
}
