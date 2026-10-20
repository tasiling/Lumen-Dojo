export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.CREATIVE_PROPOSAL_WORKER==='1'){
  const {startProposalWorker}=await import('./lib/dojo/creativeProposals/worker');startProposalWorker();
 }
}
