import { NextRequest, NextResponse } from 'next/server';
import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { createTextVariant, handoffTextVariantToPlurk, listTextVariants, restoreTextVariant, saveTextVariant, setTextVariantStatus, textVariantBundle } from '@/lib/dojo/liaojieText/store';
import { WeavingError } from '@/lib/dojo/weavingWorkflow/model';
import { weavingRouteError } from '@/lib/dojo/weavingWorkflow/http';

export const dynamic = 'force-dynamic';
function mutationResult<T extends { currentVersion: unknown }>(value: T) { return { ...value, version: value.currentVersion }; }
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const publicationId = req.nextUrl.searchParams.get('publicationId') ?? undefined;
    const variantId = req.nextUrl.searchParams.get('variantId');
    const variants = await listTextVariants(publicationId);
    const selected = variantId ? variants.filter(value => value.id === variantId) : variants;
    if (variantId && selected.length !== 1) throw new WeavingError('找不到平台稿件', 404);
    return NextResponse.json({ variants: await Promise.all(selected.map(textVariantBundle)) });
  } catch (error) { return weavingRouteError(error); }
}
export async function POST(req: NextRequest) {
  try { requireLearningOwner(req); return NextResponse.json(mutationResult(await createTextVariant(await req.json())), { status: 201 }); }
  catch (error) { return weavingRouteError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    requireLearningOwner(req); const body = await req.json();
    if (body.action === 'save') return NextResponse.json(mutationResult(await saveTextVariant(body)));
    if (body.action === 'restore') return NextResponse.json(mutationResult(await restoreTextVariant(body)));
    if (body.action === 'status') return NextResponse.json(mutationResult(await setTextVariantStatus(body)));
    if (body.action === 'plurk') return NextResponse.json(mutationResult(await handoffTextVariantToPlurk(body)));
    throw new WeavingError('平台稿件操作不正確');
  } catch (error) { return weavingRouteError(error); }
}
