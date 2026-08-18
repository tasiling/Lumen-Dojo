"use client";

import { useRouter } from "next/navigation";
import { SPACES } from "@/lib/dojo/constants";

export default function MapPage() {
  const router = useRouter();
  return (
    <section className="screen">
      <h1>道場小地圖</h1>
      <p className="lead">六個生活場域，各自保留紀錄、計時與回看的入口。</p>
      <div className="grid">
        {Object.entries(SPACES).map(([k, v]) => (
          <button key={k} className={`space ${v[1]}`} onClick={() => router.push(`/${k}`)}>
            <span className="dot" />
            <b>{v[0]}</b>
            <small>{v[2]}</small>
          </button>
        ))}
      </div>
      <div className="box dw">
        <b>工作後台</b>
        <small>日上三更、任務管理、組稿、序列、生產日與快速評分集中在此。</small>
        <button style={{ marginTop: 10 }} onClick={() => router.push("/backstage")}>進入工作後台 →</button>
      </div>
    </section>
  );
}
