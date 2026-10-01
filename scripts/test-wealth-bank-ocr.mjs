import test from "node:test";
import assert from "node:assert/strict";
import { amountRecoveryInstruction,mergeAmountRecovery,needsAmountRecovery,normalizeBankOcrPayload } from "../lib/dojo/wealthBankOcr.ts";

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
    {date:null,description:"David's Master Pot (Box Hill)",amount:"$48.20",currency:"AUD",direction:"outflow",status:"pending",kind:"merchant",evidence:{...evidence,amount_visible:true,direction_visible:true}},
    {date:null,description:"The Boxhill",amount:"12.00",currency:"AUD",direction:"outflow",status:"pending",kind:"merchant",evidence:{...evidence,amount_visible:false,direction_visible:true}},
  ]});
  assert.deepEqual(mergeAmountRecovery(first,recovered).transactions.map(row=>row.amount),[null,null]);
});
