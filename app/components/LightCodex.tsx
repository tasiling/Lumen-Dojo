"use client";
import { LIGHT_CODEX } from "@/lib/dojo/lightCodex";
export default function LightCodex({selected,onChange}:{selected?:string[];onChange?:(tags:string[])=>void}) {
  return <section className="light-codex"><p>光行／光法可複選或不選，只是標記，不計分、不解鎖。</p>{onChange&&<button type="button" onClick={()=>onChange([])}>清除光標記</button>}{LIGHT_CODEX.map(item=><article className="card" key={item.key}>
    {onChange?<label className="reflection-choice"><input type="checkbox" checked={selected?.includes(item.key)??false} onChange={e=>onChange(e.target.checked?[...(selected??[]),item.key]:(selected??[]).filter(t=>t!==item.key))}/><b>{item.name}</b> · {item.hint}</label>:<h3>{item.name} · {item.hint}</h3>}
    <details><summary>{item.name}的說明與比較</summary><p><b>原始定義：</b>{item.definition}</p><p>{item.originalExamples}</p><small>以下為補充說明</small><p>{item.explanation}</p><p><b>生活例子：</b>{item.example}</p><p>{item.comparison}</p></details>
  </article>)}</section>;
}
