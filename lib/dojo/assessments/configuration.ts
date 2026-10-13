import type {DefinitionInput,Scope} from './model';
export function changeScope(scope:Scope,patch:Partial<Scope>):Scope {
 const next={...scope,...patch};
 if(patch.learningItemId!==undefined&&patch.learningItemId!==scope.learningItemId){delete next.stageId;delete next.topicId;}
 if(Object.hasOwn(patch,'stageId')&&patch.stageId!==scope.stageId)delete next.topicId;
 if(next.level==='path'){delete next.stageId;delete next.topicId;}else if(next.level==='stage')delete next.topicId;
 return next;
}
export function languageDimension(definition:DefinitionInput,value:Scope['languageDimension']):DefinitionInput{
 const next={...definition,scope:{...definition.scope,languageDimension:value}};if(value==='none')delete next.cefr;return next;
}
export function professionalPractice(definition:DefinitionInput,value:boolean):DefinitionInput{
 const methods=value?definition.confirmationMethods.filter(m=>m!=='self'):[...definition.confirmationMethods];
 return {...definition,professionalPractice:value,confirmationMethods:methods.length?methods:['teacher']};
}
