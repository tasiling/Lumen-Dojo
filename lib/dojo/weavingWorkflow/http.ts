import { NextResponse } from 'next/server';
export function weavingRouteError(error: unknown) {
    const code = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: [400, 401, 403, 404, 409, 413, 503].includes(code) ? code : 500 });
}
