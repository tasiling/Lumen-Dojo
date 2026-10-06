export function isPerformanceText(text:string){return /^(?:業績\s*)?(?:\d{4}\/)?\d{1,2}\/\d{1,2}\s*[:：]/.test(text.trim())}
export function parsePerformanceText(text:string,today:string){
 const m=text.trim().match(/^(?:業績\s*)?(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})\s*[:：]\s*(\d+(?:\.\d{1,2})?)\s*[,，]\s*(\d+)$/);
 if(!m)throw new Error('請用 10/2:255，4（業績 AUD、刷卡筆數）');
 const date=`${m[1]||today.slice(0,4)}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 const d=new Date(date+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date||date>today)throw new Error('請填真實且不是未來的工作日期；跨年請用 YYYY/M/D');
 const count=Number(m[5]);if(!Number.isSafeInteger(count)||count>10000)throw new Error('刷卡筆數需為 0–10000 整數');
 return {date,amount:m[4],card_payment_count:count};
}
export function performanceReply(result:{daily:{amount_minor:string;card_payment_count:number};weekly:{week_start:string;days:number;estimated_pay_minor:string|null}}){
 const money=(minor:string)=>`${BigInt(minor)/BigInt(100)}.${(BigInt(minor)%BigInt(100)).toString().padStart(2,'0')}`;
 const daily=(BigInt(result.daily.amount_minor)-BigInt(result.daily.card_payment_count)*BigInt(250)+BigInt(1))/BigInt(2);
 return `業績已保存\n預估日薪 AUD ${money(daily.toString())}\n本週（${result.weekly.week_start} 週一起）已記 ${result.weekly.days} 天\n${result.weekly.estimated_pay_minor===null?'本週仍有刷卡資料待補':`預估週薪 AUD ${money(result.weekly.estimated_pay_minor)}`}\n這是預估，實際領薪另記；週薪按整週合計後四捨五入。`;
}
