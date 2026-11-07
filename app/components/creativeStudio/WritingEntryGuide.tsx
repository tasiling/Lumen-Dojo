'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { beginIntent, confirmIntent } from '@/lib/dojo/weavingWorkflow/clientIdentity';
import { blankStudio } from '@/lib/dojo/creativeStudio/model';
import type { WeavingWork } from '@/lib/dojo/weavingShuttle';
import { mutate } from '../weaving/client';
import './studio.css';

export default function WritingEntryGuide({ realm, onChoose, beforeStart, disabled = false }: {
    realm: 'weaving' | 'liaojie';
    onChoose?: (moduleName: 'A' | 'B') => void;
    beforeStart?: () => boolean;
    disabled?: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function start(moduleName: 'A' | 'B') {
        if (onChoose) { onChoose(moduleName); return; }
        if (beforeStart && !beforeStart()) return;
        const scope = 'studio-guided-start-' + moduleName;
        const studio = blankStudio();
        studio.module = moduleName;
        const payload = { action: 'create', title: moduleName === 'A' ? '未命名靈感探索' : '未命名文章草稿', studio };
        const intent = beginIntent(scope, payload);
        setBusy(true); setError('');
        try {
            const result = await mutate<{ work: WeavingWork }>('/api/dojo/creative-studio', 'POST', { ...payload, requestNonce: intent.id });
            confirmIntent(scope, intent.id);
            router.push('/' + realm + '/works/' + result.work.id + '?entry=write');
        } catch (reason) { setError(String(reason)); }
        finally { setBusy(false); }
    }
    return <section className="studio-writing-guide" aria-label="文章協作起點">
        <h2>靈感給 A，草稿給 B</h2>
        <p>有靈感就從 A 開始；已有文章可直接用 B。</p>
        <div className="studio-writing-choices">
            <article><h3>A｜還在找寫作方向</h3><p>把想法或生活素材交給 ChatGPT，一起討論想寫什麼。</p><small>已有方向可繼續討論；已有草稿也可選擇檢查結構。</small><button disabled={disabled || busy} onClick={() => void start('A')}>{onChoose ? '用 A 討論方向' : '從靈感開始寫'}</button></article>
            <article><h3>B｜已有草稿，想繼續修改</h3><p>直接貼上草稿，設定想怎麼修改，也可請 ChatGPT 找研究。</p><small>貼回後先檢查文章與研究，確認後再選用。</small><button disabled={disabled || busy} onClick={() => void start('B')}>{onChoose ? '用 B 整理這篇草稿' : '整理已有草稿'}</button></article>
        </div>
        <p className="studio-writing-next">C 可以把文章改成限動或擴寫；D 從已完稿的文章找新題材。</p>
        <p>複製指令到 ChatGPT，取得回覆後貼回網站，再決定使用哪些內容。</p>
        {error && <p role="alert">{error}</p>}
    </section>;
}
