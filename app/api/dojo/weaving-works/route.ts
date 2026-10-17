import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { reconcileOperation,completeWork, reflectWork, readShuttle, createAdditionalWork, patchWork } from "@/lib/dojo/weavingWorkflow/store";
import { weavingRouteError } from "@/lib/dojo/weavingWorkflow/http";
import { NextRequest, NextResponse } from 'next/server';
import { WEAVING_WORK_TITLE_PREFIX } from '@/lib/dojo/formal';
import { normalizeWeavingWork, type WeavingWork } from '@/lib/dojo/weavingShuttle';
import { listJsonRecords } from '@/lib/dojo/notionStore';
import { completionDigest, listCompletions } from '@/lib/dojo/weavingWorkflow/completions';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
    try {
        requireLearningOwner(req);
        const operationId = req.nextUrl.searchParams.get("operationId");
        if (operationId)
            return NextResponse.json(await reconcileOperation(operationId));
        const id = req.nextUrl.searchParams.get("id");
        const shuttleId = req.nextUrl.searchParams.get("shuttleId");
        const rows = await listJsonRecords(WEAVING_WORK_TITLE_PREFIX);
        const works = rows.map((row) => normalizeWeavingWork(row.value, { id: row.id }))
            .filter((work): work is WeavingWork => work !== null && work.status !== "archived");
        if (id) {
            const work = works.find((item) => item.id === id);
            return work ? NextResponse.json({ work, previewDigest: completionDigest(work), completions: await listCompletions(work.id) }) : NextResponse.json({ error: "找不到這件作品" }, { status: 404 });
        }
        return NextResponse.json({ works: shuttleId ? works.filter((work) => work.shuttleId === shuttleId) : works });
    }
    catch (error) {
        return weavingRouteError(error);
    }
}
export async function POST(req: NextRequest) {
    try {
        requireLearningOwner(req);
        const body = await req.json();
        if (body.action === "reflect")
            return NextResponse.json({ ok: true, ...await reflectWork(body) });
        if (body.action === "complete")
            return NextResponse.json({ ok: true, ...await completeWork(body) });
        const work = await createAdditionalWork(body);
        return NextResponse.json({ ok: true, work,shuttle:await readShuttle(work.shuttleId) }, { status: 201 });
    }
    catch (error) {
        return weavingRouteError(error);
    }
}
export async function PATCH(req: NextRequest) {
    try {
        requireLearningOwner(req);
        const work = await patchWork(await req.json());
        return NextResponse.json({ ok: true, work });
    }
    catch (error) {
        return weavingRouteError(error);
    }
}
