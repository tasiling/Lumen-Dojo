import { NextRequest, NextResponse } from "next/server";
import { ACCESS_KEY_COOKIE } from "@/lib/access-key";

// 委派書 v1.1 新增需求:單一存取金鑰保護整個 App(不是登入系統,無多用戶/無帳號)。
// 首次進入輸入一次,存於瀏覽器 cookie;之後每次請求(頁面+寫入端點)都驗證。
// 沒有金鑰或金鑰不符,一律拒絕——不論頁面或 API。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|unlock|api/unlock|api/integrations/line/webhook|api/integrations/context-room/images).*)"],
};

export default function proxy(request: NextRequest) {
  const accessKey = process.env.ACCESS_KEY;

  // 未設定 ACCESS_KEY 時一律拒絕,避免忘記設定就對外公開。
  if (!accessKey) {
    return new Response("伺服器未設定 ACCESS_KEY,拒絕所有請求。", { status: 503 });
  }

  const provided = request.cookies.get(ACCESS_KEY_COOKIE)?.value;
  if (provided === accessKey) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "未授權,請先於 /unlock 輸入存取金鑰" },
      { status: 401 }
    );
  }

  const url = new URL("/unlock", request.url);
  url.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}
