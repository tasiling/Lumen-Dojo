import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BankRoutingState,bankIntegrationConfigured } from "../lib/dojo/wealthBankRouting.ts";

test("OCR integration bypasses only the app access-key proxy and keeps its bearer guard",()=>{
  const proxy=readFileSync(join(process.cwd(),"proxy.ts"),"utf8");
  const route=readFileSync(join(process.cwd(),"app/api/integrations/wealth-bank/ocr/route.ts"),"utf8");
  assert.match(proxy,/api\/integrations\/wealth-bank\/ocr/);
  assert.match(route,/LUMINARA_WEALTH_OCR_SECRET/);
  assert.match(route,/Bearer /);
  assert.match(route,/status: 401/);
});

test("disabled bank integration never probes Luminara for ordinary images",async()=>{
  const state=new BankRoutingState();let probes=0;
  const route=await state.route("ordinary-user","event-disabled",false,async()=>{probes++;throw new Error("offline")});
  assert.equal(route.route,"ordinary");assert.equal(probes,0);
  assert.equal(bankIntegrationConfigured({LUMINARA_WEALTH_BANK_ENABLED:"false"}),false);
});

test("unknown route fails closed in a cold process and cannot enter ordinary capture",async()=>{
  const state=new BankRoutingState();
  const route=await state.route("ordinary-user","event-offline",true,async()=>{throw new Error("offline")});
  assert.deepEqual(route,{route:"bank-unavailable",reason:"route_cannot_be_verified"});
});

test("two independent workers honor the durable immutable event claim",async()=>{
  const durable=new Map([["event-bank","bank"]]),claim=eventId=>async()=>({route:durable.get(eventId)});
  const first=await new BankRoutingState().route("bank-user","event-bank",true,claim("event-bank"));
  const afterRestart=await new BankRoutingState().route("bank-user","event-bank",true,claim("event-bank"));
  assert.equal(first.route,"bank");assert.equal(afterRestart.route,"bank");
});

test("confirmed off mode routes to the original image flow",async()=>{
  const route=await new BankRoutingState().route("off-user","event-off",true,async()=>({route:"ordinary"}));
  assert.equal(route.route,"ordinary");
});

test("an accepted bank event remains bank after mode exit while a new event is ordinary",async()=>{
  const durable=new Map([["event-before-exit","bank"],["event-after-exit","ordinary"]]),claim=eventId=>async()=>({route:durable.get(eventId)});
  assert.equal((await new BankRoutingState().route("user","event-before-exit",true,claim("event-before-exit"))).route,"bank");
  assert.equal((await new BankRoutingState().route("user","event-after-exit",true,claim("event-after-exit"))).route,"ordinary");
});
