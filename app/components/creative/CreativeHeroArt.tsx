export default function CreativeHeroArt({realm}:{realm:'weaving'|'liaojie'}) {
  return <svg className="creative-hero-art" viewBox="0 0 360 240" fill="none" aria-hidden="true" focusable="false">
    {realm==='weaving'?<g stroke="white" strokeWidth="1.1">
      {[0,1,2,3,4,5,6,7].map(n=><path key={`a${n}`} opacity={.28+n*.07} d={`M${65+n*11} -24 C ${280+n*5} ${40+n*9}, ${80+n*4} ${150+n*4}, 390 ${155+n*13}`}/>)}
      {[0,1,2,3,4,5,6].map(n=><path key={`b${n}`} opacity={.35+n*.08} d={`M${135+n*10} 264 C ${135+n*8} ${115-n*7}, ${240+n*10} ${90-n*8}, 390 ${5+n*16}`}/>)}
    </g>:<g stroke="white" strokeWidth="1.5">
      <path opacity=".8" d="M365 35c-102-8-175 54-175 130s73 115 175 92"/>
      <path opacity=".55" d="M365 45c-91-8-165 48-165 120s74 104 165 82"/>
      <path opacity=".72" d="M95 50c83-10 148 40 148 111s-65 119-148 110"/>
      <path opacity=".6" strokeDasharray="13 12" d="M110 61c73-8 123 37 123 100s-50 104-123 98"/>
    </g>}
  </svg>;
}
