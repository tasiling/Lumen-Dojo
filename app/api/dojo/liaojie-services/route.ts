import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import { createService, listServices, readService, saveService, syncServiceCalendar, serviceWork, privateDelivery } from '@/lib/dojo/creativeStudio/services';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (v: unknown) => NextResponse.json(v, { headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: NextRequest) { try {
    requireLearningOwner(req);
    const id = req.nextUrl.searchParams.get('id');
    return json(id ? { service: await readService(id) } : { services: await listServices() });
}
catch (e) {
    return weavingRouteError(e);
} }
export async function POST(req: NextRequest) { try {
    requireLearningOwner(req);
    const b = await req.json();
    switch (b.action) {
        case 'create': return json({ service: await createService(b) });
        case 'save': return json({ service: await saveService(b) });
        case 'calendar': return json({ service: await syncServiceCalendar(b) });
        case 'work': return json({ work: await serviceWork(b) });
        case 'delivery': return json({ text: privateDelivery(await readService(b.id), b.personId) });
        default: return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
}
catch (e) {
    return weavingRouteError(e);
} }
