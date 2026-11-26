// 織光堂：並讀選卡三類、織光杼討論頁帶入的卡片與「這輪的讀法」。
// 不需要 playwright：以靜態檔與記憶體 API 開啟織光堂，透過 Chrome DevTools Protocol 操作。
// 執行：node scripts/test-weaving-pair-finder-ui.mjs（需要本機 Chrome；可用 CHROME=路徑 指定）
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const studioDir = join(root, "public/weaving-studio");
const documentSource = await readFile(join(root, "lib/dojo/weavingStudio/document.ts"), "utf8");
const scripts = [...documentSource.match(/const scripts = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
assert.ok(scripts.includes("pair-finder"), "pair-finder.js 要載入織光堂");
const styles = ["style", "card-box", "studio-layout", "production"];
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(s => `<link rel="stylesheet" href="/weaving-studio/${s}.css">`).join("")}${scripts.map(s => `<script defer src="/weaving-studio/${s}.js"></script>`).join("")}</head><body data-home="home"><div id="top"></div><main id="main"></main><div id="bottom"></div><dialog id="dialog"></dialog><div id="notice"></div><aside id="saveNotice"></aside></body></html>`;

const card = (id, title, type, quote, extra = {}) => ({ id, title, type, idea: title, quote, source: "測試來源", location: "", author: "本人原話", quoteLabel: "我的原話", sourceKey: id, context: quote, url: "", ...extra });
const anchor = card("awareness:r1:0", "分享時的起心動念，決定那是不是炫耀", "覺察", "我會形容自己炫耀的話，應該是因為我在分享的時候，我的起心動念是想被看見。");
const cards = [
  anchor,
  card("discussion:m:1", "成果好壞不能只歸因於逼迫自己", "觀點", "而實際上一個人的成果好壞，絕對不是只靠逼迫自己而已。", { source: "Magic Shop", location: "焦慮與努力 · T2", author: "本人發言，已確認", quoteLabel: "我的發言", sourceKey: "m" }),
  card("discussion:m:2", "焦慮短期有用，長期會失衡", "觀點", "短期來看是很好的衝刺，但長時間用這個模式，卻會造成身心的失衡。", { source: "Magic Shop", location: "焦慮與努力 · T2", author: "本人發言，已確認", quoteLabel: "我的發言", sourceKey: "m" }),
  card("insight:share", "分享的起心動念值得被看見", "洞察", "分享自己的成果時，起心動念如果是想幫上別人，就不是炫耀。", { source: "野採淬鍊" }),
  card("manual:book", "被看見的需要", "觀點", "人都需要被看見，這不是需要被羞愧的事。", { source: "某本書", author: "本人確認的閱讀卡", quoteLabel: "書中原文", sourceKey: "book" }),
];

let records = {}, revision = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/weaving/studio") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return; }
  if (url.pathname === "/api/dojo/weaving-studio") {
    if (req.method === "PATCH") {
      let body = ""; for await (const chunk of req) body += chunk;
      const values = {};
      for (const c of JSON.parse(body).changes) { if (c.after === null) delete records[c.key]; else records[c.key] = c.after; values[c.key] = c.after; }
      revision++; json({ revision, values }); return;
    }
    const list = url.searchParams.get("list");
    if (list === "cards") return json({ cards });
    if (list === "catalog") return json({ works: [], topics: [] });
    if (list === "media") return json({ works: [] });
    return json({ revision, records });
  }
  if (url.pathname === "/api/dojo/dao-questions") return json({ questions: [] });
  const file = normalize(join(root, "public", url.pathname));
  if (file.startsWith(studioDir) && existsSync(file)) {
    const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": (types[extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(await readFile(file)); return;
  }
  res.writeHead(404); res.end("{}");
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromePath = process.env.CHROME || ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
assert.ok(chromePath, "找不到 Chrome，請用 CHROME=路徑 指定");
const profile = await mkdtemp(join(tmpdir(), "pair-finder-"));
const chrome = spawn(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let port;
for (let i = 0; i < 100 && !port; i++) {
  try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { await new Promise(r => setTimeout(r, 100)); }
}
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let seq = 0; const waiting = new Map(), errors = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; waiting.set(id, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
async function run(expression) {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const wait = async (expression, label) => {
  for (let i = 0; i < 80; i++) { if (await run(`return !!(${expression})`)) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("逾時：" + label);
};
const text = () => run("return document.querySelector('main').innerText");
const click = (label, scope = "document") => run(`const b=[...${scope}.querySelectorAll('button')].find(b=>b.innerText.trim()===${JSON.stringify(label)}||b.querySelector('b')?.innerText.trim()===${JSON.stringify(label)});if(!b)throw Error('找不到按鈕：'+${JSON.stringify(label)});b.click();`);
const settle = () => run("await flush().catch(()=>{});");
const shot = async name => {
  if (!process.env.SHOT_DIR) return;
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(process.env.SHOT_DIR, name + ".png"), Buffer.from(data, "base64"));
};

try {
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${base}/weaving/studio#cards/-/${anchor.id}` });
  try { await wait("typeof catalogs!=='undefined'&&catalogs.cards==='ready'&&document.querySelector('.pair-group')", "並讀選卡頁"); } catch (e) { console.log(errors, await run("return document.body.innerText.slice(0,500)+' '+location.href").catch(x=>x.message)); throw e; }

  // 三類分區；相近先由用字比對找出，相反與不同切角要等 GPT。
  let page = await text();
  for (const name of ["相近", "相反", "不同切角"]) assert.match(page, new RegExp(name));
  const near = await run("return [...document.querySelectorAll('.pair-group[data-relation=\"相近\"] .row b')].map(b=>b.innerText)");
  assert.ok(near.includes("分享的起心動念值得被看見"), "用字相近的卡要列在相近：" + near);
  assert.ok(!near.includes("成果好壞不能只歸因於逼迫自己"), "沒有共同用字的卡不該出現在相近");
  assert.match(page, /請 GPT 讀過原句之後，候選會出現在這裡/);
  assert.deepEqual(await run("return [...document.querySelectorAll('#cardKind option')].map(o=>o.textContent)"), ["全部", "觀點", "洞察", "覺察"]);
  assert.equal(await run("return document.documentElement.scrollWidth<=innerWidth"), true, "手機寬度不得橫向溢出");

  // GPT 依三類找卡：核對引文，再帶回候選。
  await click("請 GPT 依三類找卡");
  await wait("document.getElementById('pairFinderPacket')", "討論包");
  const packet = await run("return document.getElementById('pairFinderPacket').value");
  assert.match(packet, /並讀選卡\/v1/); assert.match(packet, /不同切角/); assert.match(packet, /不要替我詮釋動機/);
  assert.ok(!packet.includes('"id":"' + anchor.id + '","title"') || packet.indexOf(anchor.id) < packet.indexOf("【第 1／1 批】"), "主卡不該出現在待比對的批次裡");
  const envelope = JSON.parse(packet.slice(packet.lastIndexOf("{\n")));
  const reply = matches => JSON.stringify({ ...envelope, matches });
  await run(`const el=document.getElementById('pairFinderReturn');el.value=${JSON.stringify(reply([{ cardId: "discussion:m:1", relation: "不同切角", reason: "主卡談分享時的動機，這張談成果的歸因，都在問做事背後的動機。", quote: "絕對不是只靠逼迫自己", anchorQuote: "起心動念是想被看見" }]).replace("絕對不是只靠逼迫自己", "完全不是逼迫"))};`);
  await click("核對並帶回候選", "document.getElementById('dialog')");
  assert.match(await run("return document.getElementById('pairFinderError').textContent"), /引文和這張卡的原句不符/);
  await run(`const el=document.getElementById('pairFinderReturn');el.value=${JSON.stringify("```json\n" + reply([
    { cardId: "discussion:m:1", relation: "不同切角", reason: "主卡談分享時的動機，這張談成果的歸因，都在問做事背後的動機。", quote: "絕對不是只靠逼迫自己", anchorQuote: "起心動念是想被看見" },
    { cardId: "manual:book", relation: "相反", reason: "主卡把想被看見當成炫耀的訊號，這張認為被看見的需要不必羞愧。", quote: "這不是需要被羞愧的事", anchorQuote: "" },
  ]) + "\n```")};`);
  await click("核對並帶回候選", "document.getElementById('dialog')");
  await wait("!document.getElementById('dialog').open", "帶回候選");
  page = await text();
  const group = name => run(`return [...document.querySelectorAll('.pair-group[data-relation="${name}"] .row b')].map(b=>b.innerText)`);
  assert.deepEqual(await group("不同切角"), ["成果好壞不能只歸因於逼迫自己"]);
  assert.deepEqual(await group("相反"), ["被看見的需要"]);
  assert.match(page, /GPT 已核對 1／1 批/);
  await shot("pair-finder");
  await settle();
  assert.ok(Object.keys(records).some(k => k.startsWith("review:pair-")), "GPT 候選要保存，重新整理後仍在");

  // 從候選開始並讀：顯示候選關係，關係由本人選定後保存。
  await run(`[...document.querySelectorAll('.pair-group[data-relation="相反"] .row')][0].click()`);
  await wait("location.hash.startsWith('#compare/')", "並讀頁");
  page = await text();
  assert.match(page, /GPT 的候選：相反/); assert.match(page, /這只是候選/);
  assert.equal(await run("return document.getElementById('pairRelation').value"), "", "關係不預先替本人選定");
  await run(`const s=document.getElementById('pairRelation');s.value='相反';s.dispatchEvent(new Event('input',{bubbles:true}));
    const r=document.getElementById('pairReason');r.value='一張說想被看見是炫耀，一張說被看見的需要不必羞愧。';r.dispatchEvent(new Event('input',{bubbles:true}));`);
  await click("保存這段整理");
  await wait("location.hash.startsWith('#reading/')", "已保存的整理");
  assert.match(await text(), /相反/);
  await shot("saved-reading");
  await settle();
  const saved = Object.entries(records).find(([k]) => k.startsWith("reading:"))[1];
  assert.equal(saved.saved.relation, "相反");

  // 從主卡立新杼，進討論頁：帶入的卡片在最上面，其他卡依關聯排序，看得到這輪的讀法。
  await run(`location.hash='card/${anchor.id}'`);
  await wait("document.querySelector('.card-source-actions')", "卡片頁");
  await click("從這張卡立新杼");
  await wait("location.hash.startsWith('#forge/')", "立杼頁");
  const fid = await run("return args[0]");
  await run(`const t=document.getElementById('sfTitle');t.value='自我覺察－內在的炫耀感';t.dispatchEvent(new Event('input',{bubbles:true}));`);
  await run(`location.hash='discussion/${fid}'`);
  await wait("document.querySelector('.forge-cards')", "討論頁");
  page = await text();
  assert.ok(page.indexOf("這把杼帶入的卡片（1 張）") < page.indexOf("這輪想釐清什麼"), "帶入的卡片要在討論表單最上面");
  assert.match(page, /分享時的起心動念，決定那是不是炫耀/);
  assert.match(page, /這輪的讀法：讀書搭子/);
  assert.match(page, /這次只帶了一張卡：先看懂這張卡在回答什麼問題/);
  assert.match(page, /你自己說過的話：看懂的是你當時在意什麼/);
  const picks = await run("return [...document.querySelectorAll('#forgeMaterials .forge-pick b')].map(b=>b.textContent)");
  assert.equal(picks[0], "分享的起心動念值得被看見", "和帶入的卡用字相近的排在最前面：" + picks);
  assert.ok(!picks.includes(anchor.title), "已帶入的卡不重複列在挑選清單");
  assert.equal(await run(`return JSON.parse([...document.querySelectorAll('.forge-cards button')].find(b=>b.innerText==='找可以並讀的卡').dataset.args)[0]`), "cards/" + fid + "/" + anchor.id, "帶入的卡可以直接去找並讀的卡");

  await run(`const s=document.getElementById('sfTask');s.value='整理我的經線';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.match(await run("return document.getElementById('sfMethod').innerText"), /拆書計畫/);
  await run(`const s=document.getElementById('sfTask');s.value='釐清想持續探討的題目';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));`);

  // 再帶進一張書摘卡：讀法換成共同問題，並加上書摘的看懂方式。
  await run(`[...document.querySelectorAll('#forgeMaterials .forge-pick')].find(e=>e.querySelector('b').textContent==='被看見的需要').querySelector('button').click()`);
  await wait("document.querySelector('.forge-cards h3')?.innerText.includes('2 張')", "帶入第二張卡");
  const method = await run("return document.getElementById('sfMethod').innerText");
  assert.match(method, /這次帶了 2 張卡：先定出一個每張卡都在回答的共同問題/);
  assert.match(method, /書摘或別人的說法：先看懂作者在談什麼/);
  assert.equal(await run("return document.documentElement.scrollWidth<=innerWidth"), true, "討論頁手機寬度不得橫向溢出");

  await run("document.querySelectorAll('#forgeMaterials details').forEach(d=>d.open=true)");
  await shot("forge-discussion");
  await click("產生討論包");
  await wait("document.getElementById('sfPacket')", "織光杼討論包");
  const forgePacket = await run("return document.getElementById('sfPacket').value");
  assert.match(forgePacket, /【本輪使用的方法：讀書搭子/);
  assert.match(forgePacket, /定出一個「共同問題」/);
  assert.match(forgePacket, /不是作者的文字/);
  assert.match(forgePacket, /K1｜覺察｜分享時的起心動念/);
  assert.match(forgePacket, /K2｜觀點｜被看見的需要/);
  assert.match(forgePacket, /我這輪選擇的範圍：帶入的卡片、我的想法/);
  assert.equal((forgePacket.match(/我會形容自己炫耀的話/g) || []).length, 1, "卡片原句只放一次");
  assert.match(await run("return document.getElementById('dialog').innerText"), /這輪的讀法：讀書搭子/);

  // 作品的 A／B 對話框：已選用的卡、這把杼的卡在前，其他卡片依關聯排序，看不出關聯的收起來。
  await run(`document.getElementById('dialog').close();
    const s={id:'sh-test',title:'自我覺察－內在的炫耀感',core:'',dirs:[],notes:[],coreVersions:[],cardUses:[{cardId:${JSON.stringify(anchor.id)},entryId:${JSON.stringify(anchor.id)},note:''}]};
    state.shuttles.unshift(s);
    const w=newWork('text');w.shuttle=s.id;w.title='炫耀與分享';keep(w);go('edit/'+w.id);openDiamond(w,'A');`);
  await wait("document.getElementById('dialog').open", "診斷草稿對話框");
  const dialog = await run("return document.getElementById('dialog').textContent");
  assert.match(dialog, /這把杼的其他卡片（1 張）/);
  assert.ok(dialog.indexOf("這把杼的其他卡片") < dialog.indexOf("從其他卡片挑選"), "這把杼的卡要排在其他卡片前面");
  const others = await run("return [...document.querySelectorAll('#dialog details')].find(d=>d.querySelector(':scope>summary').textContent==='從其他卡片挑選').textContent");
  assert.ok(others.indexOf("分享的起心動念值得被看見") < others.indexOf("看不出關聯"), "用字相近的卡排在前面");
  assert.match(others, /其他卡片（看不出關聯，2 張）/);
  assert.ok(others.indexOf("看不出關聯") < others.indexOf("成果好壞不能只歸因"), "沒有共同用字的卡收在後面");
  await run(`document.querySelectorAll('#dialog details').forEach(d=>d.open=true);
    [...document.querySelectorAll('#dialog .entry')].find(e=>e.querySelector('b')?.textContent==='分享的起心動念值得被看見').querySelector('button').click();`);
  assert.match(await run("return document.getElementById('diaScratch').value"), /分享自己的成果時/);
  await shot("work-materials");

  // A 完成後開 B：A 的草稿、診斷與確認的意圖都要接著出現，診斷可附進 B 的指令。
  await run("document.getElementById('dialog').close();const w=newWork('text');keep(w);go('edit/'+w.id);openDiamond(w,'A');document.getElementById('diaScratch').value='炫耀和分享的差別在起心動念';");
  await click("產生本輪 GPT 指令", "document.getElementById('dialog')");
  await run("document.getElementById('diaRaw').value=['角色一｜結構診斷','讀者需要先知道你在分辨什麼。','','角色二｜請本人回答','你最想讓讀者帶走什麼？'].join(String.fromCharCode(10));");
  await click("核對回覆", "document.getElementById('dialog')");
  await run("document.getElementById('diaAnswer').value='讓讀者分得出分享與炫耀';");
  await click("保存為本件創作意圖", "document.getElementById('dialog')");
  await run("openDiamond(current(),'A')");
  assert.equal(await run("return document.getElementById('diaScratch').value"), "炫耀和分享的差別在起心動念", "重新開 A 時草稿不能消失");
  await run("document.getElementById('dialog').close();openDiamond(current(),'B')");
  const b = await run("return {scratch:document.getElementById('diaScratch').value,intent:document.getElementById('diaIntent').value,ok:document.getElementById('diaIntentOK').checked,trace:document.querySelector('.diamond-trace')?.textContent||''}");
  assert.equal(b.scratch, "炫耀和分享的差別在起心動念");
  assert.equal(b.intent, "讓讀者分得出分享與炫耀");
  assert.equal(b.ok, true);
  await shot("diamond-b");
  assert.match(b.trace, /A 階段留下的/); assert.match(b.trace, /讀者需要先知道你在分辨什麼/);
  await click("產生本輪 GPT 指令", "document.getElementById('dialog')");
  const bPrompt = await run("return document.getElementById('diaPrompt').value");
  assert.match(bPrompt, /【A 階段的診斷與本人回答/); assert.match(bPrompt, /本人看過診斷後的回答：讓讀者分得出分享與炫耀/);

  // A 在別處做完：在 B 貼上 A 結尾的正式交接，草稿與意圖帶進來，意圖要本人確認，指令附上交接。
  const handoff = ["===== 知識鑽石 A → B｜正式交接 =====", "", "【基本資訊】", "作品題名：如何辨認自己真正的起心動念（暫名）", "",
    "【原始草稿】", "我在分享的時候，起心動念其實是想要告訴別人，我都可以了，你為什麼不行。", "",
    "【本人意圖確認】", "問題一：C", "如何辨認看似善意的行為背後，自己真正的起心動念？", "",
    "【核心創作意圖】", "以自己對於炫耀的覺察作為文章入口。", "", "以上為依照本人選擇所整理的編輯方向，並非本人逐字原話。", "",
    "【B 模組協作交接指令】", "依照觀點深度型長文框架進行。", "", "===== A 模組完成／可進入 B 模組 ====="].join("\n");
  const w2 = await run("document.getElementById('dialog').close();const w=newWork('text');keep(w);go('edit/'+w.id);return w.id;");
  await wait(`route==='edit'&&args[0]===${JSON.stringify(w2)}`, "切到新作品");
  await run(`openDiamond(current(),'B');
    const h=document.getElementById('diaHandoff');h.value=${JSON.stringify("GPT：好的，以下是交接。\n\n" + handoff)};h.dispatchEvent(new Event('change',{bubbles:true}));`);
  const pasted = await run("return {scratch:document.getElementById('diaScratch').value,intent:document.getElementById('diaIntent').value,ok:document.getElementById('diaIntentOK').checked,summary:[...document.querySelectorAll('.diamond-trace summary')].map(s=>s.textContent).join('|'),dialog:document.getElementById('dialog').textContent}");
  assert.equal(pasted.scratch, "我在分享的時候，起心動念其實是想要告訴別人，我都可以了，你為什麼不行。");
  assert.equal(pasted.intent, "以自己對於炫耀的覺察作為文章入口。");
  assert.equal(pasted.ok, false, "交接裡 GPT 整理的意圖不能預設為本人已確認");
  assert.match(pasted.dialog, /不是你的原話/); assert.match(pasted.summary, /正式交接（已帶入）/);
  await click("產生本輪 GPT 指令", "document.getElementById('dialog')");
  assert.match(await run("return document.getElementById('diamondMessage').textContent"), /請先確認本件的創作意圖/);
  await run("document.getElementById('diaIntent').value='我想讓讀者學會辨認自己分享時的起心動念';document.getElementById('diaIntentOK').checked=true;");
  await click("產生本輪 GPT 指令", "document.getElementById('dialog')");
  const handoffPrompt = await run("return document.getElementById('diaPrompt').value");
  assert.match(handoffPrompt, /【A 模組的正式交接/); assert.match(handoffPrompt, /不得當成本人已確認的立場/);
  assert.match(handoffPrompt, /依照觀點深度型長文框架進行/); assert.ok(!handoffPrompt.includes("GPT：好的"), "交接以外的對話不帶入");
  await settle();
  assert.ok(Object.values(records).some(r => r?.aHandoff?.startsWith("===== 知識鑽石 A → B")), "交接要保存在作品上");

  // A 的回覆裡含正式交接：核對時辨認出來，意圖欄先帶入本人的選擇。
  await run("document.getElementById('dialog').close();openDiamond(current(),'A');document.getElementById('diaScratch').value='草稿';");
  await click("產生本輪 GPT 指令", "document.getElementById('dialog')");
  await run(`document.getElementById('diaRaw').value=${JSON.stringify(handoff)};`);
  await click("核對回覆", "document.getElementById('dialog')");
  const aCheck = await run("return {answer:document.getElementById('diaAnswer').value,text:document.getElementById('dialog').textContent}");
  assert.match(aCheck.text, /已辨認出「A → B 正式交接」/);
  assert.match(aCheck.answer, /^問題一：C/);

  await run("document.getElementById('dialog').close();location.hash='cards'");
  await wait("document.getElementById('sourceCardList')", "觀點與洞察");
  assert.match(await text(), /從一張卡開始/);
  assert.deepEqual(errors, [], "頁面不得有未處理的錯誤");
  console.log("PASS A 的草稿、診斷與正式交接接到 B、作品 A／B 素材依關聯排序、並讀選卡三類（用字相近、GPT 候選核對與保存、關係由本人選定）、討論頁帶入的卡片置頂與排序、讀書搭子依卡片數與本人原話調整並寫進討論包");
} finally {
  ws.close(); chrome.kill(); server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
