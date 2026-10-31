'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get, mutate } from '../weaving/client';
import type { VoiceSample } from '@/lib/dojo/creativeStudio/voice';
import './studio.css';
type Voice = {
    id: string;
    revision: number;
    samples: VoiceSample[];
    proposal: string;
    confirmed: boolean;
};
export default function StudioVoice() { const [voice, setVoice] = useState<Voice>({ id: '', revision: 0, samples: [], proposal: '', confirmed: false }), [candidates, setCandidates] = useState<VoiceSample[]>([]), [ids, setIds] = useState<string[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false); useEffect(() => { get<{
    voice: Voice;
    candidates: VoiceSample[];
}>('/api/dojo/creative-voice').then(r => { setVoice(r.voice); setCandidates(r.candidates); setIds(r.voice.samples.map(s => s.releaseId)); }).catch(e => setMessage(String(e))); }, []); async function save() { setBusy(true); try {
    const r = await mutate<{
        voice: Voice;
    }>('/api/dojo/creative-voice', 'POST', { expectedRevision: voice.revision, releaseIds: ids, proposal: voice.proposal, confirmed: voice.confirmed });
    setVoice(r.voice);
    setMessage('已保存本人核對的語氣設定。');
}
catch (e) {
    setMessage(String(e));
}
finally {
    setBusy(false);
} } return <section className="screen studio"><h1>我的語氣庫</h1><p>樣本只來自記錄為「實際發表」的固定文字版本。候選 AI 稿、預排稿與私人服務解讀不會自動加入。</p>{message && <p role="status">{message}</p>}<section className="ritual-card"><h2>挑選公開樣本</h2>{!candidates.length && <p>尚無可選的實際發表文字。可先在聊解室的發布回看填寫實際日期與連結。</p>}{candidates.map(c => <div key={c.releaseId}><label className="studio-check"><input type="checkbox" checked={ids.includes(c.releaseId)} onChange={e => setIds(e.target.checked ? [...ids, c.releaseId] : ids.filter(id => id !== c.releaseId))}/>選用這篇已發表文章</label><details><summary>固定版本 {c.versionId}</summary><p className="studio-manuscript">{c.text}</p><a href={c.publishedUrl} target="_blank" rel="noreferrer">實際文章</a></details></div>)}</section><section className="ritual-card"><label>本人確認／整理中的語氣偏好<textarea rows={8} value={voice.proposal} onChange={e => setVoice({ ...voice, proposal: e.target.value, confirmed: false })}/></label><label className="studio-check"><input type="checkbox" checked={voice.confirmed} onChange={e => setVoice({ ...voice, confirmed: e.target.checked })}/>這些偏好已由我本人核對，可供之後的協作參考</label><button className="primary" disabled={busy} onClick={() => void save()}>保存語氣設定</button></section><div className="studio-link-grid"><Link href="/weaving">回織光堂</Link><Link href="/liaojie/releases">聊解室發布回看</Link></div></section>; }
