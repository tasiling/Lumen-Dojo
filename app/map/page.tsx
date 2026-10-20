"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";
import { TODAY_REALM_PALETTE } from "@/lib/dojo/todayCalendarUi";
import { TodayCalendarIcon } from "../components/TodayCalendarArt";

export default function MapPage() {
  return (
    <section className="screen map-screen">
      <div className="map-heading">
        <span className="eyebrow">六個生活場域</span>
        <h1>道場小地圖</h1>
        <p className="lead">六個生活場域，各自保留紀錄、計時與回看的入口。</p>
      </div>
      <div className="spaces-shortcut">
        <div className="grid" aria-label="六個生活場域">
          {(Object.entries(SPACES) as [SpaceKey, (typeof SPACES)[SpaceKey]][]).map(([k, v]) => (
            <Link key={k} href={`/${k}`} className={`space-link ${v[1]}`} style={{ "--realm-surface": TODAY_REALM_PALETTE[k].surface, "--realm-ink": TODAY_REALM_PALETTE[k].ink } as CSSProperties}>
              <TodayCalendarIcon name={TODAY_REALM_PALETTE[k].icon} />
              <b>{v[0]}</b>
              <small>{v[2]}</small>
            </Link>
          ))}
        </div>
      </div>
      <div className="ritual-card map-backstage">
        <div>
          <h2>工作後台</h2>
          <p>日上三更、任務管理、組稿、序列、生產日與快速評分集中在此。</p>
        </div>
        <Link className="button-link" href="/backstage">進入工作後台 <TodayCalendarIcon name="i-arrow" /></Link>
      </div>
    </section>
  );
}
