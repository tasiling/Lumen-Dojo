import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { learningOwner } from '@/lib/dojo/learningFoundation/store';
import { search, type SearchQuery } from '@/lib/dojo/readingKnowledge/search';
import { productionAdapters } from '@/lib/dojo/readingKnowledge/adapters';
import { encodeCursor, decodeCursor } from '@/lib/dojo/readingKnowledge/cursor';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
    try {
        requireLearningOwner(req);
        const p = req.nextUrl.searchParams;
        let result: unknown;
        if (p.get('mode') === 'books') {
            const cursor = p.get('cursor');
            const internal = cursor ? decodeCursor<string>(cursor, learningOwner, 'book-options') : null;
            const page = await productionAdapters().book.readBatch(internal);
            result = { items: page.items.map(i => ({ id: i.ref.recordId, title: i.title })), cursor: page.next ? encodeCursor(page.next, learningOwner, 'book-options') : null };
        }
        else {
            const query: SearchQuery = { q: p.get('q') ?? '', ...(p.get('kind') ? { kinds: p.getAll('kind') as SearchQuery['kinds'] } : {}), ...(p.get('bookId') ? { bookId: p.get('bookId')! } : {}), ...(p.get('topic') ? { topic: p.get('topic')! } : {}), ...(p.get('learningItemId') ? { learningItemId: p.get('learningItemId')! } : {}) };
            result = await search(query, p.get('cursor'), learningOwner);
        }
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return weavingRouteError(e);
    }
}
