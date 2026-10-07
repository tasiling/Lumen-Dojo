import test from "node:test";
import assert from "node:assert/strict";
import { amountRecoveryInstruction,mergeAmountRecovery,needsAmountRecovery,normalizeBankOcrPayload } from "../lib/dojo/wealthBankOcr.ts";

test('visible section headings keep October 7 purchases separate from October 6 credit',()=>{
 const out=normalizeBankOcrPayload({transactions:[
  {date:null,date_header:'Wed 07 Oct Today',description:'Coles',amount:'8.09',currency:'AUD',direction:'outflow',status:'pending',kind:'merchant',account_hint:'Smart Access',evidence:{date_visible:true}},
  {date:null,date_header:'Tue 06 Oct Yesterday',description:'Medibank',amount:'45.05',currency:'AUD',direction:'inflow',status:'completed',evidence:{date_visible:true}},
  {date:null,date_header:'Mon 07 Oct',description:'Wrong weekday',evidence:{date_visible:true}},
  {date:null,date_header:'Yesterday',description:'No visible calendar date',evidence:{date_visible:true}},
 ]},{referenceDate:'2026-10-07'});
 assert.deepEqual(out.transactions.map(x=>x.date),['2026-10-07','2026-10-06',null,null]);
 assert.equal(normalizeBankOcrPayload({transactions:[{date_header:'Wed 07 Oct',evidence:{date_visible:true}}]}).transactions[0].date,null);
});
test('field recovery runs when amounts exist but dates or account evidence are missing',()=>{
 const first=normalizeBankOcrPayload({transactions:[{description:'Coles',amount:'8.09',currency:'AUD',direction:'outflow',status:'pending',kind:'merchant',evidence:{amount_visible:true,direction_visible:true,description_visible:true}}]});
 assert.equal(needsAmountRecovery(first),true);
 const recovered=normalizeBankOcrPayload({transactions:[{description:'Coles',amount:'8.09',currency:'AUD',date:'2026-10-07',direction:'outflow',account_hint:'Smart Access',status:'pending',kind:'merchant',evidence:{date_visible:true,account_visible:true,amount_visible:true,direction_visible:true,description_visible:true}}]});
 const out=mergeAmountRecovery(first,recovered).transactions[0];
 assert.equal(out.date,'2026-10-07');assert.equal(out.account_hint,'Smart Access');assert.equal(out.evidence.account_visible,true);assert.equal(out.status,'pending');
 const conflict=normalizeBankOcrPayload({transactions:[{...recovered.transactions[0],amount:'18.09'}]});
 assert.equal(mergeAmountRecovery(first,conflict).transactions[0].date,null);
});

const evidence = { date_visible:false,amount_visible:false,direction_visible:false,description_visible:true,account_visible:false };
const first = normalizeBankOcrPayload({transactions:[
  {date:null,description:"David's Master Pot (Box Hill)",amount:null,currency:null,direction:null,status:"pending",kind:"merchant",account_hint:"",stable_reference:"",category:"dining",evidence},
  {date:null,description:"The Boxhill",amount:null,currency:null,direction:null,status:"pending",kind:"merchant",account_hint:"",stable_reference:"",category:"dining",evidence},
]});

test("a merchant row with a missing amount triggers one focused recovery pass",()=>{
  assert.equal(needsAmountRecovery(first),true);
  const instruction=amountRecoveryInstruction(first);
  assert.match(instruction,/Pending label/);
  assert.match(instruction,/David's Master Pot/);
  assert.match(instruction,/far right/);
});

test("focused recovery fills only visibly supported fields and preserves row identity",()=>{
  const recovered=normalizeBankOcrPayload({transactions:[
    {date:null,description:"David's Master Pot (Box Hill)",amount:"48.20",currency:"AUD",direction:"outflow",status:"pending",kind:"merchant",account_hint:"",stable_reference:"",category:"",evidence:{...evidence,amount_visible:true,direction_visible:true}},
    {date:null,description:"The Boxhill",amount:"12.00",currency:"AUD",direction:"outflow",status:"pending",kind:"merchant",account_hint:"",stable_reference:"",category:"",evidence:{...evidence,amount_visible:true,direction_visible:true}},
  ]});
  const merged=mergeAmountRecovery(first,recovered);
  assert.deepEqual(merged.transactions.map(row=>row.amount),["48.20","12.00"]);
  assert.deepEqual(merged.transactions.map(row=>row.description),["David's Master Pot (Box Hill)","The Boxhill"]);
  assert.ok(merged.transactions.every(row=>row.status==="pending"&&row.direction==="outflow"));
});

test("invalid or unsupported amounts remain null instead of being guessed",()=>{
  const recovered=normalizeBankOcrPayload({transactions:[
    {date:null,description:"David's Master Pot (Box Hill)",amount:"$48.2x",currency:"AUD",direction:"outflow",status:"pending",kind:"merchant",evidence:{...evidence,amount_visible:true,direction_visible:true}},
    {date:null,description:"The Boxhill",amount:"12.00",currency:"AUD",direction:"outflow",status:"pending",kind:"merchant",evidence:{...evidence,amount_visible:false,direction_visible:true}},
  ]});
  assert.deepEqual(mergeAmountRecovery(first,recovered).transactions.map(row=>row.amount),[null,null]);
});

test("visible numeric and currency-formatted amounts are retained without guessing",()=>{
 for (const [value, expected] of [[11,"11"],[11.05,"11.05"],["$11.00","11.00"],["AUD 1,234.56","1234.56"],["A$ 11.00","11.00"]]) {
  assert.equal(normalizeBankOcrPayload({transactions:[{amount:value,currency:"AUD"}]}).transactions[0].amount,expected);
 }
 for (const value of ["TWD 11", "11,00", "11.001", "about 11", "11 or 12", -11, Infinity]) {
  assert.equal(normalizeBankOcrPayload({transactions:[{amount:value,currency:"AUD"}]}).transactions[0].amount,null);
 }
});

test("repeated merchant names are not assigned recovery amounts without unique references",()=>{
 const original=normalizeBankOcrPayload({transactions:[{description:'Cafe',amount:null,currency:'AUD'},{description:'Cafe',amount:null,currency:'AUD'}]});
 const recovery=normalizeBankOcrPayload({transactions:[{description:'Cafe',amount:'11',currency:'AUD',evidence:{amount_visible:true}},{description:'Cafe',amount:'12',currency:'AUD',evidence:{amount_visible:true}}]});
 assert.deepEqual(mergeAmountRecovery(original,recovery).transactions.map(x=>x.amount),[null,null]);
});
