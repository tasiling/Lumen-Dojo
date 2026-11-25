import test from "node:test";
import assert from "node:assert/strict";
const d = await import("../lib/reading/discussion.ts");
const m = await import("../lib/reading/mindmap.ts");

// 這輪的讀法與對照筆記進得了討論包、回傳卡認得 S2，心智圖只排列已寫下的內容。
test("閱讀筆記的讀法、對照筆記與心智圖", () => {
  const src={bookId:"b",bookTitle:"原子習慣",readCount:1,noteId:"11111111-1111-4111-8111-111111111111",label:"習慣是複利",locator:"第一章 · 位置 120",readingQuestion:"為什麼我撐不過三週？",excerpt:"習慣是自我改善的複利。",reflection:"我總是太快想看到結果。"};
  const round={id:"22222222-2222-4222-8222-222222222222",source:{...src,compare:{noteId:"n2",label:"目標與系統",locator:"第一章 · 位置 300",excerpt:"你不會提升到目標的高度，而是落到系統的水準。",reflection:""}},starter:"gpt",method:"distill",question:"",createdAt:""};
  const disc={id:"33333333-3333-4333-8333-333333333333",scope:"both",rounds:[round]};
  const p=d.discussionPrompt(disc,round);
  for(const k of ["【S2｜對照的作者原文】","書籍深度蒸餾","這是 GPT 的推論，尚未確認","S2（對照的作者原文）"])assert.ok(p.includes(k),k);
  assert.ok(!p.includes("【N2"));
  // old rounds unchanged
  const old={...round,method:undefined,source:src};
  const po=d.discussionPrompt({...disc,rounds:[old]},old);
  assert.ok(!po.includes("本輪的讀法")&&!po.includes("S2"));
  for(const k of Object.keys(d.READING_METHODS)){const r={...round,method:k};const t=d.discussionPrompt({...disc,rounds:[r]},r);assert.equal(t.includes("【本輪的讀法"),k!=="open",k);}
  // return validates S2 evidence
  const raw=JSON.stringify({格式:d.DISCUSSION_FORMAT,討論ID:disc.id,討論包ID:round.id,選段ID:src.noteId,帶入範圍:"both",狀態:"完成",問答:[{角色:"GPT",內容:"你怎麼看這兩段？"},{角色:"我",內容:"我覺得是互補，複利要靠系統才累積得起來。"}],下次從這裡:"",候選:[{類型:"觀點",內容:"複利要靠系統才累積得起來",依據:"T2",依據原句:"複利要靠系統才累積得起來",行動:""},{類型:"觀點",內容:"x",依據:"S2",依據原句:"落到系統的水準",行動:""}]});
  const v=d.validateReturn(raw,disc,round);assert.ok(v.candidates.every(c=>!c.evidenceError));
  assert.equal(d.methodLabel("layers"),"拆書計畫｜往下三層，問回我的經驗");assert.equal(d.methodLabel(undefined),"一般討論");
  // mindmap
  round.result=v;v.candidates[0].state="confirmed";
  const notes=[{id:src.noteId,kind:"excerpt",text:src.excerpt,metadata:{chapter:"第一章",location:"位置 120",reflection:src.reflection}},{id:"t",kind:"thought",text:"想到我學英文也是",metadata:{}},{id:"r",kind:"review",text:"",metadata:{changedUnderstanding:"我以前把習慣當意志力",openQuestion:"",nextStep:"記錄兩週"}}];
  const root=m.readingMindmap({book:{id:"b",title:"原子習慣",readCount:2,question:src.readingQuestion},notes,cards:[{insight:"系統比目標重要",action:"每天寫三行",status:"觀察中"}],discussions:[disc]});
  const md=m.mindmapMarkdown(root);
  assert.ok(md.includes("討論後我的觀點：複利要靠系統才累積得起來"));assert.ok(md.includes("「習慣是自我改善的複利。」"));
  assert.equal(m.mindmapCount(m.readingMindmap({book:{title:"x",readCount:1,question:""},notes:[],cards:[],discussions:[]})),0);
});
