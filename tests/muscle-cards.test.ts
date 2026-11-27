import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  LEARNING_PATHS, MMT_GRADING, MUSCLES, REGION_PATHS, SEED_PATTERNS, TFH_MUSCLES, TFH_PATH, pathForMuscle, pathMuscles,
} from "../lib/dojo/muscleCards/catalog";
import { builtLabel, sectionBuilt, sectionView, type MuscleCardRecord } from "../lib/dojo/muscleCards/model";
import { muscleService, type JsonRow } from "../lib/dojo/muscleCards/service";
import { neighbors } from "../lib/dojo/daoLinks/model";
import { MUSCLE_KIND, PATTERN_KIND } from "../lib/dojo/muscleCards/network";
import { LearningError } from "../lib/dojo/learningFoundation/model";
import { buildDiscussionPackage, parseAnswerReturn } from "../lib/dojo/muscleCards/discussion";

function memoryRepo(owner = "isolated-owner") {
  const rows = new Map<string, JsonRow>();
  const identities = new Set<string>();
  let writes = 0;
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    rows,
    writes: () => writes,
    repo: {
      owner,
      list: async (prefix: string) => [...rows.values()].filter((r) => r.title.startsWith(prefix)).map(clone),
      create: async (title: string, value: unknown, identity: string) => {
        assert.match(identity, /^[a-f0-9]{64}$/);
        assert(!identities.has(identity), "同一筆建立送了兩次");
        identities.add(identity);
        const id = randomUUID();
        rows.set(id, { id, title, value: clone(value) });
        writes++;
      },
      update: async (id: string, prefix: string, title: string, value: unknown) => {
        assert(rows.get(id)?.title.startsWith(prefix));
        rows.set(id, { id, title, value: clone(value) });
        writes++;
      },
      archive: async (id: string, prefix: string) => {
        assert(rows.get(id)?.title.startsWith(prefix));
        rows.delete(id);
        writes++;
      },
      exclusive: <T>(fn: () => Promise<T>) => fn(),
    },
  };
}
async function rejects(promise: Promise<unknown>, status: number, pattern?: RegExp) {
  await assert.rejects(promise, (e: unknown) => e instanceof LearningError && e.status === status && (!pattern || pattern.test(e.message)));
}

async function catalog() {
  assert.equal(MUSCLES.length, 50);
  assert.equal(new Set(MUSCLES.map((m) => m.key)).size, 50);
  assert.equal(new Set(MUSCLES.map((m) => m.name)).size, 50);
  assert.deepEqual(LEARNING_PATHS.map((p) => p.name), ["頭", "頸", "肩", "背", "上肢", "臀", "大腿", "小腿", "腳底", "觸康健十四肌"]);
  const counts = Object.fromEntries(REGION_PATHS.map((r) => [r.name, pathMuscles(r.key).length]));
  assert.deepEqual(counts, { 頭: 3, 頸: 5, 肩: 11, 背: 7, 上肢: 6, 臀: 5, 大腿: 4, 小腿: 5, 腳底: 4 });
  assert.deepEqual(pathMuscles("neck").map((m) => m.label), ["胸鎖乳突肌", "斜角肌", "枕下肌群", "頭夾肌與頸夾肌", "肩胛提肌"]);
  const tfh = pathMuscles(TFH_PATH.key);
  assert.deepEqual(
    tfh.map((t) => `${t.label}—${t.meridian}`),
    ["棘上肌—任脈", "大圓肌—督脈", "胸大肌鎖骨部—胃經", "闊背肌—脾經", "肩胛下肌—心經", "股四頭肌—小腸經", "腓骨肌—膀胱經",
      "髂腰肌（腰大肌）—腎經", "臀中肌—心包經", "小圓肌—三焦經", "三角肌（前束）—膽經", "胸大肌胸骨部—肝經", "前鋸肌—肺經", "闊筋膜張肌—大腸經"],
  );
  // 觸康健路徑上的卡就是部位卡本身，不另建。
  for (const t of tfh) assert.equal(MUSCLES.find((m) => m.key === t.muscle.key), t.muscle);
  assert.equal(TFH_MUSCLES.length, 14);
  assert.equal(pathForMuscle("deltoid", TFH_PATH.key), TFH_PATH.key);
  assert.equal(pathForMuscle("masseter", TFH_PATH.key), "head");
  assert.equal(pathForMuscle("upper-trapezius", "neck"), "shoulder");
  assert.match(MMT_GRADING, /MRC/);
  assert.deepEqual(SEED_PATTERNS.map((p) => p.name), ["上交叉症候群", "下交叉症候群"]);
}

async function cards() {
  const memory = memoryRepo();
  const service = muscleService(memory.repo);
  let snap = await service.snapshot();
  assert.equal(snap.cards.length, 0, "空卡不先寫入紀錄");
  assert.equal(memory.writes(), 0);
  assert.equal(snap.patterns.length, 2);
  assert.deepEqual(snap.links, []);

  // 空卡：只有經絡預填，所有層都是未建。
  assert.equal(sectionView(null, "deltoid", "tfh").fields.meridian, "膽經");
  assert.equal(sectionView(null, "deltoid", "know").fields.origin, "");
  for (const s of ["know", "mmt", "posture", "tfh", "use"] as const) assert.equal(builtLabel(sectionBuilt(null, "deltoid", s)), "未建");

  const know = await service.saveSection("deltoid", "know", 0, { fields: { origin: "教材起點" } });
  assert.equal(know.sections.know?.revision, 1);
  assert.equal(sectionBuilt(know, "deltoid", "know"), true);
  assert.equal(sectionBuilt(know, "deltoid", "mmt"), false);
  // 測試三分頁各自保存，互不覆蓋。
  await service.saveSection("deltoid", "mmt", 0, { fields: { position: "坐姿" } });
  const tfh = await service.saveSection("deltoid", "tfh", 0, { fields: { meridian: "膽經", position: "" } });
  assert.equal(sectionBuilt(tfh, "deltoid", "tfh"), false, "只保留預填經絡不算已建");
  const tfh2 = await service.saveSection("deltoid", "tfh", 1, { fields: { meridian: "膽經", neurolymphatic: "某處" } });
  assert.equal(sectionBuilt(tfh2, "deltoid", "tfh"), true);
  snap = await service.snapshot();
  const card = snap.cards.find((c) => c.key === "deltoid") as MuscleCardRecord;
  assert.equal(snap.cards.length, 1);
  assert.equal(card.sections.know?.fields.origin, "教材起點");
  assert.equal(card.sections.mmt?.fields.position, "坐姿");
  assert.equal(card.sections.tfh?.revision, 2);
  await rejects(service.saveSection("deltoid", "know", 0, { fields: { origin: "舊版本" } }), 409);
  await rejects(service.saveSection("masseter", "tfh", 0, { fields: { position: "x" } }), 400, /不在觸康健十四肌/);
  await rejects(service.saveSection("deltoid", "know", 1, { fields: { meridian: "x" } }), 400);
  await rejects(service.saveSection("not-a-muscle", "know", 0, { fields: {} }), 404);
  await rejects(service.saveSection("deltoid", "know", 1, { fields: { origin: "x".repeat(4001) } }), 400);
  await rejects(service.saveSection("deltoid", "mmt", 1, { fields: {}, patterns: [] }), 400);

  // 型態卡：種子第一次保存才建立；可以自己新增。
  const upper = await service.editPattern("upper-crossed-syndrome", 0, { description: "說明" });
  assert.equal(upper.name, "上交叉症候群");
  await rejects(service.editPattern("upper-crossed-syndrome", 0, { description: "x" }), 409);
  const request = randomUUID();
  const added = await service.createPattern(request, { name: "自訂型態" });
  assert.equal((await service.createPattern(request, { name: "自訂型態" })).id, added.id, "重送不重複建立");
  await rejects(service.createPattern(randomUUID(), { name: "" }), 400);
  snap = await service.snapshot();
  assert.deepEqual(snap.patterns.map((p) => p.name), ["上交叉症候群", "下交叉症候群", "自訂型態"]);

  // 一條肌肉可以屬於多個型態，各記偏緊或偏弱；同屬一個型態的肌肉自動互連，也連到型態卡。
  await service.saveSection("upper-trapezius", "posture", 0, {
    fields: {}, patterns: [{ patternId: "upper-crossed-syndrome", tendency: "tight" }, { patternId: added.id, tendency: "weak" }],
  });
  await service.saveSection("lower-trapezius", "posture", 0, { fields: {}, patterns: [{ patternId: "upper-crossed-syndrome", tendency: "weak" }] });
  await rejects(service.saveSection("rhomboids", "posture", 0, { fields: {}, patterns: [{ patternId: randomUUID(), tendency: "weak" }] }), 404);
  await rejects(
    service.saveSection("rhomboids", "posture", 0, {
      fields: {}, patterns: [{ patternId: "upper-crossed-syndrome", tendency: "weak" }, { patternId: "upper-crossed-syndrome", tendency: "tight" }],
    }),
    400,
  );
  snap = await service.snapshot();
  const trap = { kind: MUSCLE_KIND, id: "upper-trapezius" };
  const lowerTrap = neighbors(snap.links, { kind: MUSCLE_KIND, id: "lower-trapezius" });
  assert(lowerTrap.some((n) => n.other.id === "upper-trapezius" && n.link.type === "same-posture" && /上斜方肌偏緊、下斜方肌偏弱/.test(n.link.note)));
  assert(lowerTrap.some((n) => n.other.kind === PATTERN_KIND && n.other.id === "upper-crossed-syndrome" && n.link.note === "在上交叉症候群中偏弱"));
  assert.equal(neighbors(snap.links, trap).filter((n) => n.other.kind === PATTERN_KIND).length, 2);
  const lowerCard = snap.cards.find((c) => c.key === "lower-trapezius")!;
  assert.equal(sectionBuilt(lowerCard, "lower-trapezius", "posture"), true);

  // 手動連結：寫在道藏，雙方的局部視窗都看得到；說明欄保留。
  const linkRequest = randomUUID();
  const link = await service.createLink(linkRequest, { a: trap, b: { kind: MUSCLE_KIND, id: "levator-scapulae" }, type: "synergist", note: "上提肩胛" });
  assert.equal((await service.createLink(linkRequest, {})).id, link.id);
  await rejects(service.createLink(randomUUID(), { a: { kind: MUSCLE_KIND, id: "levator-scapulae" }, b: trap, type: "synergist", note: "上提肩胛" }), 409);
  await rejects(service.createLink(randomUUID(), { a: trap, b: trap, type: "synergist" }), 400);
  await rejects(service.createLink(randomUUID(), { a: trap, b: { kind: MUSCLE_KIND, id: "deltoid" }, type: "same-posture" }), 400);
  await rejects(service.createLink(randomUUID(), { a: trap, b: { kind: MUSCLE_KIND, id: "nope" }, type: "antagonist" }), 404);
  await rejects(service.createLink(randomUUID(), { a: trap, b: { kind: "book", id: "x" }, type: "antagonist" }), 404);
  snap = await service.snapshot();
  const levator = neighbors(snap.links, { kind: MUSCLE_KIND, id: "levator-scapulae" });
  assert.deepEqual(levator.map((n) => [n.other.id, n.link.type, n.link.note]), [["upper-trapezius", "synergist", "上提肩胛"]]);
  assert(neighbors(snap.links, trap).some((n) => n.other.id === "levator-scapulae"));
  await rejects(service.archiveLink("auto-upper-crossed-syndrome-upper-trapezius"), 400);
  await service.archiveLink(link.id);
  assert.equal(neighbors((await service.snapshot()).links, { kind: MUSCLE_KIND, id: "levator-scapulae" }).length, 0);

  // 答題紀錄：每筆分開存，記在那一層，不計分。
  const answerRequest = randomUUID();
  const entries = [
    { section: "know", practicedOn: "2026-11-27", question: "起點在哪？", answer: "我的答案", mismatch: "和卡片不同", raw: "原文一" },
    { section: "tfh", practicedOn: "2026-11-27", question: "經絡？", answer: "膽經", mismatch: "", raw: "原文二" },
  ];
  const saved = await service.addAnswers("deltoid", answerRequest, entries);
  assert.equal(saved.length, 2);
  assert.equal((await service.addAnswers("deltoid", answerRequest, entries)).length, 2);
  let answers = await service.listAnswers("deltoid");
  assert.equal(answers.length, 2);
  assert.deepEqual(answers.map((a) => a.section).sort(), ["know", "tfh"]);
  assert.equal("score" in answers[0], false);
  await rejects(service.addAnswers("masseter", randomUUID(), [{ ...entries[1] }]), 400);
  await rejects(service.addAnswers("deltoid", randomUUID(), [{ ...entries[0], question: "" }]), 400);
  await rejects(service.addAnswers("deltoid", randomUUID(), [{ ...entries[0], practicedOn: "2026-02-30" }]), 400);
  await rejects(service.addAnswers("deltoid", "not-a-request", entries), 400);
  await service.archiveAnswer("deltoid", saved[0].id);
  answers = await service.listAnswers("deltoid");
  assert.deepEqual(answers.map((a) => a.section), ["tfh"]);
  assert.equal((await service.listAnswers("pectoralis-major-clavicular")).length, 0);

  // 擁有者不符或重複的紀錄不靜默忽略。
  const foreign = memoryRepo();
  await foreign.repo.create("行光肌肉卡-deltoid", { ...card, owner: "someone-else" }, "f".repeat(64));
  await rejects(muscleService(foreign.repo).snapshot(), 409);
}

async function discussion() {
  const memory = memoryRepo();
  const service = muscleService(memory.repo);
  // 非十四肌的空卡：沒有可以出題的欄位。
  assert.equal(buildDiscussionPackage("masseter", null, []), null);
  // 十四肌的空卡只有預填經絡。
  const deltoidPack = buildDiscussionPackage("deltoid", null, [])!;
  assert.match(deltoidPack, /對應經絡：膽經/);
  assert.doesNotMatch(deltoidPack, /【認識】|【徒手肌力測試】|採用的分級/);
  await service.saveSection("masseter", "know", 0, { fields: { origin: "甲", source: "教材第 3 頁" } });
  await service.saveSection("masseter", "mmt", 0, { fields: { direction: "乙" } });
  const snap = await service.snapshot();
  const pack = buildDiscussionPackage("masseter", snap.cards[0], snap.patterns)!;
  assert.match(pack, /起點：甲/);
  assert.match(pack, /出處（教材與頁碼）：教材第 3 頁/);
  assert.match(pack, /施力方向：乙/);
  assert.match(pack, /採用的分級：英國醫學研究委員會/);
  assert.match(pack, /一次只出一題/);
  assert.match(pack, /不得自己補充任何解剖事實/);
  assert.match(pack, /留空的，不要針對它們出題/);
  for (const empty of ["止點", "主要動作", "怎麼摸到", "測試姿勢", "常見代償", "【運用】", "【姿勢評估】", "觸康健", "經絡"]) assert(!pack.includes(empty), empty);
  const parsed = parseAnswerReturn([
    "===肌肉卡答題/v1===", "卡片：咬肌", "層：認識", "題目：起點？", "我的答案：甲", "第二行", "不一致：無", "===題目結束===",
    "===肌肉卡答題/v1===", "卡片：顳肌", "層：認識", "題目：x", "===題目結束===",
    "===肌肉卡答題/v1===", "卡片：咬肌", "層：觸康健檢測", "題目：y", "===題目結束===",
  ].join("\n"), "masseter");
  assert.equal(parsed.entries.length, 1);
  assert.deepEqual({ ...parsed.entries[0], raw: undefined }, { section: "know", question: "起點？", answer: "甲\n第二行", mismatch: "無", raw: undefined });
  assert.equal(parsed.problems.length, 2);
  assert.equal(parseAnswerReturn("隨便一段文字", "masseter").problems.length, 1);
}

async function main() {
  await catalog();
  await cards();
  await discussion();
  console.log("muscle-cards tests passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
