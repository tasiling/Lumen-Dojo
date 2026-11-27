// 肌肉卡畫面測試：隔離的記憶體儲存＋真正的網域服務，不呼叫 Notion。
// 會自行啟動本機 Next（ACCESS_KEY=muscle-cards-isolated-test）。
import { isolatedServer } from "./isolated-practice-server.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire, Module } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(".");
const cache = new Map();
function load(filename) {
  filename = resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = new Module(filename);
  cache.set(filename, compiled);
  compiled.filename = filename;
  compiled.require = (specifier) => {
    const path = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(filename), specifier) : null;
    return path ? load(`${path}.ts`) : require(specifier);
  };
  compiled._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return compiled.exports;
}
const { foundationService } = load("lib/dojo/learningFoundation/service.ts");
const { muscleService } = load("lib/dojo/muscleCards/service.ts");
const { LEARNING_TRACKS, defaultLearningTrack } = load("lib/dojo/learning.ts");
const clone = (v) => JSON.parse(JSON.stringify(v));

const foundationRows = new Map();
const foundation = foundationService({
  owner: "isolated-ui",
  list: async () => [...foundationRows.values()].map(clone),
  create: async (title, entity) => { foundationRows.set(entity.id, { id: entity.id, title, value: clone(entity) }); },
  update: async (id, title, entity) => { foundationRows.set(id, { id, title, value: clone(entity) }); },
  exclusive: async (fn) => fn(),
  legacyVision: async () => null,
});
const muscleRows = new Map();
let muscleWrites = 0;
const muscles = muscleService({
  owner: "isolated-ui",
  list: async (prefix) => [...muscleRows.values()].filter((r) => r.title.startsWith(prefix)).map(clone),
  create: async (title, value) => { const id = randomUUID(); muscleRows.set(id, { id, title, value: clone(value) }); muscleWrites++; },
  update: async (id, prefix, title, value) => { assert(muscleRows.get(id).title.startsWith(prefix)); muscleRows.set(id, { id, title, value: clone(value) }); muscleWrites++; },
  archive: async (id) => { muscleRows.delete(id); muscleWrites++; },
  exclusive: async (fn) => fn(),
});
await foundation.installCurriculum();
const entities = (await foundation.snapshot()).entities;
const massage = entities.find((e) => e.kind === "item" && e.legacyKey === "massage");
const trapTopic = entities.find((e) => e.kind === "topic" && e.itemId === massage.id && e.name === "回看上斜方肌");
assert(trapTopic, "原有主題已建立");
const legacyRecord = {
  id: randomUUID(), owner: "isolated-ui", recordType: "learning-record/v1", status: "completed", title: "上斜方肌舊紀錄",
  practicedOn: "2026-10-01", recordedOn: "2026-10-01", createdAt: "", updatedAt: "", revision: 1,
  learningItemIds: [massage.id], primaryLearningItemId: massage.id, learningStageId: trapTopic.stageId, learningTopicId: trapTopic.id,
  practiceKind: "", whatIDid: "對照無標示的圖", myUnderstanding: "", questions: "", difficulties: "", discoveries: "", worthKeeping: "",
  sourceRefs: [], selectedExcerpt: "", sourceSnapshot: "", tags: [],
};

const server = await isolatedServer(3027, "muscle-cards-isolated-test");
const base = server.base;
const output = process.env.MUSCLE_UI_OUTPUT_DIR ?? "/tmp/muscle-cards-ui";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}), args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await context.addCookies([{ name: "dsc_access_key", value: "muscle-cards-isolated-test", url: base }]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message + "\n" + (e.stack ?? "").slice(0, 1500)));
page.on("dialog", (d) => d.accept());
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const body = method === "GET" ? null : request.postDataJSON();
  let data;
  try {
    if (url.pathname === "/api/dojo/reading/discussions") return void await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    if (url.pathname === "/api/dojo/learning/foundation") data = await foundation.snapshot();
    else if (url.pathname === "/api/dojo/learning") data = { tracks: Object.keys(LEARNING_TRACKS).map(defaultLearningTrack) };
    else if (url.pathname === "/api/dojo/learning/records")
      data = { records: url.searchParams.get("topicId") === trapTopic.id ? [legacyRecord] : [], cursor: null };
    else if (url.pathname === "/api/dojo/muscles") {
      if (method === "GET") data = await muscles.snapshot();
      else if (method === "PATCH") data = { card: await muscles.saveSection(body.key, body.section, body.revision, body.content) };
      else if (body.action === "create-pattern") data = { pattern: await muscles.createPattern(body.createRequestId, body.input) };
      else data = { pattern: await muscles.editPattern(body.id, body.revision, body.input) };
    } else if (url.pathname === "/api/dojo/muscles/answers") {
      if (method === "GET") data = { answers: await muscles.listAnswers(url.searchParams.get("card")) };
      else if (method === "POST") data = { answers: await muscles.addAnswers(body.card, body.createRequestId, body.entries) };
      else { await muscles.archiveAnswer(body.card, body.id); data = { ok: true }; }
    } else if (url.pathname === "/api/dojo/dao/links") {
      if (method === "GET") data = { links: (await muscles.snapshot()).links };
      else if (method === "POST") data = { link: await muscles.createLink(body.createRequestId, body.input) };
      else { await muscles.archiveLink(body.id); data = { ok: true }; }
    } else data = { entries: [], claims: [], practices: [], sources: [], seeds: [], daily: [], items: [], activities: [], recent: [], inbox: null, questions: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  } catch (error) {
    await route.fulfill({ status: error.status ?? 500, contentType: "application/json", body: JSON.stringify({ error: error.message }) });
  }
});

const pathNav = page.getByRole("navigation", { name: "學習路徑" });
const card = page.locator(".muscle-card");
const status = (layer) => card.locator(".muscle-status li").filter({ hasText: layer }).locator("b");
async function openPath(name) {
  await pathNav.getByRole("link", { name, exact: true }).click();
  await page.locator("#muscle-path-title").filter({ hasText: name }).waitFor();
}
async function openMuscle(pathName, label) {
  await openPath(pathName);
  await page.locator(".muscle-path-list").first().getByRole("link", { name: label }).click();
  await card.getByRole("heading", { level: 2 }).waitFor();
}
async function noOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `horizontal overflow: ${label}`);
}
const testTab = (name) => card.getByRole("tab", { name: new RegExp(`^${name}`) });
const field = (label) => card.getByRole("tabpanel").filter({ visible: true }).getByLabel(label, { exact: true });

try {
  await page.goto(`${base}/practice/learning?learningItem=massage&tab=path`);
  await pathNav.waitFor();
  // 十條路徑都看得到，五十張卡各在自己的部位。
  assert.deepEqual(await pathNav.getByRole("link").allTextContents(), ["頭", "頸", "肩", "背", "上肢", "臀", "大腿", "小腿", "腳底", "觸康健十四肌"]);
  const expected = { 頭: 3, 頸: 5, 肩: 11, 背: 7, 上肢: 6, 臀: 5, 大腿: 4, 小腿: 5, 腳底: 4 };
  let total = 0;
  for (const [name, count] of Object.entries(expected)) {
    await openPath(name);
    assert.equal(await page.locator(".muscle-path .muscle-path-list li").count(), count, name);
    total += count;
  }
  assert.equal(total, 50);
  await openPath("觸康健十四肌");
  const tfhNames = await page.locator(".muscle-path .muscle-path-list li b").allTextContents();
  assert.equal(tfhNames.length, 14);
  assert.equal(tfhNames[0], "棘上肌");
  assert.equal(tfhNames[10], "三角肌（前束）");
  assert.equal(tfhNames[7], "髂腰肌（腰大肌）");
  await noOverflow("tfh path");
  // 原有五個主題仍在「既有主題」區。
  const legacySection = page.locator(".muscle-legacy-topics");
  for (const name of ["回看上斜方肌", "辨認肩胛提肌", "延伸到其他部位", "向客人解說", "評估與禁忌專題"])
    await legacySection.locator(".practice-topic-card summary b", { hasText: name }).waitFor({ state: "attached" });
  assert.equal(muscleWrites, 0, "空卡不先寫入");

  // 上斜方肌：三層、測試三分頁、舊紀錄只讀列出。
  await openMuscle("肩", "上斜方肌");
  assert.equal(await card.getByRole("heading", { level: 2 }).textContent(), "上斜方肌");
  assert.deepEqual(await card.locator(".muscle-status li").allTextContents(), ["認識 未建", "徒手肌力測試 未建", "姿勢評估 未建", "運用 未建"]);
  await card.getByRole("link", { name: "上斜方肌舊紀錄" }).waitFor();
  await card.getByText("這張卡還沒有內容，沒有可以出題的欄位。").waitFor();
  await card.getByLabel("起點", { exact: true }).fill("教材所寫的起點");
  await card.getByRole("button", { name: "保存認識" }).click();
  await card.getByText("認識已保存。").waitFor();
  assert.equal(await status("認識").textContent(), "已建");
  // 測試三分頁各自保存。
  await testTab("徒手肌力測試").click();
  await card.getByText("英國醫學研究委員會（MRC）0 到 5 級").waitFor();
  await field("測試姿勢").fill("教材的測試姿勢");
  await card.getByRole("button", { name: "保存徒手肌力測試" }).click();
  await card.getByText("徒手肌力測試已保存。").waitFor();
  await testTab("姿勢評估").click();
  await card.getByRole("checkbox", { name: "上交叉症候群" }).check();
  await card.getByLabel("在上交叉症候群中偏緊還是偏弱").selectOption("tight");
  await card.getByRole("button", { name: "保存姿勢評估" }).click();
  await card.getByText("姿勢評估已保存。").waitFor();
  await testTab("觸康健檢測").click();
  await card.getByText("這條肌肉不在觸康健十四肌之內").waitFor();
  assert.equal(await testTab("觸康健檢測").locator("small").textContent(), "不在十四肌內");
  assert.equal(await status("姿勢評估").textContent(), "已建");
  assert.equal(await status("運用").textContent(), "未建");
  // 重新整理後仍在。
  await page.reload();
  await card.getByRole("heading", { level: 2 }).waitFor();
  assert.equal(await card.getByLabel("起點", { exact: true }).inputValue(), "教材所寫的起點");
  assert.equal(await card.getByLabel("止點", { exact: true }).inputValue(), "");
  await testTab("徒手肌力測試").click();
  assert.equal(await field("測試姿勢").inputValue(), "教材的測試姿勢");
  await noOverflow("muscle card");

  // 討論包：只放有內容的欄位；貼回後各筆記在所屬的層。
  await card.getByText("查看討論包內容").click();
  const pack = await card.locator(".muscle-pack").textContent();
  assert.match(pack, /起點：教材所寫的起點/);
  assert.match(pack, /一次只出一題/);
  assert.match(pack, /不得自己補充任何解剖事實/);
  assert.match(pack, /相關的姿勢型態：上交叉症候群（在其中偏緊）/);
  assert.doesNotMatch(pack, /止點/);
  assert.doesNotMatch(pack, /【運用】/);
  assert.doesNotMatch(pack, /觸康健/);
  await card.getByLabel("貼回成果").fill([
    "```", "===肌肉卡答題/v1===", "卡片：上斜方肌", "層：認識", "題目：起點在哪裡？", "我的答案：我記得的起點", "不一致：和卡片的起點描述不同", "===題目結束===",
    "===肌肉卡答題/v1===", "卡片：上斜方肌", "層：徒手肌力測試", "題目：測試姿勢？", "我的答案：教材的測試姿勢", "不一致：無", "===題目結束===", "```",
  ].join("\n"));
  await card.getByRole("button", { name: "核對貼回內容" }).click();
  await card.getByRole("button", { name: "保存 2 筆答題紀錄" }).click();
  await card.getByText("已保存 2 筆答題紀錄").waitFor();
  const knowAnswers = card.locator(".muscle-layer").first().locator(".muscle-answers");
  await knowAnswers.locator(":scope > summary").click();
  await knowAnswers.getByText("起點在哪裡？", { exact: true }).waitFor();
  assert.equal(await knowAnswers.locator(".muscle-answer").count(), 1);

  // 帶類型的連結：雙方的局部視窗都看得到，點擊跳轉，跨路徑時路徑跟著切換。
  await card.locator(".muscle-add-link summary").click();
  await card.getByLabel("連結類型").selectOption("synergist");
  await card.getByLabel("連到哪一張卡").selectOption("levator-scapulae");
  await card.getByLabel("說明").fill("一起上提肩胛");
  await card.getByRole("button", { name: "存進道藏" }).click();
  await card.getByText("連結已存進道藏。").waitFor();
  const local = card.locator(".muscle-local-window");
  await local.getByRole("link", { name: "肩胛提肌" }).click();
  await card.getByRole("heading", { level: 2, name: "肩胛提肌" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("path"), "neck");
  assert.equal(await pathNav.locator("[aria-current=page]").textContent(), "頸");
  await local.getByText("一起上提肩胛").waitFor();
  await local.getByRole("link", { name: "上斜方肌" }).waitFor();

  // 同一個姿勢型態：由姿勢評估自動互連，也連到型態卡。
  await openMuscle("背", "下斜方肌");
  await testTab("姿勢評估").click();
  await card.getByRole("checkbox", { name: "上交叉症候群" }).check();
  await card.getByLabel("在上交叉症候群中偏緊還是偏弱").selectOption("weak");
  await card.getByRole("button", { name: "保存姿勢評估" }).click();
  await card.getByText("姿勢評估已保存。").waitFor();
  const posture = local.locator(".muscle-link-group").filter({ hasText: "同一個姿勢型態" });
  await posture.getByRole("link", { name: "上斜方肌" }).waitFor();
  await posture.getByText("上交叉症候群：上斜方肌偏緊、下斜方肌偏弱").waitFor();
  await posture.getByRole("link", { name: "上交叉症候群" }).click();
  await page.getByRole("heading", { level: 2, name: "上交叉症候群" }).waitFor();
  const members = page.locator(".muscle-card .muscle-layer");
  await members.locator(".muscle-link-group").filter({ hasText: "偏緊" }).first().getByRole("link", { name: "上斜方肌" }).waitFor();
  await members.locator(".muscle-link-group").filter({ hasText: "偏弱" }).first().getByRole("link", { name: "下斜方肌" }).waitFor();
  await page.getByLabel("觀察重點", { exact: true }).fill("我的觀察筆記");
  await page.getByRole("button", { name: "保存型態卡" }).click();
  await page.getByText("型態卡已保存。").waitFor();

  // 觸康健路徑與部位路徑是同一張卡；經絡預填，十四肌的觸康健分頁可以保存。
  await openMuscle("觸康健十四肌", "三角肌（前束）");
  assert.equal(new URL(page.url()).searchParams.get("path"), "touch-for-health");
  assert.equal(await status("觸康健檢測").textContent(), "未建");
  await testTab("觸康健檢測").click();
  assert.equal(await field("對應經絡").inputValue(), "膽經");
  await field("神經淋巴點").fill("教材的神經淋巴點");
  await card.getByRole("button", { name: "保存觸康健檢測" }).click();
  await card.getByText("觸康健檢測已保存。").waitFor();
  assert.equal(await status("觸康健檢測").textContent(), "已建");
  await openMuscle("肩", "三角肌");
  await testTab("觸康健檢測").click();
  assert.equal(await field("神經淋巴點").inputValue(), "教材的神經淋巴點");

  // 自己新增型態卡。
  await openPath("頭");
  await page.getByLabel("新的型態名稱").fill("圓肩");
  await page.getByRole("button", { name: "新增型態卡" }).click();
  await page.locator(".muscle-patterns").getByRole("link", { name: "圓肩" }).waitFor();
  await noOverflow("path list");

  // 道藏肌肉知識網絡：同一批連結。
  await page.goto(`${base}/dao/muscles`);
  await page.getByRole("heading", { level: 1, name: "肌肉知識網絡" }).waitFor();
  const synergy = page.locator(".muscle-network-links").filter({ hasText: "協同" });
  await synergy.getByText("一起上提肩胛").waitFor();
  await page.locator(".muscle-network-links").filter({ hasText: "同一個姿勢型態" }).getByText("上交叉症候群：上斜方肌偏緊、下斜方肌偏弱").waitFor();
  await page.getByLabel("只看和這張卡直接相連的").selectOption("muscle:levator-scapulae");
  assert.equal(await page.locator(".muscle-network-links li").count(), 1);
  await noOverflow("dao network");
  await synergy.getByRole("link", { name: "肩胛提肌" }).click();
  await page.locator(".muscle-card").getByRole("heading", { level: 2, name: "肩胛提肌" }).waitFor();
  await page.screenshot({ path: `${output}/muscle-card.png`, fullPage: true });

  // 紅線：畫面上沒有進度條、百分比或完成率。
  for (const url of [`${base}/practice/learning?learningItem=massage&tab=path&path=shoulder&muscle=upper-trapezius`, `${base}/dao/muscles`]) {
    await page.goto(url);
    await page.locator(".muscle-learning, .muscle-network").first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator("progress, [role=progressbar]").count(), 0);
    assert.doesNotMatch(await page.locator("main, body").first().innerText(), /\d+\s*%|完成率/);
  }
  assert.deepEqual(pageErrors, []);
  console.log("muscle-cards UI tests passed");
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => null);
  console.error("URL:", page.url());
  console.error((await page.locator("body").innerText().catch(() => "")).slice(0, 3000));
  console.error("page errors:", pageErrors);
  throw error;
} finally {
  await browser.close();
  server.stop();
}
