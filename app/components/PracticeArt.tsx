import type { ReactNode } from "react";
export function RealmArt({dao=false}:{dao?:boolean}) {
  return <svg className="practice-realm-art" viewBox="0 0 260 260" fill="none" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="1.2">{dao?<>{[0,24,48,72].map(n=><path key={n} d={`M${20+n} 260V${130+n/2}a${110-n} ${110-n} 0 0 1 ${220-2*n} 0V260`}/>)}<path d="M0 259H260"/></>:<>{[34,66,98,130].map(r=><circle key={r} cx="130" cy="130" r={r}/>)}<path d="M130 0V260"/><circle cx="130" cy="130" r="5" fill="currentColor"/></>}</svg>;
}
export function PracticeIcon({name}:{name:string}) {
  const paths:Record<string,ReactNode>={
    english:<><path d="m3 19 5-14 5 14M5 14h6M16 8h5M18 5v3c0 6-2 10-5 12M16 13l5 7"/></>,
    massage:<><path d="M6 13V7a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v7-3a2 2 0 0 1 4 0v6c0 8-12 8-14 3l-5-6a2 2 0 0 1 3-2l4 3"/></>,
    iching:<><path d="M3 4h18M3 8h7m4 0h7M3 12h18M3 16h7m4 0h7M3 20h18"/></>,
    ziwei:<><path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/></>,
    qimen:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/></>,
    tarot:<><rect x="6" y="2" width="13" height="19" rx="2"/><path d="M3 6v15a2 2 0 0 0 2 2h10m-3-17 3 5-3 5-3-5Z"/></>,
    lenormand:<><path d="M12 12C1 12 3 1 9 4c3 1 3 5 3 8 0-11 11-9 8-3-1 3-5 3-8 3 11 0 9 11 3 8-3-1-3-5-3-8 0 11-11 9-8 3 1-3 5-3 8-3Zm0 0 7 10"/></>,
    psychology:<><path d="M7 21v-5c-6-6-2-14 5-14 8 0 8 6 8 9l2 3h-5v7M9 7c2-3 8-1 6 2l-3 3-3-3Z"/></>,
    medicine:<><path d="M12 22V9M12 16C2 17 1 8 3 5c7 0 11 4 9 11Zm0-5C12 4 17 2 22 2c0 6-3 10-10 9Z"/></>,
    drawing:<><path d="m3 21 2-7L17 2l5 5L10 19Zm2-7 5 5M14 5l5 5M3 22h19"/></>,
    body:<><circle cx="15" cy="4" r="2"/><path d="m10 8 4-1 3 5 4 1M14 8l-3 7-6 2M11 15l5 2-3 5M10 8l-4 4"/></>,
    learning:<><path d="M12 5C8 2 3 3 3 5v15c3-2 6-2 9 0 3-2 6-2 9 0V5c0-2-5-3-9 0Zm0 0v15"/></>,
    emotion:<path d="M12 21 3 12C-3 3 8-1 12 7c4-8 15-4 9 5Z"/>,
    intention:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/></>,
    spirit:<><path d="M12 3C5 9 5 16 12 21 19 16 19 9 12 3Z"/><path d="M7 10 2 8c-2 9 3 13 10 13C21 21 24 15 22 8l-5 2"/></>,
    context:<path d="M21 11c0 5-5 8-12 7l-6 3 2-5C-3 4 20 0 21 11Z"/>,
    vocabulary:<><rect x="5" y="2" width="15" height="20" rx="3"/><path d="M9 7h7M9 11h7M9 15h4"/></>,
    atlas:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-5 4 3 4-5 4 4"/></>,
    history:<><circle cx="12" cy="12" r="9"/><path d="M12 6v7l5 3"/></>,
    default:<><path d="m12 2 10 6-10 6L2 8Zm-9 12 9 6 9-6M3 19l9 4 9-4"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.default}</svg>;
}

export function LearningItemIcon({name}:{name:string}) {
  const key = /英文/.test(name)?'english':/按摩/.test(name)?'massage':/易經/.test(name)?'iching':/紫微/.test(name)?'ziwei':/奇門/.test(name)?'qimen':/塔羅/.test(name)?'tarot':/雷諾曼/.test(name)?'lenormand':/心理/.test(name)?'psychology':/中醫/.test(name)?'medicine':/繪圖|速寫/.test(name)?'drawing':'learning';
  return <PracticeIcon name={key}/>;
}
