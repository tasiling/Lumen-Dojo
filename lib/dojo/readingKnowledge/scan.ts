import 'server-only';
import { productionAdapters, type SourceAdapter } from './adapters';
import { encodeCursor, decodeCursor } from './cursor';
import type { ContentKind, ContentItem } from './model';
export type ScanResult = {
    items: ContentItem[];
    cursor: string | null;
    complete: boolean;
    warnings: string[];
    sourceStates: Record<string, 'pending' | 'complete' | 'failed'>;
};
type ScanState = {
    positions: Record<string, string | null>;
    done: string[];
};
export function scanner(adapters: Record<ContentKind, SourceAdapter>) {
    return async (kinds: ContentKind[], cursor: string | null, query: string, owner: string): Promise<ScanResult> => {
        const s: ScanState = cursor ? decodeCursor(cursor, owner, query) : { positions: {}, done: [] };
        const items: ContentItem[] = [];
        const warnings: string[] = [];
        const sourceStates: ScanResult['sourceStates'] = {};
        for (const kind of kinds) {
            if (s.done.includes(kind)) {
                sourceStates[kind] = 'complete';
                continue;
            }
            try {
                const page = await adapters[kind].readBatch(s.positions[kind] ?? null);
                items.push(...page.items);
                s.positions[kind] = page.next;
                if (page.complete)
                    s.done.push(kind);
                sourceStates[kind] = page.complete ? 'complete' : 'pending';
            }
            catch {
                sourceStates[kind] = 'failed';
                warnings.push(`${kind} 讀取未完成，可繼續載入重試`);
            }
        }
        const complete = kinds.every(k => s.done.includes(k));
        return { items, complete, warnings, sourceStates, cursor: complete ? null : encodeCursor(s, owner, query) };
    };
}
export const scanPage = (kinds: ContentKind[], cursor: string | null, query: string, owner: string) => scanner(productionAdapters())(kinds, cursor, query, owner);
