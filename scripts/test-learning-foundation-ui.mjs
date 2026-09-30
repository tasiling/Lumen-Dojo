// Browser interaction tests use isolated in-memory IO and the real foundation domain service.
// Start local Next dev with ACCESS_KEY=r2-1-isolated-test first. No live Notion calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { createRequire, Module } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(".");
const cache = new Map();
function load(filename) {
  filename = resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiledModule = new Module(filename);
  cache.set(filename, compiledModule);
  compiledModule.filename = filename;
  compiledModule.require = (specifier) => {
    const path = specifier.startsWith("@/")
      ? resolve(root, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(filename), specifier)
        : null;
    return path ? load(`${path}.ts`) : require(specifier);
  };
  compiledModule._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return compiledModule.exports;
}
const { foundationService } = load("lib/dojo/learningFoundation/service.ts");
const { normalizeCaptureEntry, captureContent } = load("lib/dojo/formal.ts");
const { LEARNING_TRACKS, defaultLearningTrack } = load("lib/dojo/learning.ts");
const { mergeLearningRelations } = load(
  "lib/dojo/learningFoundation/relations.ts",
);
const rows = new Map();
let mutationCount = 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const service = foundationService({
  owner: "isolated-ui",
  list: async () => [...rows.values()].map(clone),
  create: async (title, entity) => {
    rows.set(entity.id, { id: entity.id, title, value: clone(entity) });
    mutationCount++;
  },
  update: async (id, title, entity) => {
    rows.set(id, { id, title, value: clone(entity) });
    mutationCount++;
  },
  exclusive: async (fn) => fn(),
  legacyVision: async () => null,
});
let capture = normalizeCaptureEntry(
  {
    title: "隔離素材：心理學與中醫長中文",
    status: "adopted",
    destinations: ["practice"],
    learningTracks: [],
    learningItemIds: [],
  },
  { id: "isolated-capture" },
);
const base = process.env.UI_BASE_URL ?? "http://127.0.0.1:3017";
const output = process.env.R2_UI_OUTPUT_DIR ?? "/tmp/r2-1-ui";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_EXECUTABLE_PATH ?? chromium.executablePath(),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
await context.addCookies([
  { name: "dsc_access_key", value: "r2-1-isolated-test", url: base },
]);
const page = await context.newPage();
if (process.env.UI_CJK_FONT) {
  await page.route("**/__r2-test-font", (route) =>
    route.fulfill({
      contentType: "font/otf",
      body: readFileSync(process.env.UI_CJK_FONT),
    }),
  );
  await page.addInitScript(() => {
    window.__r2FontReady = new FontFace("R2 CJK", "url(/__r2-test-font)")
      .load()
      .then((font) => {
        document.fonts.add(font);
      });
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        "body, body * { font-family: Arial, Helvetica, 'R2 CJK', sans-serif !important; }";
      document.head.append(style);
    });
  });
}
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  const body = method === "GET" ? null : request.postDataJSON();
  let data;
  try {
    if (path === "/api/dojo/learning/foundation") {
      if (method === "GET") data = await service.snapshot();
      else if (method === "POST" && body.action === "initialize")
        data = await service.initialize();
      else if (method === "POST")
        data = {
          entity: await service.create(body.kind, body.input, body.itemId),
        };
      else
        data = {
          entity: await service.edit(body.id, body.revision, body.input),
        };
    } else if (path === "/api/dojo/learning")
      data = { tracks: Object.keys(LEARNING_TRACKS).map(defaultLearningTrack) };
    else if (path === "/api/dojo/captures") {
      if (method === "GET") data = { captures: [capture] };
      else {
        assert.equal(body.capture.updatedAt, capture.updatedAt);
        const relations = mergeLearningRelations(
          capture,
          body.capture,
          (await service.snapshot()).entities,
        );
        capture = normalizeCaptureEntry(
          { ...capture, ...body.capture, ...relations },
          { id: capture.id, touch: true },
        );
        data = { capture };
      }
    } else
      data = {
        entries: [],
        claims: [],
        practices: [],
        sources: [],
        seeds: [],
        daily: [],
        items: [],
        activities: [],
        recent: [],
        inbox: null,
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  } catch (error) {
    await route.fulfill({
      status: error.status ?? 500,
      contentType: "application/json",
      body: JSON.stringify({ error: error.message }),
    });
  }
});
const manager = page.locator(".learning-foundation");
async function openLearning() {
  await page.goto(`${base}/practice`);
  await page.getByRole("button", { name: "心", exact: true }).click();
  await manager
    .getByRole("button", { name: "＋ 新增項目", exact: true })
    .waitFor();
}
async function noOverflow(width) {
  await page.evaluate(() => window.__r2FontReady);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
    `overflow at ${width}`,
  );
}
try {
  await openLearning();
  await manager.getByRole("button", { name: /預覽缺項初始化/ }).click();
  assert.equal(mutationCount, 0);
  await manager
    .getByRole("button", { name: "確認初始化缺項", exact: true })
    .click();
  await manager
    .locator(".learning-track-grid button")
    .filter({ hasText: "中醫" })
    .waitFor();
  assert.equal(
    (await service.snapshot()).entities.filter((e) => e.kind === "item").length,
    9,
  );
  console.log(
    "PASS UI initialization preview is read-only; explicit confirmation creates nine items",
  );
  await manager
    .getByRole("button", { name: "＋ 新增項目", exact: true })
    .click();
  const longName =
    "第十項・跨學科探索與英文闡述 " +
    "LongEnglishReadingAndExpression".repeat(4);
  await manager
    .locator("form")
    .getByLabel("名稱", { exact: true })
    .fill(longName);
  await manager
    .locator("form")
    .getByLabel("長期願景", { exact: true })
    .fill("保留空白階段，長期探索與自由調整。".repeat(10));
  await manager
    .locator("form")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await manager
    .locator(".foundation-detail")
    .getByRole("heading", { name: longName, exact: true })
    .waitFor();
  const custom = (await service.snapshot()).entities.find(
    (e) => e.name === longName,
  );
  await page.reload();
  await manager
    .locator(".foundation-detail")
    .getByRole("heading", { name: longName, exact: true })
    .waitFor();
  assert.ok(page.url().includes(custom.id));
  console.log(
    "PASS UI tenth custom item, long bilingual name, blank path and refresh selection persistence",
  );
  await manager
    .getByRole("button", { name: "＋ 新增階段", exact: true })
    .click();
  await manager
    .locator("form")
    .getByLabel("名稱", { exact: true })
    .fill("階段一・自學探索");
  await manager
    .locator("form")
    .getByLabel("學習目標", { exact: true })
    .fill("理解並闡述基本概念");
  await manager
    .locator("form")
    .getByLabel("預期成果（學習目標文字）", { exact: true })
    .fill("能以自己的語言表達");
  await manager
    .locator("form")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await manager
    .getByRole("heading", { name: "階段一・自學探索", exact: true })
    .waitFor();
  await manager
    .getByRole("button", { name: "＋ 新增階段", exact: true })
    .click();
  await manager
    .locator("form")
    .getByLabel("名稱", { exact: true })
    .fill("階段二・課程先修");
  await manager
    .locator("form")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await manager
    .getByRole("heading", { name: "階段二・課程先修", exact: true })
    .waitFor();
  await manager
    .getByRole("button", { name: "＋ 新增主題", exact: true })
    .click();
  await manager
    .locator("form")
    .getByLabel("名稱", { exact: true })
    .fill("主題・長中文與英文 " + "UnderstandingConcepts".repeat(8));
  await manager
    .locator("form")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "編輯主題", exact: true })
    .waitFor();
  await manager.getByRole("button", { name: "編輯主題", exact: true }).click();
  await manager
    .locator("form")
    .getByLabel("移動至同一項目內的階段")
    .selectOption({ label: "階段一・自學探索" });
  await manager.locator("form").getByLabel("排序（由小到大）").fill("2");
  await manager
    .locator("form")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".foundation-editor"),
  );
  let topic = (await service.snapshot()).entities.find(
    (e) => e.kind === "topic",
  );
  assert.equal(topic.order, 2);
  assert.ok(topic.stageId);
  await manager.getByRole("button", { name: "編輯主題", exact: true }).click();
  await manager
    .locator("form")
    .getByLabel("移動至同一項目內的階段")
    .selectOption({ label: "階段二・課程先修" });
  await manager
    .locator("form")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".foundation-editor"),
  );
  const moved = (await service.snapshot()).entities.find(
    (e) => e.id === topic.id,
  );
  assert.notEqual(moved.stageId, topic.stageId);
  const topicNode = manager
    .locator(".foundation-node")
    .filter({
      has: page.getByRole("button", { name: "編輯主題", exact: true }),
    });
  await topicNode.getByRole("button", { name: "暫停", exact: true }).click();
  await topicNode.getByText(/暫時擱置/).waitFor();
  await topicNode.getByRole("button", { name: "恢復", exact: true }).click();
  await topicNode.getByRole("button", { name: "暫停", exact: true }).waitFor();
  await topicNode.getByRole("button", { name: "封存", exact: true }).click();
  await topicNode.getByText(/^封存 ·/).waitFor();
  await topicNode.getByRole("button", { name: "恢復", exact: true }).click();
  await topicNode.getByRole("button", { name: "暫停", exact: true }).waitFor();
  console.log(
    "PASS UI stage/topic creation, order, movement, pause/archive/restore without ID change",
  );
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 812 });
    await noOverflow(width);
    await manager
      .getByRole("button", { name: "編輯項目", exact: true })
      .click();
    const input = manager.locator("form").getByLabel("名稱", { exact: true });
    await input.focus();
    assert.equal(
      await input.evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.tagName),
      "BODY",
    );
    await noOverflow(width);
    const padding = await manager.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingBottom),
    );
    assert.ok(padding >= 16);
    await page.screenshot({
      path: join(output, `learning-${width}.png`),
      fullPage: true,
    });
    await manager
      .locator("form")
      .getByRole("button", { name: "取消", exact: true })
      .click();
  }
  console.log(
    "PASS 375/390/430px long text, keyboard focus/Tab and CSS safe-area padding (Chromium emulation)",
  );
  await manager
    .locator(".foundation-detail")
    .getByRole("button", { name: "開始這次修習", exact: true })
    .click();
  await page.waitForURL("**/timer");
  await page.goBack();
  await manager
    .locator(".foundation-detail")
    .getByRole("heading", { name: longName, exact: true })
    .waitFor();
  console.log("PASS timer navigation and Back restore selected learning item");
  await page.goto(`${base}/forage/captures`);
  await page.getByRole("tab", { name: /已採用/ }).click();
  await page
    .getByText("隔離素材：心理學與中醫長中文", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: /整理|編輯/ })
    .first()
    .click();
  await page.getByRole("button", { name: "心理學", exact: true }).click();
  await page.getByRole("button", { name: "中醫", exact: true }).click();
  await page
    .getByRole("button", { name: "採用並送往下一站", exact: true })
    .click();
  assert.equal(capture.learningItemIds.length, 2);
  await page.reload();
  await page.getByRole("tab", { name: /已採用/ }).click();
  await page
    .getByText("隔離素材：心理學與中醫長中文", { exact: true })
    .waitFor();
  assert.equal(
    normalizeCaptureEntry(captureContent(capture), { id: capture.id })
      .learningItemIds.length,
    2,
  );
  console.log(
    "PASS forage UI links psychology/Chinese medicine and survives refresh",
  );
  assert.deepEqual(pageErrors, []);
  console.log("PASS no browser runtime errors");
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
