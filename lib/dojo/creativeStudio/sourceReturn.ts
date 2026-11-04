export function sourceReturn(project:{weavingWorkId:string;sourceCompletionVersionId:string|null},work?:{id:string;currentCompletionVersionId:string|null;draftText:string;finalSnapshot:string},realm:'weaving'|'liaojie'='weaving'){
 const native=project.weavingWorkId&&!project.weavingWorkId.startsWith('legacy:');
 const state=work?.currentCompletionVersionId&&work.currentCompletionVersionId!==project.sourceCompletionVersionId?'new-completion':work&&work.draftText!==work.finalSnapshot?'new-draft':'fixed';
 return {href:native?'/'+realm+'/works/'+encodeURIComponent(project.weavingWorkId):'/'+realm+'/legacy',state};
}
