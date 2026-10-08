type BankCounts={recorded?:number;review?:number;linked?:number;duplicate?:number;skipped?:number;failed?:number};
export type BankSummaryResult={counts:BankCounts;totals?:{expense?:Record<string,string>;income?:Record<string,string>}};
export function bankSummary(result:BankSummaryResult){
 const c=result.counts||{};
 const lines=[`銀行截圖已處理\n已記錄 ${c.recorded||0} 筆｜已關聯 ${c.linked||0} 筆｜待確認 ${c.review||0} 筆｜重複 ${c.duplicate||0} 筆｜略過 ${c.skipped||0} 筆｜失敗 ${c.failed||0} 筆`];
 for(const [label,values] of [['本圖已記支出',result.totals?.expense],['本圖已記入帳',result.totals?.income]] as const){
  const amounts=Object.entries(values||{}).filter(([currency,minor])=>['AUD','TWD'].includes(currency)&&/^\d+$/.test(minor)&&BigInt(minor)>BigInt(0)).map(([currency,minor])=>{
   const n=BigInt(minor);return `${currency} ${currency==='TWD'?n.toString():`${n/BigInt(100)}.${String(n%BigInt(100)).padStart(2,'0')}`}`;
  });
  if(amounts.length)lines.push(`${label}：${amounts.join('、')}`);
 }
 return lines.join('\n');
}
