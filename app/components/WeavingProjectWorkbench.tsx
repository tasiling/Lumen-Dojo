"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ClaimCandidateComposer from "@/app/components/ClaimCandidateComposer";
import { DAILY_TASK_CATEGORIES, emptyBingoCell, mondayOf, taipeiTodayISO, type DailyTaskCategory, type WeeklyBoard } from "@/lib/dojo/formal";
import { TEXT_SUBTYPES, WEAVING_FORMATS, type TextSubtype, type WeavingFormat } from "@/lib/dojo/weavingProjects";
import {
  currentCore,
  type CoreImpact,
  type ReflectionNextMove,
  type WeavingShuttle,
  type WeavingShuttleBundle,
  type WeavingWork,
} from "@/lib/dojo/weavingShuttle";
import { WEAVING_TEXT_TOOLS, weavingPrompt } from "@/lib/dojo/weavingTools";

const WORK_STATUS: Record<WeavingWork["status"], string> = { selecting: "選擇中", drafting: "草稿中", producing: "製作中", reviewing: "確認中", completed: "已完成", sent_to_liaojie: "已送聊解室", archived: "已封存" };
const CORE_IMPACT: Record<CoreImpact, string> = { unchanged: "核心觀點沒有改變", expanded: "想補充得更完整", changed: "我的理解已經改變", branched: "長出了另一個主題" };
const NEXT_MOVE: Record<ReflectionNextMove, string> = { adapt: "發展作品 B", update_core: "更新核心經線後再創作", branch: "分支成新織光杼", rest: "先讓它沉澱" };

async function json<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((value as { error?: string }).error || `操作失敗（${response.status}）`);
  return value as T;
}

export default function WeavingProjectWorkbench() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const [bundle, setBundle] = useState<WeavingShuttleBundle | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(searchParams.get("work"));
  const [draftText, setDraftText] = useState("");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newWorkOpen, setNewWorkOpen] = useState(false);
  const [newWorkTitle, setNewWorkTitle] = useState("");
  const [newWorkFormat, setNewWorkFormat] = useState<WeavingFormat>("text");
  const [reflectionInsight, setReflectionInsight] = useState("");
  const [coreImpact, setCoreImpact] = useState<CoreImpact>("unchanged");
  const [nextMove, setNextMove] = useState<ReflectionNextMove>("rest");
  const [nextCore, setNextCore] = useState("");
  const [branchTitle, setBranchTitle] = useState("");
  const [nextTitle, setNextTitle] = useState("");
  const [nextFormat, setNextFormat] = useState<WeavingFormat>("text");
  const [boardOpen, setBoardOpen] = useState(false);
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [boardCategory, setBoardCategory] = useState<DailyTaskCategory>("important");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/dojo/weaving-shuttles?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await json<{ bundle: WeavingShuttleBundle }>(response);
      setBundle(result.bundle);
      const requested = searchParams.get("work");
      const work = result.bundle.works.find((item) => item.id === requested)
        ?? result.bundle.works.find((item) => !["completed", "sent_to_liaojie", "archived"].includes(item.status))
        ?? result.bundle.works[0] ?? null;
      setSelectedWorkId(work?.id ?? null);
      setDraftText(work?.draftText ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, [id, searchParams]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const shuttle = bundle?.shuttle ?? null;
  const work = bundle?.works.find((item) => item.id === selectedWorkId) ?? null;
  const core = shuttle ? currentCore(shuttle) : null;
  const tool = useMemo(() => work ? WEAVING_TEXT_TOOLS[work.formatSubtype] : null, [work]);

  function chooseWork(next: WeavingWork) {
    setSelectedWorkId(next.id); setDraftText(next.draftText); setPreview(false); setNotice(null); setError(null);
    router.replace(`/weaving/${id}?work=${encodeURIComponent(next.id)}`, { scroll: false });
  }

  async function migrateLegacy() {
    if (!bundle?.legacyProjectId) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/weaving-shuttles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "migrate", legacyProjectId: bundle.legacyProjectId }) });
      const result = await json<{ bundle: WeavingShuttleBundle }>(response);
      const first = result.bundle.works[0];
      router.replace(`/weaving/${result.bundle.shuttle.id}${first ? `?work=${encodeURIComponent(first.id)}` : ""}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setSaving(false); }
  }

  async function patchShuttle(values: Partial<WeavingShuttle>, message?: string) {
    if (!shuttle) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dojo/weaving-shuttles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shuttle.id, shuttle: values }) });
      const result = await json<{ shuttle: WeavingShuttle }>(response);
      setBundle((current) => current ? { ...current, shuttle: result.shuttle } : current);
      if (message) setNotice(message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function patchWork(values: Partial<WeavingWork>, message?: string) {
    if (!work) return null;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dojo/weaving-works", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: work.id, work: values }) });
      const result = await json<{ work: WeavingWork }>(response);
      setBundle((current) => current ? { ...current, works: current.works.map((item) => item.id === result.work.id ? result.work : item) } : current);
      setDraftText(result.work.draftText);
      if (message) setNotice(message);
      return result.work;
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); return null; }
    finally { setSaving(false); }
  }

  async function createWork() {
    if (!shuttle || !newWorkTitle.trim()) { setError("請先填寫作品名稱。"); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/weaving-works", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shuttleId: shuttle.id, title: newWorkTitle, format: newWorkFormat }) });
      const result = await json<{ work: WeavingWork }>(response);
      setBundle((current) => current ? { ...current, works: [result.work, ...current.works], shuttle: { ...current.shuttle, status: "active" } } : current);
      setNewWorkOpen(false); setNewWorkTitle(""); chooseWork(result.work);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function copyPrompt() {
    if (!shuttle || !work) return;
    await navigator.clipboard.writeText(weavingPrompt(shuttle, work));
    setNotice("已複製包含來源、核心經線與受眾的製作指令。");
  }

  async function complete() {
    if (!work || (!work.draftText.trim() && !work.outputUrl.trim())) { setError("請先保存文字或成品連結，再確認完成。"); return; }
    await patchWork({ status: "completed", finalSnapshot: work.draftText, completedAt: new Date().toISOString(), nextAction: "回看這次創作，或送往聊解室" }, "作品已織成；回杼可以稍後再做。");
  }

  async function sendToLiaojie() {
    if (!shuttle || !work) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/liaojie-projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weavingShuttleId: shuttle.id, weavingWorkId: work.id }) });
      const result = await json<{ project: { id: string } }>(response);
      router.push(`/liaojie/workbench?id=${result.project.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setSaving(false); }
  }

  async function saveReflection() {
    if (!shuttle || !work) return;
    const needsNextWork = nextMove !== "rest";
    if (needsNextWork && !nextTitle.trim()) { setError("請先替下一件作品命名。"); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/weaving-works", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reflect", shuttleId: shuttle.id, workId: work.id, insight: reflectionInsight, coreImpact, nextMove, nextCoreStatement: nextCore, branchTitle, nextTitle, nextFormat }),
      });
      const result = await json<{ shuttle: WeavingShuttle; work: WeavingWork; nextWork: WeavingWork | null; branched?: boolean }>(response);
      if (result.nextWork) {
        router.replace(`/weaving/${result.shuttle.id}?work=${encodeURIComponent(result.nextWork.id)}`);
        return;
      }
      setBundle((current) => current ? { ...current, shuttle: result.shuttle, works: current.works.map((item) => item.id === result.work.id ? result.work : item) } : current);
      setNotice("回杼已保存；這張織光杼先進入沉澱。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setSaving(false); }
  }

  async function openBoard() {
    if (!work?.nextAction.trim()) return;
    setBoardOpen(true); setError(null);
    try { const week = mondayOf(taipeiTodayISO()); const response = await fetch(`/api/dojo/bingo?week=${week}`, { cache: "no-store" }); const result = await json<{ board: WeeklyBoard }>(response); setBoard(result.board); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }

  async function addToBoard() {
    if (!shuttle || !work || !board || selectedCell === null) return;
    const cell = board.cells[selectedCell];
    if (!cell || cell.index === 12 || cell.text.trim()) { setError("請選擇一個空白週盤格。"); return; }
    const next: WeeklyBoard = { ...board, colorsConfirmedAt: null, cells: board.cells.map((item) => item.index !== selectedCell ? item : { ...emptyBingoCell(item.index, board.weekStart), text: work.nextAction, shortLabel: work.nextAction.slice(0, 12), category: boardCategory, sourceType: "project", sourceId: `${shuttle.id}:${work.id}` }) };
    setSaving(true); setError(null);
    try { const response = await fetch("/api/dojo/bingo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: board.weekStart, board: next }) }); const result = await json<{ board: WeeklyBoard }>(response); setBoard(result.board); setBoardOpen(false); setSelectedCell(null); setNotice("只排入這條作品緯線的一個動作；織光杼與成品都沒有被直接完成。"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="screen"><div className="empty">正在打開這張織光杼…</div></section>;
  if (!bundle || !shuttle || !core) return <section className="screen"><p className="form-error">{error || "找不到織光杼"}</p></section>;

  if (bundle.legacyProjectId) return <section className="screen weaving-workbench-screen">
    <div className="hero we"><span className="eyebrow">舊版織光案</span><h1>{shuttle.title}</h1><p>{core.statement}</p></div>
    {error && <p className="form-error">{error}</p>}
    <section className="ritual-card legacy-upgrade-card"><span className="eyebrow">相容升級</span><h2>把這張案升級成織光杼</h2><p>來源、核心觀點、草稿與成品連結都會保留，並拆成一張織光杼與作品 A。原紀錄會在兩筆新資料建立成功後才封存。</p><button className="primary full-button" disabled={saving} onClick={() => void migrateLegacy()}>{saving ? "升級中…" : "確認升級這張"}</button></section>
  </section>;

  return <section className="screen weaving-workbench-screen">
    <div className="hero we"><span className="eyebrow">織光杼 · 核心經線 v{core.number}</span><h1>{shuttle.title}</h1><p>{core.statement}</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="save-notice" role="status">{notice}</p>}

    <section className="ritual-card shuttle-core-card"><div className="section-heading"><div><span className="eyebrow">創作根系</span><h2>核心經線</h2></div><span className="weaving-count">v{core.number}</span></div><p className="core-thread-statement">{core.statement}</p>
      <details><summary>查看來源與觀點變化</summary><div className="source-thread-snapshot">{shuttle.sourceSnapshot || "手動題材"}</div><ol className="core-version-list">{shuttle.coreVersions.map((version) => <li key={version.id}><b>v{version.number}　{version.statement}</b><small>{version.changeNote}</small></li>)}</ol></details>
      <ClaimCandidateComposer source={{ sourceType: "weaving_core", sourceId: `${shuttle.id}:${core.id}`, label: `${shuttle.title}・核心經線 v${core.number}`, locator: `核心經線 v${core.number}`, url: "", snapshot: shuttle.sourceSnapshot }} defaultStatement={core.statement} defaultType="perspective" buttonLabel="整理成目前立場候選" />
      <label>想讓誰理解？（可稍後補）</label><input className="field" value={shuttle.audience} onChange={(event) => setBundle({ ...bundle, shuttle: { ...shuttle, audience: event.target.value } })} placeholder="例如：正在練習顯化、但容易責怪自己的讀者"/>
      <label>這張杼目前想寫往哪裡？（可稍後補）</label><textarea className="field" rows={3} value={shuttle.direction} onChange={(event) => setBundle({ ...bundle, shuttle: { ...shuttle, direction: event.target.value } })}/>
      <button disabled={saving} onClick={() => void patchShuttle({ audience: shuttle.audience, direction: shuttle.direction }, "織光杼方向已保存。")}>保存創作方向</button>
    </section>

    <section className="ritual-card work-lines-card"><div className="section-heading"><div><span className="eyebrow">經線穿引出的作品</span><h2>作品緯線</h2></div><button onClick={() => setNewWorkOpen((value) => !value)}>{newWorkOpen ? "收起" : "＋ 發展新作品"}</button></div>
      {bundle.works.length > 0 && <div className="work-line-tabs">{bundle.works.map((item, index) => <button key={item.id} className={item.id === selectedWorkId ? "on" : ""} onClick={() => chooseWork(item)}><small>作品 {String.fromCharCode(65 + Math.min(index, 25))} · {WEAVING_FORMATS[item.format]}</small><b>{item.title}</b><span>{WORK_STATUS[item.status]}</span></button>)}</div>}
      {newWorkOpen && <div className="new-work-form"><label>新作品名稱</label><input className="field" value={newWorkTitle} onChange={(event) => setNewWorkTitle(event.target.value)} placeholder="這次要長成哪一件作品？"/><label>形式</label><div className="format-choice-grid compact">{Object.entries(WEAVING_FORMATS).map(([key, label]) => <button key={key} className={newWorkFormat === key ? "on" : ""} onClick={() => setNewWorkFormat(key as WeavingFormat)}>{label}</button>)}</div><button className="primary" disabled={saving || !newWorkTitle.trim()} onClick={() => void createWork()}>建立這條作品緯線</button></div>}
    </section>

    {work && <>
      <section className="ritual-card current-work-card"><span className="eyebrow">正在織作 · {WEAVING_FORMATS[work.format]}</span><h2>{work.title}</h2><p>這件作品使用核心經線 v{shuttle.coreVersions.find((version) => version.id === work.coreVersionId)?.number ?? core.number}</p><label>作品名稱</label><input className="field" value={work.title} onChange={(event) => setBundle({ ...bundle, works: bundle.works.map((item) => item.id === work.id ? { ...item, title: event.target.value } : item) })}/><button onClick={() => void patchWork({ title: work.title }, "作品名稱已保存。")}>保存名稱</button></section>

      {work.format !== "text" ? <section className="ritual-card future-format-card"><span className="eyebrow">作品緯線已保留</span><h2>{work.format === "comic" ? "漫畫工作台將在下一階段開放" : "影片工作台將在後續開放"}</h2><p>你仍可保存下一步與成品連結；系統不會自動產生其他形式的待辦。</p><label>成品連結（選填）</label><input className="field" type="url" value={work.outputUrl} onChange={(event) => setBundle({ ...bundle, works: bundle.works.map((item) => item.id === work.id ? { ...item, outputUrl: event.target.value } : item) })}/><button onClick={() => void patchWork({ outputUrl: work.outputUrl }, "成品連結已保存。")}>保存連結</button></section> : <>
        <section className="ritual-card"><span className="eyebrow">文字路徑</span><h2>這次要完成哪一種文字？</h2><div className="text-subtype-grid">{(Object.entries(TEXT_SUBTYPES) as [TextSubtype,string][]).filter(([key]) => key !== "lesson_legacy").map(([key,label]) => <button key={key} className={work.formatSubtype === key ? "on" : ""} onClick={() => void patchWork({ formatSubtype: key, toolKey: WEAVING_TEXT_TOOLS[key].key, status: "drafting", nextAction: "開啟工具並完成文字初稿" })}>{label}</button>)}</div></section>
        {tool && <section className="ritual-card tool-handoff-card"><span className="eyebrow">製作工具</span><h2>{tool.label}</h2><p>{tool.note}</p><div className="two"><button onClick={() => void copyPrompt()}>複製完整製作指令</button>{tool.href && <button className="primary" onClick={() => window.open(tool.href!, "_blank", "noopener,noreferrer")}>新分頁開啟工具</button>}</div></section>}
        <section className="ritual-card draft-return-card"><span className="eyebrow">外部結果貼回</span><h2>先貼回，再預覽</h2><p className="lead">貼上的內容不會立刻覆蓋已保存草稿。</p><textarea className="field work-draft-field" rows={14} value={draftText} onChange={(event) => { setDraftText(event.target.value); setPreview(false); }}/><label>成品連結（可稍後補）</label><input className="field" type="url" value={work.outputUrl} onChange={(event) => setBundle({ ...bundle, works: bundle.works.map((item) => item.id === work.id ? { ...item, outputUrl: event.target.value } : item) })}/><div className="two"><button disabled={!draftText.trim()} onClick={() => setPreview(true)}>預覽完整文字</button><button disabled={saving} onClick={() => void patchWork({ outputUrl: work.outputUrl }, "成品連結已保存。")}>保存連結</button></div></section>
        {preview && <section className="ritual-card text-preview-card"><div className="section-heading"><div><span className="eyebrow">保存前預覽</span><h2>{work.title}</h2></div><button onClick={() => setPreview(false)}>返回修改</button></div><div className="full-text-preview">{draftText}</div><button className="primary" disabled={saving} onClick={() => void patchWork({ draftText, status: "reviewing", nextAction: "確認這份文字可否作為本次成品" }, "預覽內容已確認並保存。")}>確認預覽並保存</button></section>}
      </>}

      <section className="ritual-card next-action-card"><span className="eyebrow">這條緯線的下一步</span><h2>{work.nextAction}</h2><input className="field" value={work.nextAction} onChange={(event) => setBundle({ ...bundle, works: bundle.works.map((item) => item.id === work.id ? { ...item, nextAction: event.target.value } : item) })}/><div className="two"><button onClick={() => void patchWork({ nextAction: work.nextAction }, "下一步已保存。")}>保存下一步</button><button onClick={() => void openBoard()}>排入本週一格</button></div>{!["completed", "sent_to_liaojie"].includes(work.status) && <button className="primary full-button" disabled={saving} onClick={() => void complete()}>確認這件作品已織成</button>}{["completed", "sent_to_liaojie"].includes(work.status) && <button className="primary full-button" disabled={saving} onClick={() => void sendToLiaojie()}>手動送往聊解室</button>}</section>

      {["completed", "sent_to_liaojie"].includes(work.status) && <section className="ritual-card reflection-card"><span className="eyebrow">回杼 · 創作後回看</span><h2>這件作品帶回了什麼？</h2>{work.reflection ? <><div className="saved-reflection"><p>{work.reflection.insight}</p><small>{CORE_IMPACT[work.reflection.coreImpact]} · {NEXT_MOVE[work.reflection.nextMove]}</small></div><ClaimCandidateComposer source={{ sourceType: "weaving_reflection", sourceId: `${work.id}:${work.reflection.createdAt}`, label: `${work.title}・作品回杼`, locator: work.reflection.createdAt, url: work.outputUrl, snapshot: work.finalSnapshot.slice(0, 12000) }} defaultStatement={work.reflection.insight} defaultType="experience" supportingEvidence={`作品：${work.title}\n回杼：${work.reflection.insight}`} buttonLabel="整理成創作後知識候選" /></> : <><p className="lead">不必阻擋完成；有餘裕時，再把新理解放回織光杼。</p><label>這次創作讓我更明白了什麼？</label><textarea className="field" rows={4} value={reflectionInsight} onChange={(event) => setReflectionInsight(event.target.value)}/><label>原本觀點需要改變嗎？</label><div className="reflection-choice-grid">{(Object.entries(CORE_IMPACT) as [CoreImpact,string][]).map(([key,label]) => <button key={key} className={coreImpact === key ? "on" : ""} onClick={() => setCoreImpact(key)}>{label}</button>)}</div><label>接下來呢？</label><div className="reflection-choice-grid">{(Object.entries(NEXT_MOVE) as [ReflectionNextMove,string][]).map(([key,label]) => <button key={key} className={nextMove === key ? "on" : ""} onClick={() => { setNextMove(key); if (key === "update_core") setCoreImpact("changed"); if (key === "branch") setCoreImpact("branched"); }}>{label}</button>)}</div>{nextMove === "update_core" && <><label>更新後的核心觀點</label><textarea className="field" rows={3} value={nextCore} onChange={(event) => setNextCore(event.target.value)} placeholder={core.statement}/></>}{nextMove === "branch" && <><label>新織光杼名稱</label><input className="field" value={branchTitle} onChange={(event) => setBranchTitle(event.target.value)}/><label>新主題的核心觀點</label><textarea className="field" rows={3} value={nextCore} onChange={(event) => setNextCore(event.target.value)}/></>}{nextMove !== "rest" && <><label>下一件作品名稱</label><input className="field" value={nextTitle} onChange={(event) => setNextTitle(event.target.value)}/><label>下一件作品形式</label><div className="format-choice-grid compact">{Object.entries(WEAVING_FORMATS).map(([key,label]) => <button key={key} className={nextFormat === key ? "on" : ""} onClick={() => setNextFormat(key as WeavingFormat)}>{label}</button>)}</div></>}<button className="primary full-button" disabled={saving || !reflectionInsight.trim()} onClick={() => void saveReflection()}>{saving ? "保存中…" : "保存回杼並前往下一步"}</button></>}</section>}
    </>}

    {boardOpen && board && <div className="modal show" onClick={(event) => event.target === event.currentTarget && setBoardOpen(false)}><section className="sheet board-picker-sheet"><div className="toolbar"><h2>排入本週一格</h2><button onClick={() => setBoardOpen(false)}>關閉</button></div><p>只排入「{work?.nextAction}」，不代表整件作品或織光杼完成。</p><div className="board-empty-grid">{board.cells.filter((cell) => cell.index !== 12 && !cell.text.trim()).map((cell) => <button key={cell.index} className={selectedCell === cell.index ? "on" : ""} onClick={() => setSelectedCell(cell.index)}>第 {cell.index + 1} 格</button>)}</div><label>本週分類</label><div className="row">{(Object.keys(DAILY_TASK_CATEGORIES) as DailyTaskCategory[]).map((category) => <button key={category} className={boardCategory === category ? "on" : ""} onClick={() => setBoardCategory(category)}>{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")}</button>)}</div><button className="primary" disabled={selectedCell === null || saving} onClick={() => void addToBoard()}>確認排入這一格</button></section></div>}
    <button className="danger-button archive-project-button" onClick={() => window.confirm("確定讓這張織光杼進入封存嗎？作品仍會保留在 Notion。") && void patchShuttle({ status: "archived" }, "織光杼已封存。")}>封存這張織光杼</button>
  </section>;
}
