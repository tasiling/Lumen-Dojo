'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
type Guard = {
    dirty: () => boolean;
    save: () => Promise<boolean>;
    discard: () => void;
};
type Controller = {
    register: (key: string, guard: Guard) => () => void;
    requestLeave: (action: () => void) => void;
};
const Context = createContext<Controller | null>(null);
export function useLeave() { const c = useContext(Context); if (!c)
    throw new Error('Missing unsaved provider'); return c; }
export default function LeaveProvider({ children }: {
    children: ReactNode;
}) {
    const guards = useRef(new Map<string, Guard>()), pending = useRef<(() => void) | null>(null), dialog = useRef<HTMLDialogElement>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [controller] = useState<Controller>(() => ({ register(key, guard) { guards.current.set(key, guard); return () => { guards.current.delete(key); }; }, requestLeave(action) { if (![...guards.current.values()].some(g => g.dirty()))
            return action(); pending.current = action; setError(''); dialog.current?.showModal(); } }));
    useEffect(() => { const unload = (e: BeforeUnloadEvent) => { if ([...guards.current.values()].some(g => g.dirty())) {
        e.preventDefault();
        e.returnValue = '';
    } }; const links = (e: MouseEvent) => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return; const button = (e.target as Element).closest<HTMLButtonElement>('.top button,.nav button'); if (button && [...guards.current.values()].some(g => g.dirty())) {
        e.preventDefault();
        e.stopPropagation();
        controller.requestLeave(() => button.click());
        return;
    } const a = (e.target as Element).closest('a'); if (!a || a.target === '_blank' || a.hasAttribute('download'))
        return; const url = new URL(a.href); if (url.origin !== location.origin || url.href === location.href)
        return; if ([...guards.current.values()].some(g => g.dirty())) {
        e.preventDefault();
        e.stopPropagation();
        controller.requestLeave(() => { location.href = url.href; });
    } }; window.addEventListener('beforeunload', unload); document.addEventListener('click', links, true); return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', links, true); }; }, [controller]);
    async function leave(save: boolean) { setBusy(true); try {
        for (const g of guards.current.values()) {
            if (!g.dirty())
                continue;
            if (save) {
                if (!await g.save())
                    throw new Error('尚有內容未保存，請回到欄位確認。');
            }
            else
                g.discard();
        }
        if (save && [...guards.current.values()].some(g => g.dirty()))
            throw new Error('保存期間又有新輸入，請再次保存或留在這裡。');
        dialog.current?.close();
        const action = pending.current;
        pending.current = null;
        action?.();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setBusy(false);
    } }
    return <Context.Provider value={controller}>{children}<dialog ref={dialog} className="wf-leave" onCancel={() => { pending.current = null; }} aria-labelledby="leave-title"><h2 id="leave-title">還有未保存的內容</h2><p>選擇保存後離開、放棄這次修改，或留在這裡繼續。</p>{error && <p role="alert">{error}</p>}<div className="wf-actions"><button disabled={busy} onClick={() => { dialog.current?.close(); pending.current = null; }}>留在這裡</button><button disabled={busy} onClick={() => void leave(false)}>放棄修改後離開</button><button className="primary" disabled={busy} onClick={() => void leave(true)}>{busy ? '保存中…' : '保存後離開'}</button></div></dialog></Context.Provider>;
}
