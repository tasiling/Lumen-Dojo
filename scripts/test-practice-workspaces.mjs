import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire, Module } from "node:module";
import ts from "typescript";
import { isolatedServer } from "./isolated-practice-server.mjs";
const require = createRequire(import.meta.url),
  cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file);
  cache.set(file, m);
  m.filename = file;
  m.require = (s) =>
    s.startsWith("@/")
      ? load(resolve(s.slice(2)) + ".ts")
      : s.startsWith(".")
        ? load(resolve(dirname(file), s) + ".ts")
        : require(s);
  m._compile(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const { SEEDS } = load("lib/dojo/learningFoundation/model.ts");
const { defaultLearningTrack, LEARNING_TRACKS } = load("lib/dojo/learning.ts");
const { emptyEnglishJournalPractice, normalizeEnglishJournalPractice } = load(
  "lib/dojo/englishJournal.ts",
);
const { legacyPracticeTarget } = load("lib/dojo/practiceNavigation.ts");
assert.equal(
  legacyPracticeTarget({ journal: "2026-09-29", source: "diary" }),
  "/practice/journal?journal=2026-09-29&source=diary",
);
const entities = SEEDS.map((seed, i) => ({
  schema: 1,
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  owner: "isolated",
  kind: "item",
  itemId: null,
  stageId: null,
  legacyKey: seed.legacyKey,
  seedKey: seed.key,
  name: seed.name,
  description:
    i === 7
      ? "長中文與英文探索說明。".repeat(20) + "longEnglishTitle".repeat(20)
      : seed.description,
  vision: seed.vision,
  goal: "",
  expectedOutcome: "",
  order: i,
  status: "active",
  focused: i === 5 || i === 7,
  revision: 1,
  createdAt: "2026-09-01",
  updatedAt: "2026-09-30",
}));
let journal = emptyEnglishJournalPractice(
  "2026-09-29",
  "隔離日記第一段。\n\n隔離日記第二段。",
);
journal.segments[0].draft = "My saved draft.";
journal.status = "drafting";
const complete = emptyEnglishJournalPractice(
  "2026-09-28",
  "已完成的隔離日記。",
);
complete.status = "completed";
complete.completedAt = "2026-09-28T01:00:00Z";
complete.segments[0].draft = "Completed draft.";
complete.segments[0].finalVersion = "Completed final.";
complete.segments[0].completedAt = complete.completedAt;
let writes = 0,
  saveFail = false,
  unavailable = false;
const external = [],
  errors = [];
const server = await isolatedServer(3022, "r2-2-isolated-test");
const { chromium } = require("playwright");
let browser;
const output = process.env.R2_UI_OUTPUT_DIR ?? "/tmp/r2-2-ui";
await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies([
    { name: "dsc_access_key", value: "r2-2-isolated-test", url: server.base },
  ]);
  await context.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.origin !== server.base) {
      external.push(u.origin);
      return route.abort();
    }
    if (u.pathname === "/__r2-test-font" && process.env.UI_CJK_FONT)
      return route.fulfill({
        contentType: "font/otf",
        body: readFileSync(process.env.UI_CJK_FONT),
      });
    if (!u.pathname.startsWith("/api/")) return route.continue();
    let status = 200,
      body;
    if (u.pathname === "/api/dojo/english-journal") {
      if (unavailable) {
        status = 503;
        body = { error: "日記外部服務不可用" };
      } else if (req.method() === "GET")
        body = {
          practices: [journal, complete],
          sources: [
            {
              date: "2026-09-27",
              title: "未加入的隔離來源",
              sourceText: "來源中文。",
            },
          ],
        };
      else if (req.method() === "PATCH") {
        const b = req.postDataJSON();
        assert.equal(b.date, journal.date);
        assert.equal(b.complete, false);
        if (saveFail) {
          status = 503;
          body = { error: "隔離保存失敗" };
        } else {
          journal = normalizeEnglishJournalPractice(
            { ...journal, ...b.practice },
            b.date,
          );
          writes++;
          body = { practice: journal, weeklySynced: false };
        }
      } else throw Error("Unexpected journal mutation " + req.method());
    } else if (u.pathname === "/api/dojo/learning/foundation")
      body = { entities, missing: [] };
    else if (u.pathname === "/api/dojo/learning/records")
      body = { records: [], cursor: null };
    else if (u.pathname === "/api/dojo/practice-events")
      body = { events: [], cursor: null };
    else if (u.pathname === "/api/dojo/learning")
      body = { tracks: Object.keys(LEARNING_TRACKS).map(defaultLearningTrack) };
    else if (u.pathname === "/api/dojo/entries")
      body = {
        entries: [
          {
            id: "isolated-entry",
            title: "既有修習紀錄・長中文標題".repeat(6),
            space: "practice",
            kind: "身",
            date: "2026-09-30",
            minutes: 5,
          },
        ],
      };
    else if (u.pathname === "/api/dojo/captures") body = { captures: [] };
    else if (u.pathname === "/api/dojo/manifestation")
      body = {
        profile: {
          title: "隔離創現角色",
          traits: ["穩定"],
          note: "隔離角色方向",
        },
        milestones: [],
      };
    else {
      status = 503;
      body = { error: "隔離測試未提供此外部服務" };
    }
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  if (process.env.UI_CJK_FONT)
    await context.addInitScript(() => {
      window.__r2FontReady = new FontFace("R2 CJK", "url(/__r2-test-font)")
        .load()
        .then((f) => document.fonts.add(f))
        .catch(() => null);
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent =
          "body,body * {font-family:'R2 CJK',Arial,sans-serif!important}";
        document.head.append(s);
      });
    });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  async function go(path) {
    await page.goto(server.base + path);
    await page.evaluate(() => window.__r2FontReady);
  }
  async function noOverflow() {
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert(
      await page
        .locator(".practice-workspace")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
  }
  const draft = () =>
    page.getByPlaceholder(
      "只翻譯目前這一段。先用現在會的英文寫，不用急著查到完美。",
    );
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await go("/practice");
    await page.getByRole("link", { name: /續寫 2026-09-29/ }).waitFor();
    assert.equal(await page.locator(".english-journal-workbench").count(), 0);
    await noOverflow();
    await page.screenshot({
      path: `${output}/home-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: /續寫 2026-09-29/ }).click();
    await draft().waitFor();
    await page.getByText(/9月29日/).first().waitFor();
    await draft().fill(`Saved at ${width}.`);
    await page.getByRole("button", { name: "儲存這段", exact: true }).click();
    await page.getByText("這一段的進度已儲存。", { exact: true }).waitFor();
    await page.reload();
    await assert.equal(await draft().inputValue(), `Saved at ${width}.`);
    await noOverflow();
    await page.screenshot({
      path: `${output}/journal-${width}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width, height: 500 });
    await draft().focus();
    await page.keyboard.press("Tab");
    await page
      .getByRole("button", { name: "儲存這段", exact: true })
      .scrollIntoViewIfNeeded();
    const box = await page
      .getByRole("button", { name: "儲存這段", exact: true })
      .boundingBox();
    assert(
      box.y >= 0 && box.y + box.height < 430,
      JSON.stringify({
        box,
        viewport: await page.evaluate(() => ({
          innerHeight,
          visual: visualViewport.height,
        })),
      }),
    );
    console.log(
      `PASS ${width}px home/resume/save/refresh/keyboard/reduced viewport`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await go(
    "/practice?journal=2026-09-29&source=diary&returnTo=" +
      encodeURIComponent("/practice/learning?learningItem=english&tab=tools"),
  );
  await draft().waitFor();
  assert.equal(new URL(page.url()).searchParams.get("source"), "diary");
  await page.getByRole("link", { name: /返回學科工作空間/ }).click();
  await page.getByRole("navigation", { name: "學科分頁" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("tab"), "tools");
  await page.reload();
  await page.getByRole("navigation", { name: "學科分頁" }).waitFor();
  await page.getByRole("link", {name:"日記自譯",exact:true}).click();
  await draft().waitFor();
  await page.goBack();
  await page.getByRole("navigation", {name:"學科分頁"}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("tab"),"tools");
  console.log("PASS legacy date/source/return workspace and refresh");
  await go("/practice/learning");
  await page.getByText("全部學科（9）", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("navigation", { name: "學科分頁" }).count(),
    0,
  );
  for (const e of entities) {
    const details = page
      .locator("details")
      .filter({ has: page.getByText("全部學科（9）", { exact: true }) });
    if (!(await details.evaluate((e) => e.open)))
      await details.locator("summary").click();
    await details.getByRole("link", { name: new RegExp(e.name) }).click();
    await page.getByRole("heading", { name: e.name, exact: true }).waitFor();
    assert.equal(await page.locator(".english-journal-workbench").count(), 0);
    await noOverflow();
  }
  await go(`/practice/learning?learningItem=${entities[7].id}&tab=overview`);
  await page
    .getByRole("heading", { name: entities[7].name, exact: true })
    .waitFor();
  await page.screenshot({
    path: `${output}/learning-long.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "學習路徑", exact: true }).click();
  await page.getByText("空白路徑也能開始修習，尚無階段或主題。").waitFor();
  await page.getByRole("button", { name: "留下修習紀錄", exact: true }).click();
  await page.getByRole("button", { name: "儲存草稿", exact: true }).waitFor();
  await page.getByLabel("這次學了什麼？").waitFor();
  console.log(
    "PASS nine disciplines, no default English, empty path starts real record",
  );
  await go("/practice/body");
  assert.equal(await page.locator("input[type=checkbox]").count(), 0);
  await go("/practice?manifestation=yes");
  await page.getByRole("heading", { name: "角色小檔案" }).waitFor();
  await page.getByRole("link", { name: "狂A肯定句", exact: true }).click();
  assert.equal(new URL(page.url()).hash, "#creative-affirm");
  await go("/practice?vision=yes");
  await page
    .getByRole("heading", { name: "靈・Vision", exact: true })
    .waitFor();
  await go("/practice/logs");
  await page.getByText(/既有修習紀錄・長中文/).waitFor();
  await go("/practice/vocabulary");
  await page.getByText(/外部入口尚未配置/).waitFor();
  console.log(
    "PASS body has no unsaved checkboxes, intention/spirit/history distinct, unavailable VF explicit",
  );
  await go("/practice/journal?journal=2026-09-28");
  await page.getByText("Completed final.", { exact: true }).first().waitFor();
  const before = writes;
  await go("/practice/journal?journal=2026-09-27");
  await page.getByText(/此日期尚無已保存/).waitFor();
  assert.equal(writes, before);
  console.log("PASS completed deep link and source read do not auto-create");
  await go("/practice");
  await page.getByRole("link", { name: /續寫/ }).click();
  await draft().waitFor();
  await draft().fill("Unsaved preserved.");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("link", { name: /返回修習所/ }).click();
  assert.equal(await draft().inputValue(), "Unsaved preserved.");
  const dialog = new Promise((resolve) =>
    page.once("dialog", async (d) => {
      await d.dismiss();
      resolve();
    }),
  );
  await page.evaluate(() => history.back());
  await dialog;
  assert.equal(await draft().inputValue(), "Unsaved preserved.");
  saveFail = true;
  await page.getByRole("button", { name: "儲存這段", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "隔離保存失敗" }).waitFor();
  assert.equal(await draft().inputValue(), "Unsaved preserved.");
  saveFail = false;
  await page.getByRole("button", { name: "儲存這段", exact: true }).click();
  await page.getByText("這一段的進度已儲存。", { exact: true }).waitFor();
  await page.getByRole("link", { name: /返回修習所/ }).click();
  await page.getByRole("heading", { name: "修習所", exact: true }).waitFor();
  console.log(
    "PASS unsaved link/browser back cancellation, failed save retains draft, successful save releases guard",
  );
  unavailable = true;
  await go("/practice");
  await page
    .getByRole("alert")
    .filter({ hasText: "日記外部服務不可用" })
    .waitFor();
  const unauth = await browser.newContext();
  const r = await unauth.request.get(
    server.base + "/api/dojo/learning/foundation",
  );
  assert.equal(r.status(), 401);
  const login = await unauth.request.get(
    server.base + "/practice/journal?journal=2026-09-29",
    { maxRedirects: 0 },
  );
  assert.equal(
    new URL(login.headers().location, server.base).searchParams.get("redirect"),
    "/practice/journal?journal=2026-09-29",
  );
  await unauth.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS real auth rejection, login date retention, explicit service errors; zero external requests/runtime errors",
  );
  console.log(`Screenshots: ${output}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.stop();
}
