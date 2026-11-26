import assert from "node:assert/strict";
import test from "node:test";
import { imagePagesFromResult, imageTextForOriginal, imageTextSchema, normalizeImageText, unreadImages, IMAGE_TEXT_PROMPT } from "../lib/dojo/captureImageText.ts";

const ids = ["a1", "a2", "a3"];
const read = { state: "ready", pages: [
  { attachmentId: "a1", text: "一個人顧三個平台\n內容怎麼不斷線", unclear: "" },
  { attachmentId: "a2", text: "", unclear: "" },
  { attachmentId: "a3", text: "週別｜燈號｜狀況\n第 3 週｜停線｜開始斷更", unclear: "右下角小字" },
], confirmed: false, confirmedAt: null, readAt: "2026-11-26T00:00:00.000Z", model: "m", estimatedCostUsd: 0.01, error: "" };

test("the prompt asks for verbatim text in reading order and never a summary", () => {
  assert.match(IMAGE_TEXT_PROMPT, /逐字照抄/);
  assert.match(IMAGE_TEXT_PROMPT, /不摘要/);
  assert.match(IMAGE_TEXT_PROMPT, /□/);
  assert.equal(imageTextSchema(3).properties.pages.minItems, 3);
});

test("the model's pages map onto the attachments in order, and a missing image is refused", () => {
  const pages = imagePagesFromResult({ pages: [{ index: 2, text: " 二 ", unclear: "" }, { index: 1, text: "一\r\n行", unclear: "" }] }, ["x", "y"]);
  assert.deepEqual(pages, [{ attachmentId: "x", text: "一\n行", unclear: "" }, { attachmentId: "y", text: "二", unclear: "" }]);
  assert.throws(() => imagePagesFromResult({ pages: [{ index: 1, text: "一", unclear: "" }] }, ["x", "y"]), /第 2 張/);
});

test("nothing joins the original until the owner confirms", () => {
  assert.equal(imageTextForOriginal(read, ids), "");
  assert.equal(imageTextForOriginal(undefined, ids), "");
  const confirmed = { ...read, confirmed: true };
  assert.equal(imageTextForOriginal(confirmed, ids), "〔圖 1〕\n一個人顧三個平台\n內容怎麼不斷線\n\n〔圖 3〕\n週別｜燈號｜狀況\n第 3 週｜停線｜開始斷更");
});

test("text of a removed image is dropped, and confirmation needs some text", () => {
  const normalized = normalizeImageText({ ...read, confirmed: true }, ["a1", "a2"]);
  assert.deepEqual(normalized.pages.map((page) => page.attachmentId), ["a1", "a2"]);
  assert.equal(normalized.confirmed, true);
  assert.equal(normalizeImageText({ ...read, confirmed: true, pages: [{ attachmentId: "a2", text: " ", unclear: "" }] }, ids).confirmed, false);
  assert.equal(normalizeImageText(null, ids), undefined);
});

test("images added after a reading are counted so the owner knows to read again", () => {
  assert.equal(unreadImages(read, [...ids, "a4", "a5"]), 2);
  assert.equal(unreadImages(undefined, ids), 3);
});
