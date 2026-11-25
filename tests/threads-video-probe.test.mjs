import assert from "node:assert/strict";
import test from "node:test";
import { findThreadsVideo } from "../lib/dojo/threadsVideoProbe.ts";

test("finds video addresses in video tags, og fields, video_versions and plain mp4 links", () => {
  const html = [
    '<video class="x" src="https://scontent.cdninstagram.com/v/t50/clip.mp4?oe=6745&amp;_nc=1" playsinline></video>',
    '<meta property="og:video" content="https://video.fbcdn.net/og.mp4">',
    '<script>{"video_versions":[{"type":101,"url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/versions.mp4?a=1\\u0026b=2"}]}</script>',
  ].join("\n");
  const found = findThreadsVideo(html);
  assert.deepEqual(found.kinds.sort(), ["mp4_link", "og_video", "video_tag", "video_versions"]);
  assert.ok(found.urls.includes("https://scontent.cdninstagram.com/v/t50/clip.mp4?oe=6745&_nc=1"));
  assert.ok(found.urls.includes("https://scontent.cdninstagram.com/v/versions.mp4?a=1&b=2"));
  assert.ok(found.urls.includes("https://video.fbcdn.net/og.mp4"));
  assert.equal(new Set(found.urls).size, found.urls.length);
});

test("a text-only page has no video", () => {
  assert.deepEqual(findThreadsVideo('<div>只有文字</div><img src="https://scontent.cdninstagram.com/p.jpg">'), { kinds: [], urls: [] });
});
