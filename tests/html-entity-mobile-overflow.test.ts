import assert from "node:assert/strict";
import { captureContent, normalizeCaptureEntry } from "../lib/dojo/formal";
import { decodeHtmlEntities, extractExternalMetaContent, HTML_ENTITY_MAX_DECODE_PASSES, normalizeExternalPreviewText } from "../lib/dojo/htmlEntities";

assert.equal(decodeHtmlEntities("&#x5f35;&#x5b9c;"), "張宜", "A: hexadecimal Instagram entities decode");
assert.equal(decodeHtmlEntities("&#X5F35;&#23452;"), "張宜", "B: uppercase hexadecimal and decimal entities decode");
assert.equal(decodeHtmlEntities("&amp;#x5f35;"), "張", "C: nested entities decode with a bounded second pass");
assert.equal(decodeHtmlEntities("Creator &#x5f35; &amp; Friends"), "Creator 張 & Friends", "D: mixed English and Chinese metadata decodes");
assert.equal(decodeHtmlEntities("A".repeat(500)), "A".repeat(500), "E: unbroken English text remains intact");
assert.equal(decodeHtmlEntities("https://example.com/" + "path".repeat(100)), "https://example.com/" + "path".repeat(100), "F: long URLs remain intact");
assert.equal(decodeHtmlEntities("一般中文標題"), "一般中文標題", "G: ordinary Chinese is unchanged");
assert.equal(normalizeExternalPreviewText("A normal Instagram caption"), "A normal Instagram caption", "H: already-correct Instagram content is unchanged");
assert.equal(decodeHtmlEntities("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"), '<script>alert("x")</script>', "I: tag-like input remains plain text for React to escape");
assert.equal(decodeHtmlEntities("&#x110000; &#xD800; &#0;"), "&#x110000; &#xD800; &#0;", "invalid Unicode scalar values do not throw or mutate");
assert.equal(decodeHtmlEntities("&amp;amp;amp;amp;#x5f35;"), "&amp;#x5f35;", "nested decoding stops at the explicit maximum");
assert.equal(HTML_ENTITY_MAX_DECODE_PASSES, 3, "the decoding limit is explicit");
assert.equal(extractExternalMetaContent('<meta property="og:title" content="Instagram &#x5f35; &amp;amp; &#23452;">', ["og:title", "twitter:title"]), "Instagram 張 & 宜", "Instagram og:title is decoded before persistence");
assert.equal(extractExternalMetaContent('<meta content="說明 &amp;#x5f35;" name="twitter:description">', ["og:description", "twitter:description"]), "說明 張", "twitter:description supports reversed attribute order and nested encoding");

const originalReflection = "我親自輸入 &amp;#x5f35;，請保持原樣。";
const originalExploration = "探索紀錄也要保存 &lt;原文&gt;。";
const capture = normalizeCaptureEntry({
  title: "&#x5f35;的 Instagram 貼文",
  excerpt: "說明 &amp;#23452;",
  note: "其他補充",
  forageReason: originalReflection,
  sourceUrl: "https://www.instagram.com/p/example/",
  clip: {
    origin: "line",
    purpose: "saveFirst",
    sourceKind: "webpage",
    platform: "Instagram",
    webPreview: { description: "說明 &amp;#23452;", imageUrl: "", fetchedAt: null, status: "ready" },
  },
  explorationRecords: [{
    id: "exploration-1",
    clientRecordId: "client-1",
    source: "manual",
    thoughts: originalExploration,
    keyFinding: "",
    openQuestions: "",
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
  }],
  capturedAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
}, { id: "capture-1", capturedAt: "2026-09-24T00:00:00.000Z" })!;

const roundTrip = normalizeCaptureEntry(captureContent(capture), { id: capture.id, capturedAt: capture.capturedAt })!;
assert.equal(roundTrip.forageReason, originalReflection, "J: initial reflection is preserved verbatim");
assert.equal(roundTrip.explorationRecords[0]?.thoughts, originalExploration, "J: exploration text is preserved verbatim");
assert.equal(roundTrip.sourceUrl, "https://www.instagram.com/p/example/", "the original source URL is preserved");
assert.equal(roundTrip.title, "&#x5f35;的 Instagram 貼文", "legacy persisted metadata is not rewritten during normalization");

console.log("html-entity-mobile-overflow: decoder and persistence assertions passed");
