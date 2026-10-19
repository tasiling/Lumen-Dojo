import type { NextRequest } from "next/server";
import { ACCESS_KEY_COOKIE } from "@/lib/access-key";
import { LearningError } from "./model";

function isPublicOrigin(request: NextRequest, origin: string): boolean {
  // Standalone Next.js uses its internal listen hostname in nextUrl. Compare
  // the browser's Origin with the incoming Host and TLS-termination protocol.
  // An arbitrary x-forwarded-host must never expand the accepted host.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto")?.trim()
    ?? request.nextUrl.protocol.slice(0, -1);
  if ((protocol !== "http" && protocol !== "https") || /[\s/\\@,?#]/.test(host)) return false;
  try {
    const submitted = new URL(origin);
    return submitted.origin === origin && origin !== "null"
      && origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

export function requireLearningOwner(request: NextRequest): void {
  const key = process.env.ACCESS_KEY;
  if (!key) throw new LearningError("伺服器未設定存取金鑰", 503);
  if (request.cookies.get(ACCESS_KEY_COOKIE)?.value !== key)
    throw new LearningError("未授權，請先解鎖", 401);
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && !isPublicOrigin(request, origin))
    throw new LearningError("無法確認儲存來源，請重新整理後再試。", 403);
}
