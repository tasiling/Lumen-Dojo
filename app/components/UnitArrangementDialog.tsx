"use client";

import { useEffect, useMemo, useState } from "react";
import { englishImageRouteLabel, type EnglishImageEntry } from "@/lib/dojo/englishImage";

type Unit = { id: string; label: string; learningGoal: string; status: string; sourceRecordIds: string[] };
type Project = { id: string; title: string; type: string; units: Unit[] };
type Group = { groupRef: string; action: "reuse_unit" | "create_unit"; unitId: string; unitName: string; learningGoal: string; sourceRecordIds: string[]; reason: string; accepted: boolean };
type Pending = { sourceRecordId: string; reason: string };
type Execution = { sourceRecordId: string; groupRef: string; unitId: string; status: "pending" | "running" | "succeeded" | "failed" | "unknown" | "skipped"; error: string };
type Arrangement = { id: string; status: string; prompt: string; pack: { project: { id: string; title: string }; sources: Array<{ recordId: string; title: string; contentMode: string; truncated: boolean }>; capacity: { warning: string } }; groups: Group[]; pending: Pending[]; executions: Execution[] };
type ArrangementSummary = { id: string; status: string; updatedAt: string; pack: { project: { id: string; title: string }; sources: Array<{ recordId: string; title: string }> } };

async function json<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error || `操作失敗（${response.status}）`);
  return result as T;
}

export default function UnitArrangementDialog({ entries, selectedIds, onClose, onUpdated }: {
  entries: EnglishImageEntry[];
  selectedIds: string[];
  onClose: () => void;
  onUpdated: (entries: EnglishImageEntry[]) => void;
}) {
  const [chosenIds, setChosenIds] = useState(selectedIds);
  const selected = entries.filter((entry) => chosenIds.includes(entry.id));
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [intent, setIntent] = useState("");
  const [fullIds, setFullIds] = useState<string[]>([]);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [resultText, setResultText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [crossTypeConfirmed, setCrossTypeConfirmed] = useState(false);
  const [recent, setRecent] = useState<ArrangementSummary[]>([]);

  const firstSelectedId = selected[0]?.id || entries[0]?.id || "";

  useEffect(() => {
    if (!firstSelectedId) return;
    void (async () => {
      try {
        const [result, saved] = await Promise.all([
          json<{ projects: Project[]; capability: { mode: string; supportsUnitArrangement?: boolean; supportsEnsureUnit?: boolean } }>(await fetch(`/api/dojo/english-images/context-room?id=${encodeURIComponent(firstSelectedId)}`, { cache: "no-store" })),
          json<{ arrangements: ArrangementSummary[] }>(await fetch("/api/dojo/english-images/unit-arrangement", { cache: "no-store" })),
        ]);
        if (result.capability.mode !== "v2" || !result.capability.supportsUnitArrangement || !result.capability.supportsEnsureUnit) throw new Error("接收端尚未啟用素材編排；請繼續使用逐筆派送");
        setProjects(result.projects);
        setProjectId((old) => old || result.projects[0]?.id || "");
        setRecent(saved.arrangements.filter((item) => !["completed", "cancelled"].includes(item.status)).slice(0, 5));
      } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    })();
  }, [firstSelectedId]);

  const sourceNames = useMemo(() => new Map(entries.map((entry) => [entry.id, entry.title])), [entries]);
  const project = projects.find((item) => item.id === (arrangement?.pack.project.id || projectId));
  const acceptedGroups = groups.filter((group) => group.accepted && group.sourceRecordIds.length);
  const assigned = new Set(groups.filter((group) => group.accepted).flatMap((group) => group.sourceRecordIds));
  const allPending = [...pending, ...selected.filter((entry) => !assigned.has(entry.id) && !pending.some((item) => item.sourceRecordId === entry.id)).map((entry) => ({ sourceRecordId: entry.id, reason: "使用者暫不派送" }))];

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setError(""); setNotice("");
    try {
      const response = await json<{ arrangement: Arrangement }>(await fetch("/api/dojo/english-images/unit-arrangement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: arrangement?.id, ...extra }) }));
      setArrangement(response.arrangement); setGroups(response.arrangement.groups); setPending(response.arrangement.pending);
      return response.arrangement;
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); return null; }
    finally { setBusy(""); }
  }

  async function createPack() {
    const next = await post("create-pack", { sourceRecordIds: selected.map((entry) => entry.id), projectId, intent, fullTextSourceIds: fullIds, crossTypeConfirmed });
    if (next) setNotice("生成包已保存。複製到外部 GPT 後，把成果貼回下方。");
  }

  async function resume(id: string) {
    setBusy("resume"); setError("");
    try {
      const result = await json<{ arrangement: Arrangement }>(await fetch(`/api/dojo/english-images/unit-arrangement?id=${encodeURIComponent(id)}`, { cache: "no-store" }));
      setArrangement(result.arrangement); setGroups(result.arrangement.groups); setPending(result.arrangement.pending);
      setProjectId(result.arrangement.pack.project.id); setChosenIds(result.arrangement.pack.sources.map((source) => source.recordId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(""); }
  }

  function moveSource(sourceId: string, destination: string) {
    setGroups((old) => old.map((group) => ({ ...group, sourceRecordIds: group.sourceRecordIds.filter((id) => id !== sourceId) })).map((group) => group.groupRef === destination ? { ...group, sourceRecordIds: [...group.sourceRecordIds, sourceId] } : group));
    setPending((old) => destination === "__pending__" ? [...old.filter((item) => item.sourceRecordId !== sourceId), { sourceRecordId: sourceId, reason: "使用者改列為待確認" }] : old.filter((item) => item.sourceRecordId !== sourceId));
  }

  async function execute(action: "execute" | "retry") {
    const next = await post(action);
    if (!next) return;
    const refreshed = await json<{ entries: EnglishImageEntry[] }>(await fetch("/api/dojo/english-images", { cache: "no-store" }));
    onUpdated(refreshed.entries);
    setNotice(next.status === "completed" ? "已完成確認的素材派送。" : "已保留部分成功結果；可只重試失敗或結果未知項目。");
  }

  const counts = arrangement ? {
    create: acceptedGroups.filter((group) => group.action === "create_unit").length,
    reuse: acceptedGroups.filter((group) => group.action === "reuse_unit").length,
    sources: acceptedGroups.reduce((sum, group) => sum + group.sourceRecordIds.length, 0),
    pending: allPending.length,
    already: acceptedGroups.reduce((sum, group) => sum + group.sourceRecordIds.filter((sourceId) => group.action === "reuse_unit" && project?.units.find((unit) => unit.id === group.unitId)?.sourceRecordIds.includes(sourceId)).length, 0),
  } : null;
  const expectedProjectTypes = new Set(selected.map((entry) => entry.route === "game" ? "game_journey" : entry.route === "classroom" ? "class_topic" : entry.route === "reading" ? "reading" : "custom"));
  const crossType = Boolean(project && [...expectedProjectTypes].some((type) => type !== project.type));

  return <div className="unit-arrangement-backdrop" role="dialog" aria-modal="true" aria-label="請 GPT 協助安排學習單元">
    <section className="unit-arrangement-dialog">
      <header><div><small>GPT-ASSISTED ARRANGEMENT</small><h3>請 GPT 協助安排學習單元</h3></div><button className="text-link" onClick={onClose}>關閉</button></header>
      {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
      {!arrangement && <div className="unit-arrangement-step">
        <p>已選取 {selected.length} 份素材。GPT 只提出分組；確認前不建立 Unit，也不派送資料。</p>
        {recent.length > 0 && <details className="unit-arrangement-resume"><summary>繼續尚未完成的編排（{recent.length}）</summary>{recent.map((item) => <button key={item.id} disabled={busy === "resume"} onClick={() => void resume(item.id)}>{item.pack.project.title} · {item.pack.sources.length} 份 · {item.status}</button>)}</details>}
        <button type="button" onClick={() => setShowSourcePicker((value) => !value)}>{showSourcePicker ? "收合素材選擇" : "加入或移除本次素材"}</button>
        {showSourcePicker && <fieldset><legend>英文影像素材（最多 20 筆）</legend>{entries.filter((entry) => entry.route !== "pending").map((entry) => <label className="unit-arrangement-source-option" key={entry.id}><input type="checkbox" checked={chosenIds.includes(entry.id)} onChange={(event) => setChosenIds((old) => event.target.checked ? [...new Set([...old, entry.id])].slice(0, 20) : old.filter((id) => id !== entry.id))}/><span><b>{entry.title}</b><small>{englishImageRouteLabel(entry.route)} · {entry.attachments.length} 張 · {entry.contextRoomLinks.some((link) => link.status === "synced") ? "已歸位過" : "尚未歸位"}</small></span></label>)}</fieldset>}
        <label>目標學習專案<select className="field" value={projectId} onChange={(event) => { setProjectId(event.target.value); setCrossTypeConfirmed(false); }}><option value="">請選擇</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.title}（{item.units.length} Units）</option>)}</select></label>
        {crossType && <label className="unit-arrangement-confirm"><input type="checkbox" checked={crossTypeConfirmed} onChange={(event) => setCrossTypeConfirmed(event.target.checked)}/><span>來源分類與專案類型不同；我確認仍要派送到此專案。系統不會修改 Project type。</span></label>}
        <label>本次希望 GPT 怎麼安排？<textarea className="field" rows={3} value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="例如：Magic Tree House 依章節歸位；同一章分次拍攝請加入同一 Unit。" /></label>
        <fieldset><legend>本次參考素材</legend>{selected.map((entry) => <label className="unit-arrangement-source-option" key={entry.id}><input type="checkbox" checked={fullIds.includes(entry.id)} onChange={(event) => setFullIds((old) => event.target.checked ? [...old, entry.id] : old.filter((id) => id !== entry.id))}/><span><b>{entry.title}</b><small>{englishImageRouteLabel(entry.route)} · {entry.attachments.length} 張 · {entry.englishRecord || entry.chineseExplanation ? "有摘要" : "僅原文"} · {entry.contextRoomLinks.some((link) => link.status === "synced") ? "已歸位過" : "尚未歸位"}</small><em>{fullIds.includes(entry.id) ? "提供英文全文（過長會標示截斷）" : "只提供摘要"}</em></span></label>)}</fieldset>
        <button className="primary" disabled={!projectId || !selected.length || Boolean(busy) || (crossType && !crossTypeConfirmed)} onClick={() => void createPack()}>{busy ? "建立中…" : "產生單元編排生成包"}</button>
      </div>}
      {arrangement && arrangement.status === "packed" && <div className="unit-arrangement-step">
        <p className="muted-note">{arrangement.pack.capacity.warning}</p>
        <button className="primary" onClick={async () => { await navigator.clipboard.writeText(arrangement.prompt); setNotice("已複製生成包。請貼到外部 GPT。"); }}>複製 GPT 生成包</button>
        <label>貼回 GPT 的素材編排成果<textarea className="field" rows={9} value={resultText} onChange={(event) => setResultText(event.target.value)} placeholder="貼上 marker＋JSON；一般操作不需要自行編輯 JSON。" /></label>
        <button disabled={!resultText.trim() || Boolean(busy)} onClick={() => void post("preview", { result: resultText })}>{busy === "preview" ? "解析中…" : "解析並預覽"}</button>
      </div>}
      {arrangement && ["previewed", "approved"].includes(arrangement.status) && <div className="unit-arrangement-step">
        {counts && <div className="unit-arrangement-summary"><span>新增 {counts.create} Units</span><span>重用 {counts.reuse} Units</span><span>確認 {counts.sources} 份</span><span>已在正確位置 {counts.already} 份</span><span>待確認 {counts.pending} 份</span></div>}
        <h4>單元分組</h4>
        {groups.map((group, index) => <article className={`unit-arrangement-group ${group.accepted ? "" : "is-muted"}`} key={group.groupRef}>
          <label className="unit-arrangement-accept"><input type="checkbox" checked={group.accepted} disabled={arrangement.status === "approved"} onChange={(event) => setGroups((old) => old.map((item, i) => i === index ? { ...item, accepted: event.target.checked } : item))}/><b>{group.action === "reuse_unit" ? "加入既有單元" : "新增學習單元"}</b></label>
          <label>單元去向<select className="field" disabled={arrangement.status === "approved"} value={group.action === "reuse_unit" ? group.unitId : "__new__"} onChange={(event) => setGroups((old) => old.map((item, i) => i === index ? event.target.value === "__new__" ? { ...item, action: "create_unit", unitId: "" } : { ...item, action: "reuse_unit", unitId: event.target.value, unitName: project?.units.find((unit) => unit.id === event.target.value)?.label || "" } : item))}><option value="__new__">建立新 Unit</option>{project?.units.filter((unit) => unit.status === "active").map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>
          {group.action === "create_unit" && <><label>Unit 名稱<input className="field" disabled={arrangement.status === "approved"} value={group.unitName} onChange={(event) => setGroups((old) => old.map((item, i) => i === index ? { ...item, unitName: event.target.value } : item))}/></label><label>學習目標<textarea className="field" rows={2} disabled={arrangement.status === "approved"} value={group.learningGoal} onChange={(event) => setGroups((old) => old.map((item, i) => i === index ? { ...item, learningGoal: event.target.value } : item))}/></label></>}
          {group.action === "reuse_unit" && <strong>{project?.units.find((unit) => unit.id === group.unitId)?.label || group.unitName || "Unit 已失效"}</strong>}
          {group.reason && <p>理由：{group.reason}</p>}
          <ul>{group.sourceRecordIds.map((id) => <li key={id}><span>{sourceNames.get(id) || id}</span>{arrangement.status !== "approved" && <select value={group.groupRef} onChange={(event) => moveSource(id, event.target.value)}>{groups.map((target) => <option key={target.groupRef} value={target.groupRef}>{target.unitName || project?.units.find((unit) => unit.id === target.unitId)?.label || target.groupRef}</option>)}<option value="__pending__">移至待確認</option></select>}</li>)}</ul>
        </article>)}
        {allPending.length > 0 && <section className="unit-arrangement-pending"><h4>待確認／本次略過</h4>{allPending.map((item) => <div key={item.sourceRecordId}><b>{sourceNames.get(item.sourceRecordId) || item.sourceRecordId}</b><span>{item.reason}</span>{arrangement.status !== "approved" && groups.length > 0 && <select value="__pending__" onChange={(event) => moveSource(item.sourceRecordId, event.target.value)}><option value="__pending__">保留待確認</option>{groups.map((group) => <option key={group.groupRef} value={group.groupRef}>加入 {group.unitName || project?.units.find((unit) => unit.id === group.unitId)?.label || group.groupRef}</option>)}</select>}</div>)}</section>}
        {arrangement.status === "previewed" ? <button className="primary" disabled={!acceptedGroups.length || Boolean(busy)} onClick={() => void post("approve", { groups, pending: allPending })}>{busy === "approve" ? "核對中…" : "確認這份編排"}</button> : <button className="primary" disabled={Boolean(busy)} onClick={() => void execute("execute")}>{busy === "execute" ? "派送中…" : "建立必要 Unit 並派送"}</button>}
      </div>}
      {arrangement && ["executing", "partial", "completed", "cancelled"].includes(arrangement.status) && <div className="unit-arrangement-step">
        <h4>{arrangement.status === "completed" ? "派送完成" : arrangement.status === "cancelled" ? "已取消尚未開始項目" : "部分完成／可恢復"}</h4>
        <div className="unit-arrangement-results">{arrangement.executions.map((item) => <div key={`${item.groupRef}-${item.sourceRecordId}`}><b>{sourceNames.get(item.sourceRecordId) || item.sourceRecordId}</b><span className={`status-${item.status}`}>{item.status}</span>{item.error && <small>{item.error}</small>}</div>)}</div>
        {arrangement.status === "executing" && <button className="primary" disabled={Boolean(busy)} onClick={() => void execute("execute")}>{busy === "execute" ? "核對並繼續中…" : "安全繼續未完成項目"}</button>}
        {arrangement.status !== "cancelled" && arrangement.executions.some((item) => item.status === "failed" || item.status === "unknown") && <button className="primary" disabled={Boolean(busy)} onClick={() => void execute("retry")}>{busy === "retry" ? "重試中…" : "只重試失敗／結果未知項目"}</button>}
      </div>}
      {arrangement && !["completed", "cancelled"].includes(arrangement.status) && <button className="unit-arrangement-cancel" disabled={Boolean(busy)} onClick={() => void post("cancel")}>取消尚未開始的項目</button>}
    </section>
  </div>;
}
