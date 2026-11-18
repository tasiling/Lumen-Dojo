import { test } from "node:test";
import assert from "node:assert/strict";
import { parseThreadsPost, threadsPostUrl } from "../lib/dojo/threadsReader.ts";

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
