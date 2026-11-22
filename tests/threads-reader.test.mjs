import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loader } from "../scripts/weaving-test-harness.mjs";

const load = loader();
const { parseThreadsPost, threadsPostUrl, readThreadsPost, readThreadsPostDetailed, threadsFailureLine, threadsReplyStatus } = load("lib/dojo/threadsReader.ts");
const { threadAddress, extractThreadBody, fullCaption, threadCanonical, sourceMeta } = load("lib/dojo/threadsPage.ts");
// Synthetic pages: post-page-ld-json.html comes from simulations/yecai-inbox-v7.zip (fixtures/saved-thread.html);
// embed-reply.html follows the structure threads.com/t/<code>/embed served in 2026-11 (the replied-to post first, then
// the target post, paragraphs as line breaks inside one text node). The text in every fixture is made up.
const fixture = name => readFileSync(new URL("./fixtures/threads/" + name, import.meta.url), "utf8");

const share = "https://www.threads.com/share/BAUARI8pa1";
const permalink = "https://www.threads.com/@sample/post/Ab-12";
const body = "Markdown Content:\n# [Thread](" + permalink + ")\n\n[2d](" + permalink + ")\n\n第一段\n\n第二段\n\nTranslate\n\n另一人的回覆";
test("keeps the author's paragraphs and excludes replies", () => {
  assert.deepEqual(parseThreadsPost(body, share), { canonicalUrl: permalink, text: "第一段\n\n第二段", partial: false });
});
test("invalid share redirect and login pages never supply a post even with suggested threads", () => {
  assert.equal(parseThreadsPost("Final URL: https://www.threads.com/?error=invalid_post\n" + body, share), null);
  assert.equal(parseThreadsPost("Title: Threads • Log in\n" + body, share), null);
});
test("rejects other hosts, profiles, and an unrelated post", () => {
  assert.equal(threadsPostUrl("https://threads.com.example.com/share/ID"), null);
  assert.equal(threadsPostUrl("https://www.threads.net/@sample"), null);
  assert.equal(parseThreadsPost(body, permalink + "Z"), null);
});

// ---- Official-page parser ----
const replyAddress = { url: "https://www.threads.com/@reply_fixture/post/DemoReply01", author: "reply_fixture", code: "DemoReply01" };
const replyText = "我照這個方法試了三天。\n第一天漏了核對時間 & 地點，第二天補上✅\n\n結果交班快了很多。";
const postAddress = { url: "https://www.threads.com/@example_fixture/post/DemoQA900", author: "example_fixture", code: "DemoQA900" };
const fullText = "今天交班時，我在紙上標出尚未確認的時間。\n接班的人核對時刻，在空格寫上回答。";

test("addresses: post, share and /t/ links on threads.com or threads.net only", () => {
  assert.deepEqual(threadAddress("https://threads.net/@reply_fixture/post/DemoReply01/?igshid=1"), replyAddress);
  assert.deepEqual(threadAddress("https://www.threads.com/share/BAfsihy6ZF/"), { url: "https://www.threads.com/share/BAfsihy6ZF", code: "", author: "" });
  assert.equal(threadAddress("https://www.threads.com/t/DemoReply01").code, "DemoReply01");
  for (const bad of ["https://threads.com.example.com/t/DemoReply01", "https://user@www.threads.com/t/DemoReply01", "https://www.threads.com:8443/t/DemoReply01", "https://www.threads.com/@a", "ftp://www.threads.com/t/DemoReply01", "nope"])
    assert.equal(threadAddress(bad), null, bad);
});
test("a reply's embed page yields the reply itself, attributed to its author", () => {
  const point = { url: "https://www.threads.com/t/DemoReply01", author: "", code: "DemoReply01" };
  assert.deepEqual(extractThreadBody(fixture("embed-reply.html"), point), { address: replyAddress, text: replyText });
});
test("paragraph breaks of the post survive: single line breaks, blank lines, CRLF and <br>", async () => {
  const text = extractThreadBody(fixture("embed-reply.html"), replyAddress).text;
  assert.deepEqual(text.split("\n"), ["我照這個方法試了三天。", "第一天漏了核對時間 & 地點，第二天補上✅", "", "結果交班快了很多。"]);
  assert.ok(!text.includes("被回覆的那則貼文"), "the replied-to post is not part of the text");
  const body = lines => "<a href=\"https://www.threads.com/@reply_fixture/post/DemoReply01\"></a><span class=\"TextContentContainerFull\"><span class=\"BodyTextContainer\"><span>" + lines + "</span></span></span>";
  assert.equal(extractThreadBody(body("第一段<br>第二段<br /><br/>第三段"), replyAddress).text, "第一段\n第二段\n\n第三段");
  const [read] = await withFetch({ "https://www.threads.com/t/DemoReply01/embed/": html(body("第一段\r\n第二段\r\n\r\n\r\n\r\n第三段\u2028第四段")) },
    () => readThreadsPostDetailed(replyAddress.url));
  assert.equal(read.post.text, "第一段\n第二段\n\n第三段\n第四段");
  // The post page's structured caption keeps them as well.
  assert.equal(fullCaption(fixture("post-page-ld-json.html"), postAddress).split("\n").length, 2);
});
test("an embed for another post, a clipped embed, or one showing two bodies gives no text", () => {
  const other = { url: "https://www.threads.com/t/Other99", author: "", code: "Other99" };
  assert.equal(extractThreadBody(fixture("embed-reply.html"), other).address, null);
  assert.deepEqual(extractThreadBody(fixture("embed-clipped.html"), postAddress), { address: postAddress, text: "" });
  const twice = fixture("embed-reply.html").replace("<div class=\"BarcelonaBigLogoContainer\">", "<span class=\"TextContentContainerFull\"><span class=\"BodyTextContainer\">另一則貼文</span></span><div class=\"BarcelonaBigLogoContainer\">");
  assert.notEqual(twice, fixture("embed-reply.html"));
  assert.equal(extractThreadBody(twice, replyAddress).text, "");
});
test("post page: canonical address, structured caption, og fields", () => {
  const page = fixture("post-page-ld-json.html");
  assert.deepEqual(threadCanonical(page), postAddress);
  assert.equal(fullCaption(page, postAddress), fullText);
  assert.equal(fullCaption(page, replyAddress), "");
  const data = JSON.stringify({ items: [{ code: "DemoQA900", user: { username: "Example_Fixture" }, caption: { text: fullText } },
    { code: "DemoQA900", user: { username: "someone_else" }, caption: { text: "別人的回覆" } }] });
  assert.equal(fullCaption("<script type=\"application/json\">" + data + "</script>", postAddress), fullText);
  assert.equal(fullCaption("<script type=\"application/json\">" + data.replace("\"text\"", "\"is_truncated\":true,\"text\"") + "</script>", postAddress), "");
  assert.equal(sourceMeta(fixture("post-page-og-only.html"), "og:url"), postAddress.url);
});

// ---- Reading flow, with every outbound request answered by the test ----
// Each route is a factory: a cloned Response's body cannot be cancelled on its own.
const html = text => () => new Response(text, { headers: { "content-type": "text/html; charset=utf-8" } });
const redirect = to => () => new Response(null, { status: 302, headers: { location: to } });
const refused = () => new Response("login", { status: 403, headers: { "content-type": "text/html" } });
async function withFetch(routes, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.ok(url.startsWith("https://r.jina.ai/") ? init.redirect === "error" : init.redirect === "manual", "redirects are never followed blindly");
    const key = Object.keys(routes).find(k => url.startsWith(k));
    if (!key) return new Response("missing", { status: 404, headers: { "content-type": "text/html" } });
    const answer = routes[key];
    if (answer instanceof Error) throw answer;
    return answer();
  };
  try { return [await run(), calls]; } finally { globalThis.fetch = original; }
}
const replyShare = "https://www.threads.com/share/BAfsihy6ZF/";
const replyEmbed = "https://www.threads.com/t/DemoReply01/embed/";
const jina = "https://r.jina.ai/";
const jinaReply = "Markdown Content:\n# [Thread](" + replyAddress.url + ")\n\n[2d](" + replyAddress.url + ")\n\n備援讀到的文字\n\nTranslate";

test("a share link to a reply is read from the official embed, without the fallback", async () => {
  const [read, calls] = await withFetch({
    "https://www.threads.com/share/BAfsihy6ZF/": redirect("https://www.threads.com/@reply_fixture/post/DemoReply01?xmt=1"),
    [replyEmbed]: html(fixture("embed-reply.html")),
  }, () => readThreadsPostDetailed(replyShare));
  assert.deepEqual(read, { post: { canonicalUrl: replyAddress.url, text: replyText, partial: false }, invalid: false, failure: null, fallbackFailed: false, viaFallback: false });
  assert.deepEqual(calls.map(u => new URL(u).pathname), ["/share/BAfsihy6ZF/", "/t/DemoReply01/embed/"]);
});
test("a share page that answers 200 is resolved through its og:url; readThreadsPost keeps its old result shape", async () => {
  const [post] = await withFetch({
    "https://www.threads.com/share/BAfsihy6ZF/": html("<meta property=\"og:url\" content=\"" + replyAddress.url + "\">"),
    [replyEmbed]: html(fixture("embed-reply.html")),
  }, () => readThreadsPost(replyShare));
  assert.deepEqual(post, { canonicalUrl: replyAddress.url, text: replyText, partial: false });
});
test("a clipped embed is completed from the post page's structured caption", async () => {
  const [read] = await withFetch({
    "https://www.threads.com/t/DemoQA900/embed/": html(fixture("embed-clipped.html")),
    [postAddress.url]: html(fixture("post-page-ld-json.html")),
  }, () => readThreadsPostDetailed(postAddress.url));
  assert.deepEqual(read.post, { canonicalUrl: postAddress.url, text: fullText, partial: false });
});
test("only an og preview: fallback is tried, then the preview is kept as partial", async () => {
  const [read, calls] = await withFetch({
    "https://www.threads.com/t/DemoQA900/embed/": html(fixture("embed-clipped.html")),
    [postAddress.url]: html(fixture("post-page-og-only.html")),
  }, () => readThreadsPostDetailed(postAddress.url));
  assert.equal(read.post.partial, true);
  assert.match(read.post.text, /^今天交班時/);
  assert.equal(read.failure.step, "verify");
  assert.equal(read.fallbackFailed, true);
  assert.ok(calls.at(-1).startsWith(jina));
});
test("embed refused: r.jina.ai remains the fallback", async () => {
  const [read] = await withFetch({
    "https://www.threads.com/share/BAfsihy6ZF/": redirect(replyAddress.url),
    [replyEmbed]: refused,
    [jina]: () => new Response(jinaReply),
  }, () => readThreadsPostDetailed(replyShare));
  assert.equal(read.post.text, "備援讀到的文字");
  assert.deepEqual([read.failure.step, read.fallbackFailed, read.viaFallback], ["embed", false, true]);
  assert.match(threadsReplyStatus({ post: read.post, failed: false, invalid: false, repeated: false, reason: "", viaFallback: true }), /備援不保留段落換行/);
});
test("every source failing reports the step that stopped", async () => {
  const [read] = await withFetch({
    "https://www.threads.com/share/BAfsihy6ZF/": redirect(replyAddress.url),
    [replyEmbed]: refused,
  }, () => readThreadsPostDetailed(replyShare));
  assert.equal(read.post, null);
  assert.equal(threadsFailureLine(read), "停在「讀取官方嵌入頁」：Threads 回傳 HTTP 403，沒有提供公開頁面。備援轉讀也沒有取得主文。");
  const [timeout] = await withFetch({ "https://www.threads.com/share/": Object.assign(new Error("x"), { name: "TimeoutError" }) }, () => readThreadsPostDetailed(replyShare));
  assert.match(threadsFailureLine(timeout), /^停在「解析分享連結」：Threads 回應逾時。/);
  const [loop] = await withFetch({ "https://www.threads.com/share/": redirect("https://evil.example/@a/post/DemoReply01") }, () => readThreadsPostDetailed(replyShare));
  assert.equal(loop.failure.reason, "分享連結沒有導向任何貼文。");
});
test("an invalid-post redirect is reported as invalid", async () => {
  const [[read, post]] = await withFetch({ "https://www.threads.com/share/": redirect("https://www.threads.com/?error=invalid_post") },
    async () => [await readThreadsPostDetailed(replyShare), await readThreadsPost(replyShare)]);
  assert.deepEqual([read.invalid, read.failure.step, post], [true, "resolve", "invalid_post"]);
});

test("LINE status: first failure offers a retry, a repeated one suggests a screenshot or pasted text", () => {
  const reason = "停在「讀取官方嵌入頁」：Threads 回應逾時。備援轉讀也沒有取得主文。";
  const base = { post: null, failed: true, invalid: false, reason };
  assert.equal(threadsReplyStatus({ ...base, repeated: false }), "網址已存，原文待補。\n" + reason + "\n可點「重新擷取原文」再試一次。");
  const again = threadsReplyStatus({ ...base, repeated: true });
  assert.match(again, /已連續讀取失敗/);
  assert.match(again, /補截圖/);
  assert.match(again, /把貼文文字貼進摘錄/);
  assert.doesNotMatch(again, /再試一次/);
  assert.match(threadsReplyStatus({ ...base, invalid: true, repeated: true }), /從原貼文重新複製連結/);
  assert.equal(threadsReplyStatus({ post: { partial: false }, failed: false, invalid: false, repeated: false, reason: "" }), "已取得貼文原文。");
  assert.equal(threadsReplyStatus({ post: { partial: false }, failed: true, invalid: false, repeated: true, reason }), "本次未能更新，已保留之前的文字。\n" + reason);
});
