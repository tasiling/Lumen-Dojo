import type {Attempt,Scope,Evaluation} from '../assessments/model';
import type {LearningEntity} from '../learningFoundation/model';
export const ranks=['stone','bronze','silver','gold','diamond'] as const;
export type MasteryRank=typeof ranks[number];
export const rankLabels:Record<MasteryRank,string>={stone:'石',bronze:'銅',silver:'銀',gold:'金',diamond:'鑽石'};
type Base={recordType:'mastery-event/v1';id:string;cardId:string;capabilityId:string;owner:string;revision:number;requestFingerprint:string;createdAt:string};
export type MasteryEvent=Base&({kind:'grant';attempt:Attempt}|{kind:'associate';itemIds:string[]}|{kind:'withdraw'|'reinstate';reason:string});
export type MasteryCard={recordType:'mastery-card/v1';id:string;owner:string;capabilityId:string;name:string;scope:Scope;rank:MasteryRank;rankDefinitionVersion:number;cefrReference:string|null;personalGoal:string;itemIds:string[];acquiredAt:string;rankAchievedAt:string;lastConfirmedAt:string;revision:number;status:'active'|'withdrawn';evaluatorType:Evaluation['evaluator']['type'];professionalQualification:false};
export type MasterySummary=Omit<MasteryCard,'personalGoal'>;
export type MasteryHistory={id:string;kind:MasteryEvent['kind'];revision:number;createdAt:string;rank?:MasteryRank;attemptId?:string;definitionVersion?:number;name?:string;confirmedAt?:string;reason?:string;itemIds?:string[]};
export interface MasteryRepository{owner:string;events():Promise<MasteryEvent[]>;event(id:string):Promise<MasteryEvent|null>;append(event:MasteryEvent):Promise<void>;confirmedAttempt(id:string):Promise<Attempt|null>;graph():Promise<LearningEntity[]>;exclusive<T>(fn:()=>Promise<T>):Promise<T>}
