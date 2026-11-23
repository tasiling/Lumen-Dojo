// 野採淬鍊：DB-14 淬鍊紀錄的建立、設定、貼回與檢查、候選挑選、結束、規則，及前綴限縮。Notion 為測試替身。
import assert from "node:assert/strict";
import { fixture } from "./weaving-fixture.mjs";

const f = await fixture();
// The shared fixture has no title lookup; rounds and the rules record are read by exact title.
f.queries.findKnowledgeEntryByTitle = async title => {
  const hit = [...f.records].find(([, row]) => row.title === title && !row.archived);
  return hit ? { id: hit[0], 標題: hit[1].title, 內容: JSON.stringify(hit[1].value) } : null;
};
try {
  const route = f.load("app/api/dojo/refine/route.ts");
  const captures = f.load("app/api/dojo/captures/route.ts");
  const { REFINE_FORMAT, REFINE_DEFAULT_RULES } = f.load("lib/dojo/captureRefine.ts");
  const { captureOriginal, fitRefineRecord, refineLeftOut } = f.load("lib/dojo/refineRecord.ts");
  const { normalizeCaptureEntry } = f.load("lib/dojo/formal.ts");
  const call = async (method, body, query = "") => {
    const response = await route[method](f.req(method, "/api/dojo/refine" + query, method === "POST" ? body : null));
    return { status: response.status, body: await response.json() };
  };
  const post = body => call("POST", body);
  const make = async (title, extra) => (await (await captures.POST(f.req("POST", "/api/dojo/captures", { title, sourceUrl: "", ...extra }))).json()).capture.id;

  // 原文判定：貼文、逐字稿、摘錄、網頁摘要、沒有原文、連成一行。
  const entry = (clip, excerpt = "") => normalizeCaptureEntry({ title: "t", excerpt, status: "pending", clip: { origin: "line", ...clip } }, { id: "x" });
  assert.equal(captureOriginal(entry({})).state, "none");
  const threads = captureOriginal(entry({ threadsPost: { text: "第一段\n第二段", canonicalUrl: "https://www.threads.com/@demo.user/post/Ab1", partial: false } }));
  assert.deepEqual([threads.kind, threads.author, threads.state], ["貼文", "@demo.user", "ok"]);
  assert.equal(captureOriginal(entry({ threadsPost: { text: "預覽", canonicalUrl: "", partial: true } })).state, "partial");
  const both = captureOriginal(entry({ threadsPost: { text: "貼文", canonicalUrl: "", partial: false }, transcript: { text: "逐字稿", finishedAt: "2026-11-01T00:00:00.000Z", truncated: false } }));
  assert.deepEqual([both.kind, both.text], ["貼文＋逐字稿", "貼文\n\n〔影片逐字稿〕\n逐字稿"]);
  assert.equal(captureOriginal(entry({ webPreview: { description: "網頁說明", imageUrl: "", fetchedAt: null, status: "ready" } }, "網頁說明")).state, "partial");
  const oneLine = "很多人把焦慮當成燃料，覺得不緊張就不會動。可是燃料燒完之後，留下來的是一台過熱的引擎。所以我開始練習在結束之後真的停下來，讓身體知道危險已經過去了。這件事比想像中難，因為停下來的時候反而會更焦慮，好像自己落後了別人一大截。";
  assert.equal(captureOriginal(entry({}, oneLine)).state, "unsegmented");

  const c1 = await make("焦慮是燃料", { excerpt: "很多人把焦慮當成燃料，覺得不緊張就不會動。\n可是燃料燒完之後，留下來的是一台過熱的引擎。" });
  const c2 = await make("停下來", { excerpt: "我不同意把焦慮說成一無是處。\n問題不在有沒有壓力，而在壓力結束之後，你有沒有讓自己真的停下來。" });
  const empty = await make("只有網址", { sourceUrl: "https://example.com/a" });
  const left = await make("沒帶入的那則", { excerpt: "另一個說法。" });

  // 未授權、設定不完整、沒有原文：都不建立。
  assert.equal((await route.POST(f.req("POST", "/api/dojo/refine", { action: "create" }, false))).status, 401);
  const before = f.records.size;
  assert.equal((await post({ action: "create", topic: " ", angle: "understand", captureIds: [c1] })).status, 400);
  assert.equal((await post({ action: "create", topic: "焦慮", angle: "nope", captureIds: [c1] })).status, 400);
  assert.equal((await post({ action: "create", topic: "焦慮", angle: "understand", captureIds: [] })).status, 400);
  assert.equal((await post({ action: "create", topic: "焦慮", angle: "understand", captureIds: [c1, c1] })).status, 400);
  assert.equal((await post({ action: "create", topic: "焦慮", angle: "understand", captureIds: [c1, c2, left, c1 + "a", c2 + "b", "x"] })).status, 400);
  const noText = await post({ action: "create", topic: "焦慮", angle: "understand", captureIds: [c1, empty] });
  assert.deepEqual([noText.status, /沒有原文/.test(noText.body.error)], [422, true]);
  assert.equal(f.records.size, before, "nothing is written when setup is refused");

  // 建立：DB-14 標題前綴、只存段落數與雜湊、討論包含逐段編號。
  const created = await post({ action: "create", topic: "焦慮能不能幫助一個人努力？", angle: "understand", captureIds: [c1, left], offeredCaptureIds: [c1, c2, left] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.record.id;
  assert.match(id, /^YC-\d{8}-[0-9A-Z]{4}$/);
  const row = [...f.records.values()].find(r => r.title === "行光淬鍊-" + id);
  assert.ok(row, "stored in DB-14 under the round prefix");
  assert.deepEqual(row.value.sources.map(s => [s.label, s.captureId, s.paragraphCount]), [["C1", c1, 2], ["C2", left, 1]]);
  assert.ok(row.value.sources.every(s => /^[0-9a-f]{64}$/.test(s.textHash) && !("text" in s)), "no full text in the round");
  assert.match(created.body.package, new RegExp(`討論包ID：${id}`));
  assert.match(created.body.package, /C1-P2｜可是燃料燒完之後/);

  // 設定可以在貼回前更改；移除的素材記為未帶入。
  const configured = await post({ action: "configure", id, topic: "焦慮能不能幫助一個人努力？", angle: "craft", captureIds: [c1, c2] });
  assert.equal(configured.status, 200);
  assert.deepEqual(configured.body.record.sources.map(s => s.captureId), [c1, c2]);
  assert.deepEqual(refineLeftOut(configured.body.record), [left]);
  assert.match(configured.body.package, /【出題角度：換個角度與看手法】/);

  // 查詢以前綴限縮：素材頁反查參與過的淬鍊。
  const queried = [];
  const listByPrefix = f.queries.listKnowledgeEntriesByPrefix;
  f.queries.listKnowledgeEntriesByPrefix = async prefix => { queried.push(prefix); return listByPrefix(prefix); };
  assert.deepEqual((await call("GET", null, "?captureId=" + c2)).body.rounds.map(r => r.id), [id]);
  assert.deepEqual((await call("GET", null, "?captureId=" + left)).body.rounds, []);
  assert.deepEqual(queried, ["行光淬鍊-", "行光淬鍊-"]);
  f.queries.listKnowledgeEntriesByPrefix = listByPrefix;

  // 貼回：別輪的紀錄不予保存；缺區塊不保存並給補救指令；完整時保存並附檢查。
  const header = (bid = id, labels = "C1,C2") => [`===${REFINE_FORMAT}===`, `討論包ID：${bid}`, `採集：${labels}`];
  const body = [
    "===逐字問答===", "T1｜GPT", "「很多人把焦慮當成燃料」，你有過這種時候嗎？", "T2｜我", "有。那種緊繃會讓我動起來，可是做完之後我會累到兩三天都不想碰任何東西。",
    "T3｜GPT", "C2 說問題在有沒有停下來，你怎麼看？", "T4｜我", "我很少真的停下來，休息時腦子還在跑。",
    "===原文引用===", "C1-P1｜很多人把焦慮當成燃料，覺得不緊張就不會動。", "C2-P1｜問題不在有沒有壓力", "C1-P2｜燃料燒光以後只剩下過熱的機器。",
    "===候選===",
    "#1｜洞察｜T2", "回應原文：C1-P1", "原話：做完之後我會累到兩三天都不想碰任何東西。", "整理版：焦慮讓我動起來，但事後我會累到兩三天不想碰任何東西。",
    "#2｜觀點｜T4", "回應原文：C2-P2", "原話：我從來不會真的停下來。", "整理版：我很少真正停下來。",
    "#3｜手法觀察｜T3", "回應原文：C2-P1", "原話：用對比開場。", "整理版：",
    "===GPT延伸===", "- 這是我的推論，尚未由本人確認。",
    "===待查證===", "- C1-P2：過熱的說法尚待查證。",
    "===未回答===", "- 不用緊繃的話，用什麼方式開始？",
    "===結束===",
  ];
  const other = await post({ action: "return", id, raw: [...header("YC-20200101-AAAA"), ...body].join("\n") });
  assert.deepEqual([other.status, other.body.saved, other.body.checks.idOk], [200, false, false]);
  const partial = await post({ action: "return", id, raw: [...header(), ...body.slice(0, body.indexOf("===候選==="))].join("\n") });
  assert.equal(partial.body.saved, false);
  assert.ok(partial.body.checks.missing.includes("候選") && partial.body.checks.missing.includes("GPT延伸"));
  assert.match(partial.body.rescue, /缺少這些區塊：候選、GPT延伸、待查證、未回答/);
  assert.equal((await call("GET", null, "?id=" + id)).body.record.status, "open", "an incomplete return is not saved as returned");

  const returned = await post({ action: "return", id, raw: "```\n" + [...header(), ...body].join("\n") + "\n```" });
  assert.equal(returned.body.saved, true);
  const record = returned.body.view.record;
  assert.equal(record.status, "returned");
  assert.deepEqual(record.checks.quotes.map(q => q.ok), [true, true, false]);
  assert.match(record.checks.quotes[2].note, /最接近的段落是 C1-P2/);
  assert.deepEqual(record.checks.words.map(w => w.ok), [true, false, false]);
  assert.match(record.checks.words[2].note, /GPT 的發言/);
  assert.deepEqual([record.extensions.length, record.toVerify.length, record.unanswered.length], [1, 1, 1]);
  assert.equal(record.turns.length, 4);

  // 候選挑選：逐字通過的可用原話或整理版；沒通過的只能改寫；取消挑選。
  const pick = (candidateN, titleFrom, title = "") => post({ action: "pick", id, candidateN, titleFrom, title });
  assert.equal((await pick(1, "原話")).body.record.picks[0].title, "做完之後我會累到兩三天都不想碰任何東西。");
  assert.equal((await pick(1, "整理版")).body.record.picks[0].titleFrom, "整理版");
  const refused = await pick(2, "原話");
  assert.deepEqual([refused.status, /只能由你自己改寫/.test(refused.body.error)], [422, true]);
  assert.equal((await pick(2, "改寫", " ")).status, 422);
  let picked = (await pick(2, "改寫", "我需要學會真的停下來。")).body.record.picks;
  assert.deepEqual(picked.map(p => [p.candidateN, p.titleFrom]), [[1, "整理版"], [2, "改寫"]]);
  picked = (await post({ action: "pick", id, candidateN: 1, titleFrom: null })).body.record.picks;
  assert.deepEqual(picked.map(p => p.candidateN), [2]);
  assert.equal((await pick(9, "改寫", "x")).status, 422);
  assert.equal((await post({ action: "pick", id, candidateN: 1, titleFrom: "隨便" })).status, 400);
  assert.equal((await post({ action: "configure", id, topic: "改題目", angle: "understand", captureIds: [c1] })).status, 409, "setup is fixed once returned");

  // 原文在討論之後變動：提示，不擋讀取。
  await f.load("lib/dojo/captureStore.ts").updateCaptureEntry(c1, () => ({ excerpt: "改過的原文。" }));
  assert.deepEqual((await call("GET", null, "?id=" + id)).body.changed, ["C1"]);

  // 結束這一輪後唯讀。
  assert.equal((await post({ action: "close", id })).body.record.status, "closed");
  assert.equal((await pick(1, "原話")).status, 409);
  assert.equal((await post({ action: "return", id, raw: [...header(), ...body].join("\n") })).status, 409);

  // 討論規則：預設、保存、清空回到預設；設定紀錄不會被當成一輪。
  assert.deepEqual((await call("GET", null, "")).body.rules, REFINE_DEFAULT_RULES);
  assert.deepEqual((await post({ action: "rules", rules: ["只問一題。", " ", "逐字引用。"] })).body.rules, ["只問一題。", "逐字引用。"]);
  assert.match((await call("GET", null, "?id=" + id)).body.package, /- 只問一題。\n- 逐字引用。/);
  assert.ok([...f.records.values()].some(r => r.title === "行光淬鍊設定-討論規則"));
  assert.deepEqual((await call("GET", null, "?captureId=" + c2)).body.rounds.length, 1);
  assert.deepEqual((await post({ action: "rules", rules: [] })).body.rules, REFINE_DEFAULT_RULES);
  assert.equal((await post({ action: "rules", rules: "x" })).status, 400);
  assert.equal((await call("GET", null, "?id=bad")).status, 400);
  assert.equal((await call("GET", null, "?id=YC-20200101-ZZZZ")).status, 404);

  // 長度：超過單一欄位時先略去 GPT 發言，再略去沒被候選引用的本人發言；仍放不下就不保存。
  const long = { ...record, turns: [
    { n: 1, who: "GPT", text: "問".repeat(120000) }, { n: 2, who: "我", text: "答".repeat(1000) },
    { n: 3, who: "我", text: "長".repeat(100000) }, { n: 4, who: "我", text: "引用".repeat(10) },
  ], candidates: [{ ...record.candidates[0], turn: 4 }] };
  const fitted = fitRefineRecord(long);
  assert.deepEqual(fitted.omitted, { gptTurns: true, ownerTurns: [] });
  assert.equal(fitted.turns[0].text, "");
  const tighter = fitRefineRecord(long, 60000);
  assert.deepEqual(tighter.omitted.ownerTurns, [3]);
  assert.equal(tighter.turns.find(t => t.n === 4).text, "引用".repeat(10), "a cited turn is kept");
  assert.equal(fitRefineRecord(long, 500), null);

  console.log("PASS refine rounds: setup checks, DB-14 prefix, package, configure, return checks, picks, close, rules, size limit");
} finally {
  await f.close();
}
