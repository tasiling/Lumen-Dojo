"use client";

import CreativeIcon from './creative/CreativeIcon';
import CreativeHeroArt from './creative/CreativeHeroArt';
import { useRouter } from "next/navigation";
import { useDojo } from "@/lib/dojo/store";
import { SPACES, type SpaceKey } from "@/lib/dojo/constants";
import EntryCard from "./EntryCard";

export default function ModuleDomainPage({
  title,
  lead,
  space,
  defaultKind,
  extra,
}: {
  title: string;
  lead: string;
  space: SpaceKey;
  defaultKind: string;
  extra?: React.ReactNode;
}) {
  const { entries, entriesLoading, entriesError, openQuickAdd, startTimerFromSpace } = useDojo();
  const router = useRouter();
  const creative = space === 'weaving' || space === 'liaojie';
  const spaceEntries = entries.filter((entry) => entry.space === space);

  function startTimerHere() {
    startTimerFromSpace(space);
    router.push("/timer");
  }

  return (
    <section className="screen">
      <div className={`hero ${SPACES[space][1]}`}>
        {creative && <CreativeHeroArt realm={space as 'weaving'|'liaojie'}/>}
        <span className="eyebrow">{creative ? title : '六個場域'}</span>
        <h1>{title}</h1>
        {space === 'liaojie' && <p className="creative-hero-subtitle">信任・服務</p>}
        <p>{lead}</p>
      </div>
      {extra}
      <div className="two domain-primary-actions">
        <button className="primary" onClick={() => openQuickAdd({ presetSpace: space, presetKind: defaultKind })}>
          {creative ? <CreativeIcon name="add"/> : '＋'} 新增紀錄
        </button>
        <button onClick={startTimerHere}>{creative ? <CreativeIcon name="clock"/> : '◷'} 在此計時</button>
      </div>

      <h2 className="section-title">留下的痕跡</h2>
      {entriesLoading && <div className="empty">正在讀取紀錄…</div>}
      {entriesError && <p className="form-error">{entriesError}</p>}
      {!entriesLoading && spaceEntries.length === 0 && <div className="empty">{creative ? <><CreativeIcon name="document"/><p>這個場域還沒有紀錄。</p></> : "這個場域還沒有紀錄。"}</div>}
      {spaceEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
    </section>
  );
}
