import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { productionSources } from '@/lib/dojo/weavingWorkflow/sources';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import type { SourceKind } from '@/lib/dojo/weavingWorkflow/model';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) { try {
    requireLearningOwner(req);
    const kind = req.nextUrl.searchParams.get('kind') ?? 'reading_insight';
    if (!['reading_note', 'reading_insight', 'forage_capture', 'knowledge_claim'].includes(kind))
        return NextResponse.json({ error: '來源種類不正確' }, { status: 400 });
    return NextResponse.json(await productionSources(req.nextUrl.searchParams.get('bookId') ?? undefined).list(kind as SourceKind, req.nextUrl.searchParams.get('cursor')));
}
catch (e) {
    return weavingRouteError(e);
} }
