export function masteryPending(items:string[],savedItems:string[],reason:string){
 const associationsChanged=JSON.stringify(items)!==JSON.stringify(savedItems);
 return {dirty:associationsChanged||reason.length>0,canAssociate:associationsChanged&&!reason,canAudit:!associationsChanged&&Boolean(reason.trim())};
}
