import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./weaving-test-harness.mjs";

const generic = {
  sourceLabel: "Town Council", ocrText: "old OCR", englishRecord: "The mayor spoke to the council.",
  chineseExplanation: "市長發言。", learningPhrases: "", vocabularyWords: "", vocabularyCandidates: [],
  confidence: "high", needsReview: false, reviewReason: "",
};
function screen(index, kind) {
  const original = kind === "interface" ? "Stand for election" : "We need your help!";
  return {
    index, kind, title: kind === "interface" ? "競選職位" : "居民求援", unit: kind === "interface" ? "選舉操作" : "理解對白",
    ocrText: original, evidence: original, labels: [{ text: original, meaning: kind === "interface" ? "參選" : "需要你的幫助" }],
    operation: kind === "interface" ? "選擇參選。" : "", restriction: "", consequence: kind === "interface" ? "可能進入候選名單。" : "",
    restrictionEvidence: "", consequenceEvidence: kind === "interface" ? original : "",
    consequenceBasis: kind === "interface" ? "inferred" : "unknown",
  };
}

async function run({ count, kinds = [], mode = "auto", route = "game", mutate = () => {}, previous = {} }) {
  const requests = [];
  let entry = {
    id: "source", route, gameLearningMode: mode, status: "inbox", analysisStatus: "idle", analysisAttempts: 0,
    estimatedCostUsd: 0, contextNote: "", attachments: Array.from({ length: count }, (_, i) => ({ blockId: "b" + (i + 1), id: i + 1 })),
    ...previous,
  };
  const load = loader({
    "./englishImageStore": {
      getEnglishImageEntry: async () => ({ entry }), listEnglishImageEntries: async () => [entry],
      englishImageAttachmentBytes: async item => ({ bytes: Uint8Array.of(item.id).buffer, mimeType: "image/png" }),
      currentMonthEstimatedSpend: () => 0, saveEnglishImageEntry: async next => (entry = next),
    },
    "./englishImageDispatch": { candidateKey: text => text.toLowerCase() },
  });
  const prior = global.fetch;
  const env = { ...process.env };
  process.env.OPENAI_API_KEY = "fixture";
  delete process.env.VOCABFORGE_INTEGRATION_URL;
  delete process.env.OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const request = JSON.parse(options.body);
      requests.push(request);
      const schema = request.text.format.schema.properties.gameScreens;
      const result = { ...generic };
      if (schema) {
        const ids = schema.items.properties.index.enum;
        const content = request.input[0].content;
        assert.equal(schema.maxItems, ids.length);
        assert.equal(schema.minItems, ids.length);
        ids.forEach((id, i) => {
          assert.equal(content[1 + i * 2].text, "原圖 " + id);
          assert.equal(Buffer.from(content[2 + i * 2].image_url.split(",")[1], "base64")[0], id);
        });
        result.gameScreens = ids.map(id => screen(id, kinds[id - 1] || "interface")).reverse();
        mutate(result, ids);
      }
      return Response.json({ output_text: JSON.stringify(result), usage: { input_tokens: 100, output_tokens: 70 } });
    };
    await load("lib/dojo/englishImageAnalysis.ts").analyzeEnglishImage(entry.id);
    return { entry, requests };
  } finally {
    global.fetch = prior;
    for (const key of ["OPENAI_API_KEY", "VOCABFORGE_INTEGRATION_URL", "OPENAI_ENGLISH_IMAGE_MONTHLY_BUDGET_USD"]) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
}

test("ten interface screenshots yield ten ordered evidence-backed operations without narrative synthesis", async () => {
  const { entry, requests } = await run({ count: 10, mode: "interface", previous: { analysisStatus: "completed" } });
  assert.equal(requests.length, 2);
  assert.match(requests[0].input[0].content[0].text, /使用者選了介面學習/);
  assert.equal(entry.analysisStatus, "completed");
  assert.equal(entry.gameLearning.kind, "interface");
  assert.deepEqual(entry.gameLearning.screens.map(s => s.index), Array.from({ length: 10 }, (_, i) => i + 1));
  assert.equal(entry.gameLearning.screens[0].consequence, "依畫面推測：可能進入候選名單。");
  assert.equal(entry.gameLearning.screens[0].restriction, "");
  assert.match(entry.ocrText, /【圖 10】\nStand for election/);
  assert.doesNotMatch(entry.englishRecord, /mayor/);
  assert.match(entry.chineseExplanation, /競選職位/);
  assert.equal(entry.gameLearningSourceIds[9], "b10");
});

test("missing, duplicate and cross-batch screen identities cannot produce a completed lesson", async () => {
  for (const corrupt of [
    result => result.gameScreens.pop(),
    result => { result.gameScreens[0].index = result.gameScreens[1].index; },
    result => { result.gameScreens[0].index = 999; },
  ]) {
    const { entry } = await run({ count: 2, mutate: corrupt });
    assert.equal(entry.analysisStatus, "failed");
    assert.equal(entry.gameLearning, undefined);
  }
});

test("ungrounded labels and mechanical claims stay out of screen records and trigger review", async () => {
  const { entry } = await run({ count: 1, mutate(result) {
    const s = result.gameScreens[0];
    s.evidence = "Deposit 500 gold";
    s.labels.push({ text: "Deposit 500 gold", meaning: "付押金" });
    s.restriction = "必須先付 500 金幣。";
    s.restrictionEvidence = "Stand for election"; // The label does not substantiate the invented price.
    s.consequenceEvidence = "Receive 50 votes";
  } });
  assert.equal(entry.analysisStatus, "needs-review");
  assert.equal(entry.gameLearning.screens[0].evidence, "");
  assert.equal(entry.gameLearning.screens[0].restriction, "");
  assert.equal(entry.gameLearning.screens[0].consequence, "");
  assert.doesNotMatch(entry.chineseExplanation, /500/);
});

test("dialogue uses the existing narrative, mixed sets retain each source, and non-game uses its original format", async () => {
  const story = await run({ count: 6, mode: "story", kinds: Array(6).fill("story") });
  assert.equal(story.requests.length, 3);
  assert.match(story.requests[0].input[0].content[0].text, /使用者選了劇情與對白/);
  assert.equal(story.entry.gameLearning.kind, "story");
  assert.equal(story.entry.englishRecord, generic.englishRecord);
  assert.match(story.entry.ocrText, /【圖 6】\nWe need your help!/);
  const mixed = await run({ count: 2, kinds: ["story", "interface"] });
  assert.equal(mixed.entry.gameLearning.kind, "mixed");
  assert.match(mixed.entry.englishRecord, /#1 We need your help!/);
  const daily = await run({ count: 1, route: "daily" });
  assert.equal(daily.requests[0].text.format.schema.properties.gameScreens, undefined);
  assert.equal(daily.entry.englishRecord, generic.englishRecord);
});
