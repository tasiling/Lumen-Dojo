'use client';
import { randomID } from '@/lib/dojo/weavingWorkflow/clientIdentity';
import { useState } from 'react';
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
}) { return <div className="studio-choice"><b>{label}</b><div className="studio-actions">{Object.entries(options).map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => change(v)}>{t}</button>)}</div></div>; }
export default function CollaborationPanel({ s, edit, check, round, routeCandidate, review, directions, sourceVersion, sourceText }: {
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
    return <section className="studio-collaboration"><p>{({ A: '靈感給 A：從素材探索想說的方向；只有觀察、感受或問題也能開始。草稿結構診斷是可選用途。', B: '草稿給 B：已有草稿可直接開始，不必先完成 A。研究先另列，由你決定只作背景、寫入主文或不用。', C: '主稿給 C：選定本輪底稿，再轉製限動或擴寫；兩種模式各自保存回覆與輪次。', D: '完稿給 D：從本件固定完成版本做四軸三層延伸，不必先發布。' })[s.module]}</p><p>貼回先保存完整回覆，採用主稿是另一個操作；本人回答與決定另外保存。</p>
 {s.module === 'A' && <><Choice label="從哪裡開始" value={f.aMode} options={{ material: '從素材開始', clarify: '已有方向', draft: '已有草稿' }} change={aMode => change({ aMode })}/><Text label="目前想談什麼" value={f.aIntent} change={aIntent => change({ aIntent })}/><Text label="我的回答與確認意思" value={f.aAnswers} change={aAnswers => change({ aAnswers })}/><details><summary>表達界線與尚未解開的問題</summary>{([['expression', '這次想表達什麼'], ['boundary', '避開或不公開的內容'], ['keep', '希望保留的內容'], ['unresolved', '尚未解開，可繼續保留']] as const).map(([k, l]) => <Text key={k} label={l} value={f[k]} change={v => change({ [k]: v })}/>)}</details></>}
 {s.module === 'B' && <><Text label="這次想整理的方向（選填）" value={f.aIntent} change={aIntent => change({ aIntent })}/><Text label="我的回答與確認意思" value={f.aAnswers} change={aAnswers => change({ aAnswers })}/><details open><summary>主文整理設定</summary><Choice label="修改幅度" value={f.bMode} options={{ conservative: '保留原句', standard: '適度整理', focused: '聚焦主線' }} change={bMode => change({ bMode })}/><Choice label="文章框架" value={f.framework} options={frameworks} change={framework => change({ framework })}/><Choice label="主要收束方式" value={f.closure} options={{ '未定': '請 AI 建議', '認知閉合': '理解問題', '情感閉合': '安頓感受', '意圖閉合': '形成行動意圖' }} change={closure => change({ closure })}/><Text label="本人提供的行動或實踐（選填）" value={f.practices} change={practices => change({ practices })}/></details><details><summary>逐筆研究與用途（{f.research.length}）</summary>{f.research.map((r, i) => <section key={i}>{(['title', 'source', 'mechanism', 'scope', 'relation'] as const).map(k => <Text key={k} label={{ title: '研究名稱', source: '出處或連結', mechanism: '機制', scope: '適用範圍與限制', relation: '與素材的關聯' }[k]} value={r[k]} change={v => change({ research: f.research.map((x, j) => j === i ? { ...x, [k]: v } : x) })}/>)}<Choice label="這筆研究的用途" value={r.use} options={{ background: '只供理解', body: '寫入主文', none: '不使用' }} change={v => change({ research: f.research.map((x, j) => j === i ? { ...x, use: v as typeof r.use } : x) })}/></section>)}<button onClick={() => change({ research: [...f.research, { title: '', source: '', mechanism: '', scope: '', relation: '', use: 'background' }] })}>新增研究</button></details><Text label="候選主文（只放文章，採用才更新正文）" value={f.manuscript} change={manuscript => change({ manuscript })}/><Text label="編輯說明" value={f.editorial} change={editorial => change({ editorial })}/></>}
 {s.module === 'C' && <><Choice label="這次要做什麼" value={f.cMode} options={{ condense: '轉製限動文案', expand: '擴寫原稿' }} change={cMode => change({ cMode: cMode as Collaboration['cMode'] })}/>{f.cMode === 'expand' ? <><Choice label="擴寫框架" value={f.cExpandFramework} options={frameworks} change={cExpandFramework => change({ cExpandFramework })}/><Choice label="擴寫強度" value={f.cExpandLevel} options={{ light: '輕度', standard: '標準', deep: '深度' }} change={cExpandLevel => change({ cExpandLevel })}/></> : <Choice label="限動框架" value={f.cFrameworkMode} options={{ auto: '建議合適框架', all: '五種框架比較' }} change={cFrameworkMode => change({ cFrameworkMode })}/>}<Text label={f.cMode === 'expand' ? '候選擴寫主文（採用才更新正文）' : '候選限動文案（採用後建立獨立稿）'} value={f.cMode === 'expand' ? f.cExpandedManuscript : f.cManuscript} change={v => change(f.cMode === 'expand' ? { cExpandedManuscript: v } : { cManuscript: v })}/><Text label="本輪固定底稿（帶入後不隨正文更新）" value={cBase(f).text} change={v => change(f.cMode === 'expand' ? { cExpandedSource: v, cExpandedVersionId: 'manual' } : { cSource: v, cVersionId: 'manual' })}/></>}
 {s.module === 'D' && <Text label="跨系統參考資料（選填，只使用本人提供的內容）" value={f.dSystems} change={dSystems => change({ dSystems })}/>}
 {(s.module === 'A' || s.module === 'D') && <details><summary>保留候選與決定歸屬</summary>{f.candidates.filter(x => x.module === s.module).map(r => <section key={r.id}>{(['title', 'statement', 'quote', 'locator'] as const).map(k => <Text key={k} label={{ title: '候選名稱', statement: '想探索的意思（尚未確認）', quote: '來源原句', locator: '來源段落或位置' }[k]} value={r[k]} change={v => change({ candidates: f.candidates.map(x => x.id === r.id ? { ...x, [k]: v } : x) })}/>)}<p>來源版本：{r.sourceVersion || '本次選摘'}；{r.directionId ? '已連結方向' : '暫存候選'}</p><div className="studio-actions"><button onClick={() => routeCandidate(r.id, 'existing')}>在目前主題新增方向</button><button onClick={() => routeCandidate(r.id, 'new')}>另建題目與方向</button>{directions.map(d => <button key={d.id} onClick={() => routeCandidate(r.id, 'merge:' + d.id)}>接入「{d.title}」的新理解版本</button>)}</div></section>)}<button onClick={() => change({ candidates: [...f.candidates, { id: randomID(), module: s.module, title: '', statement: '', quote: '', locator: '', sourceVersion: s.module === 'D' ? '待選完稿' : s.source.selectedVersion, topicId: '', directionId: '' }] })}>手動整理一個候選（完整回覆保留）</button></details>}
 <div className="studio-actions"><button onClick={round}>保存本輪回覆與來源設定</button><button onClick={check}>複製 AI 檢查指令</button><button onClick={() => { setParseError(''); setParsed(previewReply(s, { versionId: sourceVersion, text: sourceText })); }}>辨識回覆段落，先預覽</button></div>
 {parseError && <p role="alert">{parseError}</p>}
 {parsed && <details open><summary>辨識預覽（確認後分欄，主稿不變）</summary>{Object.entries(parsed.sections).map(([k, v]) => <details key={k}><summary>{k}</summary><p className="studio-manuscript">{v}</p></details>)}{parsed.warnings.map(w => <p key={w}>{w}</p>)}<p>辨識到 {parsed.research.length} 筆研究、{parsed.examples.length} 個例子、{parsed.candidates.length} 個候選。新研究先作背景，例子不自動採用；已存在的採用設定保持原值。</p>{(['research', 'examples', 'candidates'] as const).map(k => <label key={k}><input type="checkbox" checked={include[k]} onChange={e => setInclude({ ...include, [k]: e.target.checked })}/>{{ research: '加入研究欄位', examples: '加入例子欄位', candidates: '加入候選欄位' }[k]}</label>)}<button onClick={() => {
                try {
                    edit(applyReplyPreview(s, parsed, sourceVersion, include, sourceText));
                    setParsed(null);
                }
                catch (e) {
                    setParseError(String(e));
                }
            }}>確認分欄，保留完整回覆</button><button onClick={() => setParsed(null)}>取消辨識</button></details>}
 <details><summary>貼回 AI 檢查結果</summary><Text label="AI 檢查回覆（不改動原回覆與主稿）" value={f.reviewReply} change={reviewReply => change({ reviewReply })}/><button disabled={!f.reviewReply.trim()} onClick={review}>確認保存為檢查輪次</button></details>
 <details><summary>協作輪次（{f.rounds.length}）</summary>{f.rounds.map(r => <details key={r.id}><summary>{r.module} · {r.mode} · {r.createdAt}</summary><p className="studio-manuscript">{r.reply}</p><p>本人回答：{r.answers}</p><p className="studio-manuscript">來源 {r.sourceVersion}：{r.sourceText}</p><pre className="studio-manuscript">{r.settings}</pre></details>)}</details>
 </section>;
}
