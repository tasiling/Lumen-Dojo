const scripts = [
  "data", "app", "shuttle-flow", "diamond-original", "diamond", "media-b", "materials",
  "card-box", "card-discussion", "card-use", "work-cards", "card-links", "related-match", "related-cards",
  "related-gpt", "workspace", "production"
];
export function studioDocument(realm: "home" | "liao") {
  const title = realm === "home" ? "織光堂" : "聊解室";
  const base = "/weaving-studio/";
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#fcf5fb"><title>${title}｜行光道場</title>${["style","card-box","studio-layout","production"].map(css=>`<link rel="stylesheet" href="${base}${css}.css">`).join("")}${scripts.map(s=>`<script defer src="${base}${s}.js"></script>`).join("")}</head><body data-home="${realm}"><div id="top"></div><main id="main"><h1>${title}</h1><p role="status">正在讀取作品…</p></main><div id="bottom"></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><div id="notice" role="status" aria-live="polite"></div><aside id="saveNotice" role="status"></aside></body></html>`;
  return new Response(html, {headers: {"Content-Type":"text/html; charset=utf-8", "Cache-Control":"private, no-store"}});
}
