import { test } from "node:test";
import assert from "node:assert/strict";
import { imagesFromEmbed, imagesFromPostPage, pickThreadsImages, threadsImageHost, THREADS_IMAGE_LIMIT } from "../lib/dojo/threadsImages.ts";

const cdn = (name, size = "1080x1350") => `https://scontent-syd2-1.cdninstagram.com/v/t51.2885-15/${name}.jpg?stp=dst-jpg_e35_s${size}&oe=6930A1B2`;

const node = (code, username, extra) => ({ code, user: { username }, caption: { text: "內文" }, ...extra });
const picture = (name) => ({ media_type: 1, image_versions2: { candidates: [
  { url: cdn(name, "320x400"), width: 320, height: 400 }, { url: cdn(name), width: 1080, height: 1350 },
] } });

function postPage(nodes) {
  // Threads nests the post data as a JSON string inside the page's JSON, so both layers are exercised.
  const inner = JSON.stringify({ data: { thread_items: nodes.map((post) => ({ post })) } });
  return `<html><head><script type="application/json" data-sjs>${JSON.stringify({ require: [["ScheduledServerJS", "handle", null, [{ __bbox: { result: inner } }]]] })}</script></head></html>`;
}

test("只接受 Threads 圖片主機上的網址；網站素材、連結預覽與其他網站一律不收", () => {
  assert.equal(threadsImageHost(cdn("a")), true);
  assert.equal(threadsImageHost("https://scontent.xx.fbcdn.net/v/a.jpg"), true);
  assert.equal(threadsImageHost("https://static.cdninstagram.com/rsrc.php/emoji.png"), false);
  assert.equal(threadsImageHost("https://external-syd2-1.xx.fbcdn.net/emg1/v/t13/preview.jpg"), false);
  assert.equal(threadsImageHost("http://scontent.cdninstagram.com/a.jpg"), false);
  assert.equal(threadsImageHost("https://evil.example/cdninstagram.com/a.jpg"), false);
});

test("貼文頁：只取這則貼文的整組輪播，依序取最大尺寸，影片項目略過，回覆的圖不混進來", () => {
  const html = postPage([
    node("DgPost01", "chihua.wang.3", { media_type: 8, carousel_media: [picture("first"), { media_type: 2, video_versions: [{ url: "https://x/v.mp4" }], ...picture("poster") }, picture("second")] }),
    node("DgReply9", "someone", picture("reply")),
  ]);
  assert.deepEqual(imagesFromPostPage(html, "DgPost01", "chihua.wang.3"), [cdn("first"), cdn("second")]);
  assert.deepEqual(imagesFromPostPage(html, "DgReply9"), [cdn("reply")]);
  assert.equal(imagesFromPostPage(html, "DgPost01", "another.author"), null, "作者不符就不算找到這則貼文");
});

test("貼文頁：單張圖取一張；文字貼文與影片貼文回答「沒有圖」，不改用嵌入頁；找不到貼文才回 null", () => {
  assert.deepEqual(imagesFromPostPage(postPage([node("One", "a", picture("only"))]), "One", "a"), [cdn("only")]);
  assert.deepEqual(imagesFromPostPage(postPage([node("Text", "a", { media_type: 19, image_versions2: { candidates: [] } })]), "Text", "a"), []);
  assert.deepEqual(imagesFromPostPage(postPage([node("Vid", "a", { media_type: 2, video_versions: [{ url: "https://x/v.mp4" }], ...picture("poster") })]), "Vid", "a"), []);
  assert.equal(imagesFromPostPage(postPage([node("Other", "a", picture("x"))]), "Missing", "a"), null);
  assert.equal(imagesFromPostPage("<html><body>登入</body></html>", "Missing", "a"), null);
});

test("嵌入頁：略過個人頁連結裡的頭像、標成頭像的圖與小圖，srcset 取最寬，同一張圖不重複", () => {
  const embed = `
    <a class="HeaderLink" href="https://www.threads.com/@chihua.wang.3"><img class="Avatar" src="${cdn("avatar", "150x150")}" width="40" height="40"></a>
    <img alt="chihua.wang.3的大頭貼照" src="${cdn("avatar2")}">
    <span class="BodyTextContainer">內文<img src="https://static.cdninstagram.com/emoji.png" alt="😃" width="16" height="16"></span>
    <div class="MediaContainer">
      <img src="${cdn("first", "320x400")}" srcset="${cdn("first", "320x400")} 320w, ${cdn("first")} 1080w" width="540" height="675">
      <img src="${cdn("second")}">
      <img src="${cdn("first", "640x800")}">
    </div>
    <script>var x = "<img src='${cdn("script")}'>";</script>`;
  assert.deepEqual(imagesFromEmbed(embed), [cdn("first"), cdn("second")]);
});

test("貼文頁認得這則貼文時以它為準（即使沒有圖）；認不得才用嵌入頁；最多 20 張", () => {
  assert.deepEqual(pickThreadsImages([cdn("a")], [cdn("b")]), { urls: [cdn("a")], source: "page" });
  assert.deepEqual(pickThreadsImages([], [cdn("poster")]), { urls: [], source: "page" });
  assert.deepEqual(pickThreadsImages(null, [cdn("b")]), { urls: [cdn("b")], source: "embed" });
  assert.deepEqual(pickThreadsImages(null, []), { urls: [], source: null });
  const many = Array.from({ length: 25 }, (_, i) => `<img src="${cdn("p" + i)}">`).join("");
  assert.equal(imagesFromEmbed(many).length, THREADS_IMAGE_LIMIT);
});
