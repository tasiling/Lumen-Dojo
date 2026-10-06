export type BankImageRoute={route:"ordinary"|"bank"|"bank-unavailable";reason?:string};
export type ClaimedBankImageRoute={route:"ordinary"|"bank"};

export function bankIntegrationConfigured(env:NodeJS.ProcessEnv=process.env):boolean{
  return env.LUMINARA_WEALTH_BANK_ENABLED==="true"
    && Boolean(env.LUMINARA_WEALTH_URL?.trim())
    && Boolean(env.LUMINARA_WEALTH_S2S_SECRET&&env.LUMINARA_WEALTH_S2S_SECRET.length>=32);
}

export class BankRoutingState{
  async route(userId:string,eventId:string,configured:boolean,claim:()=>Promise<ClaimedBankImageRoute>):Promise<BankImageRoute>{
    if(!configured)return{route:"ordinary",reason:"integration_disabled"};
    try{
      if(!userId||!eventId)throw new Error("missing_source_identity");
      return await claim();
    }catch{
      return{route:"bank-unavailable",reason:"route_cannot_be_verified"};
    }
  }
}
