import test from "node:test";
import assert from "node:assert/strict";
import { BankRoutingState,bankIntegrationConfigured } from "../lib/dojo/wealthBankRouting.ts";

test("disabled bank integration never probes Luminara for ordinary images",async()=>{
  const state=new BankRoutingState();let probes=0;
  const route=await state.route("ordinary-user",false,async()=>{probes++;throw new Error("offline")});
  assert.equal(route.route,"ordinary");assert.equal(probes,0);
  assert.equal(bankIntegrationConfigured({LUMINARA_WEALTH_BANK_ENABLED:"false"}),false);
});

test("optional outage is isolated before bank mode has been activated",async()=>{
  const state=new BankRoutingState();
  const route=await state.route("ordinary-user",true,async()=>{throw new Error("offline")});
  assert.deepEqual(route,{route:"ordinary",reason:"optional_integration_unavailable"});
});

test("active bank mode fails closed and never falls through to forage",async()=>{
  const state=new BankRoutingState(),user="bank-user";
  state.remember(user,{mode:"bank",expiresAt:new Date(Date.now()+60_000).toISOString()});
  const route=await state.route(user,true,async()=>{throw new Error("offline")});
  assert.deepEqual(route,{route:"bank-unavailable",reason:"active_mode_cannot_be_verified"});
});

test("confirmed off mode routes to the original image flow",async()=>{
  const state=new BankRoutingState(),user="off-user";
  state.remember(user,{mode:"bank",expiresAt:new Date(Date.now()+60_000).toISOString()});
  const route=await state.route(user,true,async()=>({mode:"off"}));
  assert.equal(route.route,"ordinary");
});
