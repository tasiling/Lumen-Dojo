import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as next from "next/server.js";
import { fixture } from "./weaving-fixture.mjs";

Object.assign(process.env, { LINE_CHANNEL_SECRET: "game-test", LINE_ALLOWED_USER_ID: "owner" });
const after = [], replies = [], selected = [];
const item = { id: "game-card", title: "原圖", route: "pending", attachments: [{}, {}], englishRecord: "An actual story.", analysisStatus: "completed" };
const interfaceScreen = {
  index: 1, kind: "interface", title: "裝備", labels: [{ text: "Equip", meaning: "裝備" }],
  operation: "選取護甲後按 Equip。", restriction: "Requires level 10 表示需要達到十級。",
  consequence: "裝備後可能提高防禦力。", evidence: "按鈕上寫著 Equip。", unit: "equip a shield",
};
const storyScreen = { index: 2, kind: "story", title: "村長的請託", labels: [{ text: "Find my ring", meaning: "找回我的戒指" }], evidence: "說話者是村長。", unit: "find my ring" };
let automatic = "mixed";
const f = await fixture({
  "next/server": { ...next, after: fn => after.push(fn) },
  "@/lib/dojo/lineImageBatch": { withLineImageBatchLock: async (_user, task) => task(), readLineImageBatch: async () => null },
  "@/lib/dojo/englishImageStore": {
    getEnglishImageEntry: async () => ({ entry: { ...item } }),
    routeEnglishImage: async (entry, route, mode) => {
      selected.push(mode); Object.assign(item, { route, gameLearningMode: mode || "auto" }); return { ...entry, ...item };
    },
  },
  "@/lib/dojo/englishImageAutoUnit": { autoBuildContextUnit: async () => { throw Error("fixture has no context room"); } },
  "@/lib/dojo/englishImageAnalysis": { analyzeEnglishImage: async () => {
    const kind = item.gameLearningMode === "auto" ? automatic : item.gameLearningMode;
    return { ...item, gameLearning: { kind, screens: kind === "mixed" ? [storyScreen, interfaceScreen] : kind === "story" ? [storyScreen] : [interfaceScreen] } };
  } },
  "@/lib/dojo/lineClipping": () => ({ ...f.load("lib/dojo/lineClipping.ts"),
    replyLineMessage: async (_, text, buttons, event) => replies.push({ text, buttons, event }),
  }),
});
try {
  async function click(data) {
    const event = { type: "postback", source: { type: "user", userId: "owner" }, webhookEventId: "e-" + replies.length, replyToken: "r", postback: { data } };
    const body = JSON.stringify({ events: [event] });
    const signature = createHmac("sha256", "game-test").update(body).digest("base64");
    const response = await f.load("app/api/integrations/line/webhook/route.ts").POST(new next.NextRequest("https://dojo.example/line", {
      method: "POST", body, headers: { "x-line-signature": signature },
    }));
    assert.equal(response.status, 200); await after.shift()();
    assert.equal(replies.at(-1).event.webhookEventId, event.webhookEventId);
    return replies.at(-1);
  }

  const line = f.load("lib/dojo/lineClipping.ts");
  const choices = line.imageDraftQuickReply(item.id).items.map(button => button.action);
  assert.ok(choices.length <= 13);
  const data = label => choices.find(option => option.label === label).data;
  const legacy = await click("action=imageRoute&entryId=game-card&route=game");
  assert.equal(selected.at(-1), undefined);
  assert.match(legacy.text, /遊戲介面與劇情/);
  assert.match(legacy.text, /圖 1｜裝備[\s\S]+圖 2｜村長的請託/);
  assert.doesNotMatch(legacy.text, /An actual story/);
  assert.match(legacy.text, /Find my ring → 找回我的戒指/);
  const overrides = legacy.buttons.items.map(i => i.action.label);
  assert.ok(overrides.includes("遊戲介面學習") && overrides.includes("遊戲劇情／對白"));
  const ui = await click(data("遊戲介面學習"));
  assert.equal(selected.at(-1), "interface");
  for (const expected of ["Equip → 裝備", interfaceScreen.operation, interfaceScreen.restriction, "可能結果：" + interfaceScreen.consequence, interfaceScreen.evidence, interfaceScreen.unit]) {
    assert.ok(ui.text.includes(expected), expected);
  }
  const story = await click(data("遊戲劇情／對白"));
  assert.equal(selected.at(-1), "story");
  assert.match(story.text, /英文事件紀錄[\s\S]+An actual story/);
  automatic = "interface";
  const again = await click(data("遊戲（自動判讀）"));
  assert.equal(selected.at(-1), "auto");
  assert.match(again.text, /圖 1｜裝備/);
  const reanalysis = await click("action=imageAnalyze&entryId=game-card");
  assert.match(reanalysis.text, /圖 1｜裝備/);
  assert.ok(line.englishImageOrganizeQuickReply(item.id, "reading").items.every(i => !i.action.label.includes("遊戲")));
  const web = f.load("app/api/dojo/english-images/route.ts");
  for (const mode of [undefined, "auto", "interface", "story"]) {
    const response = await web.POST(f.req("POST", "/api/dojo/english-images", { action: "routeAndAnalyze", id: item.id, route: "game", gameLearningMode: mode }));
    assert.equal(response.status, 200);
    assert.equal(selected.at(-1), mode);
    assert.equal((await response.json()).entry.gameLearning.kind, mode === "story" ? "story" : "interface");
  }
  const calls = selected.length;
  for (const [route, mode] of [["game", "guess"], ["reading", "interface"]]) {
    const response = await web.POST(f.req("POST", "/api/dojo/english-images", { action: "routeAndAnalyze", id: item.id, route, gameLearningMode: mode }));
    assert.equal(response.status, 400);
  }
  assert.equal(selected.length, calls);
  console.log("PASS signed LINE and web game actions, automatic mixed classification, indexed interface teaching, story summary, explicit overrides and reanalysis");
} finally {
  await f.close();
}
