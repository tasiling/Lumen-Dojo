import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';
import { readVoice, voiceCandidates, saveVoice } from '@/lib/dojo/creativeStudio/voice';
export const dynamic = 'force-dynamic';
const json = (v: unknown) => NextResponse.json(v, { headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: NextRequest) { try {
    requireLearningOwner(req);
    return json({ voice: await readVoice(), candidates: await voiceCandidates() });
}
catch (e) {
    return weavingRouteError(e);
} }
export async function POST(req: NextRequest) { try {
    requireLearningOwner(req);
    return json({ voice: await saveVoice(await req.json()) });
}
catch (e) {
    return weavingRouteError(e);
} }
