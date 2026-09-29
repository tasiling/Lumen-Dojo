import type { NextRequest } from "next/server";
import { ACCESS_KEY_COOKIE } from "@/lib/access-key";
import { LearningError } from "./model";
export function requireLearningOwner(request: NextRequest): void {
  const key = process.env.ACCESS_KEY;
  if (!key) throw new LearningError("伺服器未設定存取金鑰", 503);
  if (request.cookies.get(ACCESS_KEY_COOKIE)?.value !== key)
    throw new LearningError("未授權，請先解鎖", 401);
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== request.nextUrl.origin)
    throw new LearningError("拒絕跨來源寫入", 403);
}
