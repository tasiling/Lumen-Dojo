import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { LIAOJIE_PROJECT_TITLE_PREFIX } from '@/lib/dojo/formal';
import { normalizeLiaojieProject } from '@/lib/dojo/liaojiePublication';
import { listJsonRecords } from '@/lib/dojo/notionStore';
import { handoffWork, patchPublication } from '@/lib/dojo/weavingWorkflow/store';
import { WeavingError } from '@/lib/dojo/weavingWorkflow/model';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
export const dynamic = 'force-dynamic';
async function projects() { return (await listJsonRecords(LIAOJIE_PROJECT_TITLE_PREFIX)).flatMap(row => { const p = normalizeLiaojieProject(row.value, { id: row.id }); return p && p.status !== 'archived' ? [p] : []; }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function GET(req: NextRequest) { try {
    requireLearningOwner(req);
    const rows = await projects(), id = req.nextUrl.searchParams.get('id');
    if (!id)
        return NextResponse.json({ projects: rows });
    const project = rows.find(p => p.id === id);
    return project ? NextResponse.json({ project }) : NextResponse.json({ error: '找不到聊解企劃' }, { status: 404 });
}
catch (e) {
    return weavingRouteError(e);
} }
export async function POST(req: NextRequest) { try {
    requireLearningOwner(req);
    const body = await req.json();
    if (body.weavingProjectId) {
        const existing = (await projects()).find(p => p.weavingProjectId === body.weavingProjectId);
        if (existing)
            return NextResponse.json({ ok: true, project: existing, duplicate: true });
        throw new WeavingError('請先明確升級舊版織光案，再確認成品並交接', 409);
    }
    return NextResponse.json({ ok: true, project: await handoffWork(body) }, { status: 201 });
}
catch (e) {
    return weavingRouteError(e);
} }
export async function PATCH(req: NextRequest) { try {
    requireLearningOwner(req);
    return NextResponse.json({ ok: true, project: await patchPublication(await req.json()) });
}
catch (e) {
    return weavingRouteError(e);
} }
export async function DELETE(req: NextRequest) { try {
    requireLearningOwner(req);
    const body = await req.json();
    await patchPublication({ ...body, project: { status: 'archived' } });
    return NextResponse.json({ ok: true });
}
catch (e) {
    return weavingRouteError(e);
} }
