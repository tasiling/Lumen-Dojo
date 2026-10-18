'use client';
export class WorkflowRequestError extends Error {
    constructor(message: string, public status: number,public operationId?:string) { super(message); }
}
const operations = new Map<string, string>();
export async function mutate<T>(url: string, method: string, input: Record<string, unknown>): Promise<T> {
    const key = JSON.stringify([url, method, input]);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))).map(n => n.toString(16).padStart(2, '0')).join('');
    const storageKey = `weaving-operation:${hash}`;
    let op = operations.get(hash);
    try {
        op = op ?? sessionStorage.getItem(storageKey) ?? undefined;
    }
    catch { }
    op = op ?? `operation-${crypto.randomUUID()}`;
    operations.set(hash, op);
    try {
        sessionStorage.setItem(storageKey, op);
    }
    catch { }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, operationId: op }) });
    const value = await r.json();
    if (!r.ok)
        throw new WorkflowRequestError(value.error ?? `操作失敗（${r.status}）`, r.status,op);
    return value;
}
export async function get<T>(url: string): Promise<T> { const r = await fetch(url, { cache: 'no-store' }), v = await r.json(); if (!r.ok)
    throw new WorkflowRequestError(v.error ?? `讀取失敗（${r.status}）`, r.status); return v; }
