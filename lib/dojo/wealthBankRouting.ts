export type BankModeProbe={mode:"bank"|"off";expiresAt?:string|null};
export type BankImageRoute={route:"ordinary"|"bank"|"bank-unavailable";reason?:string};

export function bankIntegrationConfigured(env:NodeJS.ProcessEnv=process.env):boolean{
  return env.LUMINARA_WEALTH_BANK_ENABLED==="true"
    && Boolean(env.LUMINARA_WEALTH_URL?.trim())
    && Boolean(env.LUMINARA_WEALTH_S2S_SECRET&&env.LUMINARA_WEALTH_S2S_SECRET.length>=32);
}

export class BankRoutingState{
  private readonly activeLeases=new Map<string,number>();

  remember(userId:string,mode:BankModeProbe):void{
    if(mode.mode==="off"){this.activeLeases.delete(userId);return;}
    this.activeLeases.set(userId,mode.expiresAt?new Date(mode.expiresAt).getTime():Date.now()+30*60_000);
  }

  async route(userId:string,configured:boolean,probe:()=>Promise<BankModeProbe>):Promise<BankImageRoute>{
    if(!configured)return{route:"ordinary",reason:"integration_disabled"};
    const cachedUntil=this.activeLeases.get(userId)||0;
    try{
      const mode=await probe();
      this.remember(userId,mode);
      return{route:mode.mode==="bank"?"bank":"ordinary"};
    }catch{
      if(cachedUntil>Date.now())return{route:"bank-unavailable",reason:"active_mode_cannot_be_verified"};
      return{route:"ordinary",reason:"optional_integration_unavailable"};
    }
  }
}
