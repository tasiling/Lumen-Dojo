import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, open, rename } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { withLearningWriteLock } from '../learningFoundation/fileLock';
import { learningWriteOutcome } from '../learningFoundation/writeOutcome';
import { WeavingError } from './model';
export type OperationKind = 'create_pair' | 'create_work' | 'migrate' | 'reflect' | 'complete' | 'handoff' | 'patch' | 'archive' | 'proposal_scan' | 'proposal_accept';
export type EntityRef = {
    id: string;
    revision?: number;
};
export type OperationReceipt = {
    schemaVersion: 1;
    owner: string;
    operationId: string;
    kind: OperationKind;
    inputDigest: string;
    createdAt: string;
    updatedAt: string;
    steps: Record<string, 'dispatching' | 'confirmed' | 'rejected' | 'unresolved'>;
    result: Record<string, EntityRef>;
    state: 'pending' | 'confirmed' | 'rejected' | 'unresolved';
    error?: string;
};
export type OperationStep = {
    key: string;
    findConfirmed: (receipt: OperationReceipt) => Promise<EntityRef | null>;
    execute: (receipt: OperationReceipt) => Promise<EntityRef>;
};
function canonical(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
}
export function operationDigest(input: unknown): string { return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex'); }
export function operationKey(owner: string, id: string): string { return operationDigest([owner, id]); }
function receiptPath(owner: string, id: string): string {
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id))
        throw new WeavingError('操作識別不正確');
    const dir = process.env.LEARNING_WRITE_LOCK_DIR;
    if (!dir || !isAbsolute(dir))
        throw new WeavingError('創作寫入尚未啟用：缺少持久保存目錄', 503);
    return join(dir, 'weaving-operations', `${operationKey(owner, id)}.json`);
}
export async function inspectWeavingOperation(owner: string, id: string): Promise<OperationReceipt | null> {
    const path = receiptPath(owner, id);
    let raw: string;
    try {
        raw = await readFile(path, 'utf8');
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
            return null;
        throw e;
    }
    const value = JSON.parse(raw) as OperationReceipt;
    if (value.schemaVersion !== 1 || value.owner !== owner || value.operationId !== id)
        throw new WeavingError('操作收據身分不符', 409);
    return value;
}
async function persist(receipt: OperationReceipt): Promise<void> {
    const path = receiptPath(receipt.owner, receipt.operationId), dir = join(process.env.LEARNING_WRITE_LOCK_DIR!, 'weaving-operations');
    await mkdir(dir, { recursive: true });
    const tmp = `${path}.${crypto.randomUUID()}.tmp`;
    const file = await open(tmp, 'wx', 0o600);
    try {
        await file.writeFile(JSON.stringify(receipt));
        await file.sync();
    }
    finally {
        await file.close();
    }
    await rename(tmp, path);
    const parent = await open(dir, 'r');
    try {
        await parent.sync();
    }
    finally {
        await parent.close();
    }
}
export async function runWeavingOperation(owner: string, id: string, kind: OperationKind, input: unknown, steps: OperationStep[]): Promise<OperationReceipt> {
    const digest = operationDigest(input), old = await inspectWeavingOperation(owner, id);
    if (old && (old.kind !== kind || old.inputDigest !== digest))
        throw new WeavingError('同一操作識別的內容不同，請保留原操作或重新確認新內容', 409);
    if (old?.state === 'confirmed')
        return old;
    return withLearningWriteLock(async () => {
        const previous = await inspectWeavingOperation(owner, id);
        if (previous && (previous.kind !== kind || previous.inputDigest !== digest))
            throw new WeavingError('操作內容衝突', 409);
        if (previous?.state === 'confirmed')
            return previous;
        const now = new Date().toISOString();
        const receipt: OperationReceipt = previous ?? { schemaVersion: 1, owner, operationId: id, kind, inputDigest: digest, createdAt: now, updatedAt: now, steps: {}, result: {}, state: 'pending' };
        await persist(receipt);
        for (const step of steps) {
            if (receipt.steps[step.key] === 'confirmed')
                continue;
            const found = await step.findConfirmed(receipt);
            if (found) {
                receipt.result[step.key] = found;
                receipt.steps[step.key] = 'confirmed';
                await persist(receipt);
                continue;
            }
            if (['dispatching', 'unresolved'].includes(receipt.steps[step.key]))
                throw new WeavingError('這一步曾派送但結果未確認，請先唯讀核對；不重新建立副本', 409);
            receipt.steps[step.key] = 'dispatching';
            receipt.state = 'pending';
            await persist(receipt);
            const outcome = learningWriteOutcome.getStore()!;
            const sent = outcome.sent, rejected = outcome.rejected;
            try {
                const result = await step.execute(receipt);
                receipt.result[step.key] = result;
                receipt.steps[step.key] = 'confirmed';
                receipt.updatedAt = new Date().toISOString();
                await persist(receipt);
            }
            catch (e) {
                const unknown = outcome.sent - sent !== outcome.rejected - rejected;
                receipt.steps[step.key] = unknown ? 'unresolved' : 'rejected';
                receipt.state = unknown ? 'unresolved' : 'rejected';
                receipt.error = e instanceof Error ? e.message : String(e);
                await persist(receipt);
                throw e;
            }
        }
        receipt.state = 'confirmed';
        delete receipt.error;
        receipt.updatedAt = new Date().toISOString();
        await persist(receipt);
        return receipt;
    });
}
