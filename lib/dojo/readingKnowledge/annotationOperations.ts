import 'server-only';
import { mkdir, readFile, open, rename } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { withLearningWriteLock } from '../learningFoundation/fileLock';
import { LearningError, uuidPattern } from '../learningFoundation/model';
import { learningWriteOutcome } from '../learningFoundation/writeOutcome';
import type { Annotation, AnnotationInput } from './annotations';
type Receipt = {
    owner: string;
    id: string;
    digest: string;
    state: 'dispatching' | 'confirmed' | 'rejected' | 'unresolved';
    annotation?: Annotation;
};
function path(owner: string, id: string) {
    if (!uuidPattern.test(id))
        throw new LearningError('操作識別不正確');
    const root = process.env.LEARNING_WRITE_LOCK_DIR;
    if (!root || !isAbsolute(root))
        throw new LearningError('分類寫入未啟用：需要共用持久目錄', 503);
    return join(root, 'reading-knowledge-operations', createHash('sha256').update(`${owner}:${id}`).digest('hex') + '.json');
}
export async function inspectAnnotationOperation(owner: string, id: string): Promise<Receipt | null> {
    try {
        const r = JSON.parse(await readFile(path(owner, id), 'utf8')) as Receipt;
        if (r.owner !== owner || r.id !== id)
            throw new LearningError('操作收據歸屬不符', 409);
        return r;
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
            return null;
        throw e;
    }
}
async function persist(r: Receipt) {
    const file = path(r.owner, r.id);
    await mkdir(join(file, '..'), { recursive: true });
    const tmp = file + '.' + crypto.randomUUID() + '.tmp';
    const f = await open(tmp, 'wx', 0o600);
    try {
        await f.writeFile(JSON.stringify(r));
        await f.sync();
    }
    finally {
        await f.close();
    }
    await rename(tmp, file);
}
export async function runAnnotationOperation(owner: string, id: string, input: AnnotationInput, prepare: () => Promise<() => Promise<Annotation>>): Promise<Annotation> {
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    function check(r: Receipt | null) {
        if (r && r.digest !== digest)
            throw new LearningError('同一操作識別的內容不同', 409);
        if (r?.state === 'confirmed' && r.annotation)
            return r.annotation;
        if (r && ['dispatching', 'unresolved'].includes(r.state))
            throw new LearningError('分類寫入結果未確認，請保留操作識別並核對；不重新建立', 503);
        return null;
    }
    const done = check(await inspectAnnotationOperation(owner, id));
    if (done)
        return done;
    return withLearningWriteLock(async () => {
        const old = check(await inspectAnnotationOperation(owner, id));
        if (old)
            return old;
        const execute = await prepare();
        const receipt: Receipt = { owner, id, digest, state: 'dispatching' };
        await persist(receipt);
        try {
            const annotation = await execute();
            receipt.state = 'confirmed';
            receipt.annotation = annotation;
            await persist(receipt);
            return annotation;
        }
        catch (e) {
            receipt.state = learningWriteOutcome.getStore()?.unresolved ? 'unresolved' : 'rejected';
            await persist(receipt);
            throw e;
        }
    });
}
