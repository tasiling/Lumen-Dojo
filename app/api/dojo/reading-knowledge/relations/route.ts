import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { learningOwner } from '@/lib/dojo/learningFoundation/store';
import { parseRef } from '@/lib/dojo/readingKnowledge/model';
import { relations } from '@/lib/dojo/readingKnowledge/relations';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) { try {
    requireLearningOwner(req);
    const q = req.nextUrl.searchParams;
    const ref = parseRef(JSON.parse(q.get('ref') ?? 'null'));
    return NextResponse.json(await relations(ref, q.get('cursor'), learningOwner), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return weavingRouteError(e);
} }
