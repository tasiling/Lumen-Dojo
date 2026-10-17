'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rebaseDraft,createDraft, editDraft, beginSave, acceptSave, discardDraft, dirtyDraft, type DraftEntity, type SaveTicket } from '@/lib/dojo/weavingWorkflow/draft';
import { useLeave } from './LeaveDialog';
export function useWeavingDraft<T extends DraftEntity>(entity: T, persist: (ticket: SaveTicket<T>) => Promise<T>) {
    const [state, setState] = useState(() => {
        const initial = createDraft(entity);
        if (typeof window === 'undefined')
            return initial;
        try {
            const raw = sessionStorage.getItem(`weaving-buffer:${entity.id}`);
            if (raw) {
                const cached = JSON.parse(raw) as typeof initial;
                if (cached.entityId === entity.id && cached.baseline?.id === entity.id && cached.value?.id === entity.id && dirtyDraft(cached))
                    return { ...cached, status: 'idle' as const, error: cached.baseline.revision !== entity.revision ? '保存版本已變更，保留未存輸入供比較' : null };
            }
        }
        catch { }
        return initial;
    });
    const ref = useRef(state), mounted = useRef(false), busy = useRef(false), persistRef = useRef(persist);
    useEffect(() => { persistRef.current = persist; }, [persist]);
    const leave = useLeave();
    const set = useCallback((next: typeof state) => { ref.current = next; try {
        if (dirtyDraft(next))
            sessionStorage.setItem(`weaving-buffer:${next.entityId}`, JSON.stringify(next));
        else
            sessionStorage.removeItem(`weaving-buffer:${next.entityId}`);
    }
    catch { } if (mounted.current)
        setState(next); }, []);
    function edit(value: T) { set(editDraft(ref.current, value)); }
    async function save() { if (busy.current)
        return false; if (!dirtyDraft(ref.current))
        return true; busy.current = true; const ticket = beginSave(ref.current); set({ ...ref.current, status: 'saving', error: null }); try {
        const server = await persistRef.current(ticket);
        if (mounted.current)
            set(acceptSave(ref.current, ticket, server));
        return !mounted.current || !dirtyDraft(ref.current);
    }
    catch (e) {
        if (mounted.current)
            set({ ...ref.current, status: 'error', error: e instanceof Error ? e.message : String(e),errorOperationId:(e as {operationId?:string})?.operationId });
        return false;
    }
    finally {
        busy.current = false;
    } }
    function discard() { set(discardDraft(ref.current)); }
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { const timer = setTimeout(() => { if (entity.revision > ref.current.baseline.revision && !dirtyDraft(ref.current) && !busy.current)
        set(createDraft(entity)); }, 0); return () => clearTimeout(timer); }, [entity, set]);
    const actions = useRef({ save, discard });
    useEffect(() => { actions.current = { save, discard }; });
    useEffect(() => leave.register(entity.id, { dirty: () => dirtyDraft(ref.current) || busy.current, save: () => actions.current.save(), discard: () => actions.current.discard() }), [leave, entity.id]);
    function reset(value: T) { set(createDraft(value)); }
    function applyServer(ticket: SaveTicket<T>, value: T) { set(acceptSave(ref.current, ticket, value)); }
    function reapply(latest:T){set(rebaseDraft(ref.current,latest));}
    return { reapply,applyServer, current: () => ref.current, reset, state, value: state.value, edit, save, discard, dirty: dirtyDraft(state), busy: state.status === 'saving' };
}
