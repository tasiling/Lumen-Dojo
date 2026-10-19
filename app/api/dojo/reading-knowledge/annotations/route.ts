import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { learningOwner } from '@/lib/dojo/learningFoundation/store';
import { annotationStore, listAnnotations, listSubjects } from '@/lib/dojo/readingKnowledge/annotationStore';
import { inspectAnnotationOperation } from '@/lib/dojo/readingKnowledge/annotationOperations';
import { classificationFor } from '@/lib/dojo/readingKnowledge/annotations';
import { parseRef } from '@/lib/dojo/readingKnowledge/model';
import { resolve } from '@/lib/dojo/readingKnowledge/adapters';
import { LearningError } from '@/lib/dojo/learningFoundation/model';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
    try {
        requireLearningOwner(req);
        const p = req.nextUrl.searchParams;
        if (p.get('operationId'))
            return NextResponse.json({ receipt: await inspectAnnotationOperation(learningOwner, p.get('operationId')!) }, { headers: { 'Cache-Control': 'no-store' } });
        const subjects = await listSubjects();
        if (p.get('mode') === 'subjects')
            return NextResponse.json({ subjects }, { headers: { 'Cache-Control': 'no-store' } });
        const ref = parseRef(JSON.parse(p.get('ref') ?? 'null'));
        const item = await resolve(ref);
        if (!item)
            throw new LearningError('來源已不可用', 404);
        const annotations = await listAnnotations();
        return NextResponse.json({ annotation: await annotationStore.read(ref), subjects, effective: classificationFor(item, annotations, learningOwner) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return weavingRouteError(e);
    }
}
export async function POST(req: NextRequest) { try {
    requireLearningOwner(req);
    const annotation = await annotationStore.save(await req.json());
    return NextResponse.json({ annotation }, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return weavingRouteError(e);
} }
