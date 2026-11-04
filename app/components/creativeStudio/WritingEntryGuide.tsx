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
        <p>依你手上已有的內容選擇起點；A、B、C、D 可各自使用。</p>
        <div className="studio-writing-choices">
            <article><h3>A｜靈感與方向探索</h3><p>只有觀察、感受、問題、逐字稿或零散想法，也可以開始。和 AI 釐清想說什麼、保留多個方向，按需要試寫。</p><small>已有方向可繼續討論；已有草稿也可選擇檢查結構。</small><button disabled={disabled || busy} onClick={() => void start('A')}>{onChoose ? '本件切到 A：探索靈感' : '帶靈感進 A'}</button></article>
            <article><h3>B｜草稿整理與研究</h3><p>已有草稿就直接交給 B，依你的意思整理主文。修改幅度、框架、研究與例子都由你選擇，不必先完成 A。</p><small>AI 完整回覆、研究與候選主文分開；確認採用才更新正文。</small><button disabled={disabled || busy} onClick={() => void start('B')}>{onChoose ? '本件切到 B：整理草稿' : '帶草稿進 B'}</button></article>
        </div>
        <p className="studio-writing-next">主稿給 C：轉製限動或擴寫。完稿給 D：從固定完成版本延伸題材，尚未發布也可使用。</p>
        <p>操作方式：複製本輪指令到 ChatGPT → 貼回完整回覆 → 確認整理與採用。本人回答另外保存。</p>
        {error && <p role="alert">{error}</p>}
    </section>;
}
