"use client";

import { useEffect, useMemo, useState } from "react";
import { type DailyTaskCategory, type WeeklyBoard } from "@/lib/dojo/formal";
import {
  normalizeWeeklyTemplateLibrary,
  templateToCell,
  type WeeklyTaskTemplate,
  type WeeklyTemplateLibrary,
} from "@/lib/dojo/weeklyTemplates";

type SourceTab = "routine" | "project" | "custom";

async function json<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((value as { error?: string }).error ?? "操作失敗");
  return value as T;
}

function newCustomTemplate(): WeeklyTaskTemplate {
  return {
    id: `mine-${Date.now().toString(36)}`, name: "", shortLabel: "", category: "important", source: "custom",
    completionMode: "single", target: 1, unit: "次", criteria: "", note: "", templateCategory: "我的範本",
    projectId: null, subproject: "", status: "active", builtIn: false,
  };
}

export default function WeeklyTaskLibrary({ board, disabled, onApply }: {
  board: WeeklyBoard;
  disabled: boolean;
  onApply: (board: WeeklyBoard, message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<WeeklyTemplateLibrary | null>(null);
  const [tab, setTab] = useState<SourceTab>("routine");
  const [category, setCategory] = useState("全部");
  const [projectId, setProjectId] = useState("");
  const [subproject, setSubproject] = useState("全部");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, WeeklyTaskTemplate>>({});
  const [custom, setCustom] = useState<WeeklyTaskTemplate>(newCustomTemplate);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || library) return;
    fetch("/api/dojo/bingo/templates", { cache: "no-store" })
      .then((response) => json<{ library: WeeklyTemplateLibrary }>(response))
      .then((value) => setLibrary(normalizeWeeklyTemplateLibrary(value.library)))
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [library, open]);

  const active = useMemo(() => library?.templates.filter((item) => item.status === "active") ?? [], [library]);
  const categories = useMemo(() => ["全部", ...new Set(active.filter((item) => item.source === "routine").map((item) => item.templateCategory))], [active]);
  const currentProject = library?.projects.find((item) => item.id === projectId);
  const subprojects = useMemo(() => ["全部", ...new Set(active.filter((item) => item.projectId === projectId).map((item) => item.subproject).filter(Boolean))], [active, projectId]);
  const shown = active.filter((item) => tab === "routine"
    ? item.source === "routine" && (category === "全部" || item.templateCategory === category)
    : tab === "project"
      ? item.source === "project" && (!projectId || item.projectId === projectId) && (subproject === "全部" || item.subproject === subproject)
      : item.source === "custom");

  function toggle(template: WeeklyTaskTemplate) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(template.id)) next.delete(template.id); else next.add(template.id);
      return next;
    });
    setDrafts((current) => ({ ...current, [template.id]: current[template.id] ?? { ...template } }));
  }

  async function persist(next: WeeklyTemplateLibrary, notice?: string) {
    setSaving(true); setError(null);
    try {
      const result = await json<{ library: WeeklyTemplateLibrary }>(await fetch("/api/dojo/bingo/templates", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ library: next }),
      }));
      setLibrary(result.library);
      if (notice) await onApply(board, notice);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); throw caught; }
    finally { setSaving(false); }
  }

  async function addSelected() {
    if (!library) return;
    const choices = [...selected].map((id) => drafts[id] ?? library.templates.find((item) => item.id === id)).filter((item): item is WeeklyTaskTemplate => Boolean(item));
    const empty = board.cells.filter((cell) => cell.index !== 12 && !cell.text.trim());
    if (choices.length > empty.length) { setError(`已選 ${choices.length} 項，但盤面只剩 ${empty.length} 個空白格。`); return; }
    const additions = new Map(empty.slice(0, choices.length).map((cell, index) => [cell.index, choices[index]]));
    const next: WeeklyBoard = {
      ...board, version: 3, colorsConfirmedAt: null,
      rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 1 },
      cells: board.cells.map((cell) => additions.has(cell.index) ? templateToCell(additions.get(cell.index)!, cell.index, board.weekStart) : cell),
    };
    try {
      await onApply(next, `已加入 ${choices.length} 個本週任務；空白格仍可在週中補入。`);
      setSelected(new Set()); setDrafts({});
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }

  async function saveCustom(addToBoard: boolean) {
    if (!library || !custom.name.trim()) { setError("請先填任務名稱。"); return; }
    const template = { ...custom, name: custom.name.trim(), shortLabel: custom.shortLabel.trim() || custom.name.trim().slice(0, 12) };
    const nextLibrary = { ...library, templates: [...library.templates.filter((item) => item.id !== template.id), template], updatedAt: new Date().toISOString() };
    try {
      await persist(nextLibrary);
      if (addToBoard) {
        const empty = board.cells.find((cell) => cell.index !== 12 && !cell.text.trim());
        if (!empty) { setError("週盤已沒有空白格；範本已保存，但尚未加入本週。"); return; }
        await onApply({ ...board, version: 3, cells: board.cells.map((cell) => cell.index === empty.index ? templateToCell(template, cell.index, board.weekStart) : cell) }, "已保存為我的範本並加入本週。");
      }
      setCustom(newCustomTemplate()); setTab("custom");
    } catch { /* persist/onApply 已顯示錯誤 */ }
  }

  async function setTemplateStatus(template: WeeklyTaskTemplate, status: "active" | "archived") {
    if (!library) return;
    await persist({ ...library, templates: library.templates.map((item) => item.id === template.id ? { ...item, status } : item), updatedAt: new Date().toISOString() });
  }

  async function editTemplate(template: WeeklyTaskTemplate) {
    if (!library) return;
    const name = window.prompt("範本名稱", template.name)?.trim();
    if (!name) return;
    const criteria = window.prompt("完成條件", template.criteria);
    if (criteria === null) return;
    await persist({ ...library, templates: library.templates.map((item) => item.id === template.id ? { ...item, name: name.slice(0, 300), criteria: criteria.slice(0, 1000) } : item), updatedAt: new Date().toISOString() });
  }

  async function applyBundle(bundleId: string) {
    if (!library) return;
    const bundle = library.bundles.find((item) => item.id === bundleId);
    if (!bundle) return;
    const entries = bundle.templateIds.map((id) => library.templates.find((item) => item.id === id)).filter((item): item is WeeklyTaskTemplate => Boolean(item && item.status === "active"));
    setSelected(new Set(entries.map((item) => item.id)));
    setDrafts(Object.fromEntries(entries.map((item) => [item.id, { ...item }])));
    setTab("routine"); setCategory("英文");
  }

  async function saveSelectionAsBundle() {
    if (!library || selected.size === 0) return;
    const name = window.prompt("範本組合名稱", "我的週盤組合")?.trim();
    if (!name) return;
    const id = `bundle-${Date.now().toString(36)}`;
    await persist({ ...library, bundles: [...library.bundles, { id, name: name.slice(0, 100), templateIds: [...selected], status: "active", builtIn: false }], updatedAt: new Date().toISOString() });
  }

  return <section className="ritual-card weekly-template-library">
    <button type="button" className="weekly-setup-head" onClick={() => setOpen((value) => !value)}>
      <span><small>彈性組盤</small><b>加入週盤任務</b></span><em>常駐・專案・自由建立</em>
    </button>
    {open && <div className="weekly-template-body">
      <p>先選範本，再一次加入多格。建議先排 16～20 格，但沒有最低數量，也不必填滿。</p>
      <div className="weekly-template-tabs">
        {(["routine", "project", "custom"] as SourceTab[]).map((key) => <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{key === "routine" ? "常駐任務" : key === "project" ? "本週專案" : "自由建立"}</button>)}
      </div>
      {tab === "routine" && <>
        <div className="template-filter-row">{categories.map((item) => <button key={item} className={category === item ? "on" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        {library?.bundles.filter((item) => item.status === "active").map((bundle) => <button key={bundle.id} className="bundle-button" onClick={() => void applyBundle(bundle.id)}>整組預覽・{bundle.name}</button>)}
      </>}
      {tab === "project" && <>
        <select className="field" value={projectId} onChange={(event) => { setProjectId(event.target.value); setSubproject("全部"); }}>
          <option value="">選擇專案</option>{library?.projects.map((item) => <option key={item.id} value={item.id}>{item.statusLabel}｜{item.name}</option>)}
        </select>
        {currentProject?.recommendationAfter && <small className="template-project-note">目前暫緩；{currentProject.recommendationAfter} 前不主動推薦，但仍可自行選擇。</small>}
        {projectId && <div className="template-filter-row">{subprojects.map((item) => <button key={item} className={subproject === item ? "on" : ""} onClick={() => setSubproject(item)}>{item}</button>)}</div>}
      </>}
      {tab !== "custom" && <div className="template-pick-list">{shown.map((template) => {
        const checked = selected.has(template.id); const draft = drafts[template.id] ?? template;
        return <article key={template.id} className={checked ? "selected" : ""}>
          <button className="template-pick-main" onClick={() => toggle(template)}><span>{checked ? "✓" : "+"}</span><b>{template.name}</b><small>{template.completionMode === "count" ? `${template.target} ${template.unit}` : template.completionMode === "specified" ? "指定成果" : template.completionMode === "free" ? "自由成果" : "完成一次"}</small></button>
          {checked && <div className="template-preview-edit">
            <input className="field" value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [template.id]: { ...draft, name: event.target.value } }))} aria-label={`${template.name}本週名稱`} />
            <input className="field" value={draft.criteria} onChange={(event) => setDrafts((current) => ({ ...current, [template.id]: { ...draft, criteria: event.target.value } }))} aria-label={`${template.name}完成條件`} />
          </div>}
        </article>;
      })}</div>}
      {tab === "custom" && <div className="custom-template-editor">
        <label>任務名稱<input className="field" value={custom.name} onChange={(event) => setCustom({ ...custom, name: event.target.value })} /></label>
        <label>任務來源<select className="field" value={custom.source} onChange={(event) => setCustom({ ...custom, source: event.target.value as WeeklyTaskTemplate["source"] })}><option value="custom">自由建立</option><option value="routine">常駐任務</option><option value="project">本週專案</option></select></label>
        {custom.source === "project" && <label>所屬專案<select className="field" value={custom.projectId ?? ""} onChange={(event) => setCustom({ ...custom, projectId: event.target.value || null })}><option value="">請選擇</option>{library?.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <div className="two"><label>三色<select className="field" value={custom.category} onChange={(event) => setCustom({ ...custom, category: event.target.value as DailyTaskCategory })}><option value="important">重要</option><option value="hobby">喜歡</option><option value="health">照顧自己</option></select></label>
        <label>完成規則<select className="field" value={custom.completionMode} onChange={(event) => setCustom({ ...custom, completionMode: event.target.value as WeeklyTaskTemplate["completionMode"] })}><option value="single">完成一次</option><option value="count">累積次數</option><option value="specified">指定成果</option><option value="free">自由成果</option></select></label></div>
        {custom.completionMode === "count" && <div className="two"><label>目標次數<input className="field" type="number" min="1" max="99" value={custom.target} onChange={(event) => setCustom({ ...custom, target: Number(event.target.value) || 1 })} /></label><label>單位<input className="field" value={custom.unit} onChange={(event) => setCustom({ ...custom, unit: event.target.value })} /></label></div>}
        <label>完成條件<textarea className="field" rows={2} value={custom.criteria} onChange={(event) => setCustom({ ...custom, criteria: event.target.value })} /></label>
        <label>補充說明<textarea className="field" rows={2} value={custom.note} onChange={(event) => setCustom({ ...custom, note: event.target.value })} /></label>
        <div className="two"><button disabled={saving || disabled} onClick={() => void saveCustom(false)}>儲存為我的範本</button><button className="primary" disabled={saving || disabled} onClick={() => void saveCustom(true)}>儲存並加入本週</button></div>
      </div>}
      {selected.size > 0 && <div className="template-selection-bar"><span>已選 {selected.size} 項</span><button onClick={() => void saveSelectionAsBundle()}>存成組合</button><button className="primary" disabled={disabled} onClick={() => void addSelected()}>加入空白格</button></div>}
      <button className="template-manage-toggle" onClick={() => setManaging((value) => !value)}>{managing ? "收起範本管理" : "管理／封存範本"}</button>
      {managing && <div className="template-manage-list">
        {library?.projects.map((item) => <div key={item.id}><span>{item.name}</span><select value={item.status} onChange={(event) => library && void persist({ ...library, projects: library.projects.map((project) => project.id === item.id ? { ...project, status: event.target.value as typeof item.status, statusLabel: event.target.options[event.target.selectedIndex].text } : project), updatedAt: new Date().toISOString() })}><option value="priority">優先進行</option><option value="active">進行中</option><option value="next">下一階段</option><option value="paused">暫緩</option></select></div>)}
        {library?.templates.map((item) => <div key={item.id}><span>{item.name}</span><span><button onClick={() => void editTemplate(item)}>編輯</button> <button onClick={() => void setTemplateStatus(item, item.status === "active" ? "archived" : "active")}>{item.status === "active" ? "封存" : "重新啟用"}</button></span></div>)}
      </div>}
      {error && <p className="form-error">{error}</p>}
    </div>}
  </section>;
}
