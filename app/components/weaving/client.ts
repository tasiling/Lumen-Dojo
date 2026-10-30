'use client';
import {sha256Text,randomID} from '@/lib/dojo/weavingWorkflow/clientIdentity';
export class WorkflowRequestError extends Error {
    constructor(message: string, public status: number,public operationId?:string) { super(message); }
}
const operations = new Map<string, string>();
export async function mutate<T>(url: string, method: string, input: Record<string, unknown>): Promise<T> {
    const key = JSON.stringify([url, method, input]);
    const hash = sha256Text(key);
    const storageKey = `weaving-operation:${hash}`;
    let op = operations.get(hash);
    try {
        op = op ?? sessionStorage.getItem(storageKey) ?? undefined;
    }
    catch { }
    op = op ?? `operation-${randomID()}`;
    operations.set(hash, op);
    try {
        sessionStorage.setItem(storageKey, op);
    }
    catch { }
    let r:Response,value:Record<string,unknown>;
    try{r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,operationId:op})});value=await r.json();}
    catch{throw new WorkflowRequestError('未能確認這次保存結果，輸入仍保留；請以原操作重試或核對收據。',503,op);}
    if (!r.ok)
        throw new WorkflowRequestError(String(value.error ?? `操作失敗（${r.status}）`), r.status,op);
    return value as T;
}
export async function get<T>(url: string): Promise<T> { const r = await fetch(url, { cache: 'no-store' }), v = await r.json(); if (!r.ok)
    throw new WorkflowRequestError(v.error ?? `讀取失敗（${r.status}）`, r.status); return v; }
