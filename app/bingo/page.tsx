"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import ReadingInsightPlanner from "@/app/components/ReadingInsightPlanner";
import WeeklyTaskLibrary, {type WeeklySourceTab} from "@/app/components/WeeklyTaskLibrary";
import WeeklyIcon, { WeeklyMotif } from "@/app/components/WeeklyIcon";
import {
  BINGO_LINES,
  DAILY_TASK_CATEGORIES,
  addCalendarDays,
  completedBingoLines,
  completedBingoLineIds,
  emptyWeeklyBoard,
  mondayOf,
  taipeiTodayISO,
  type DailyRecord,
  type DailyTaskCategory,
  type BingoCell,
  type WeeklyBoard,
} from "@/lib/dojo/formal";
import type { WeeklyCarryLink } from "@/lib/dojo/weeklyTasks";
import "./weekly.css";
import { useBackableState } from "@/lib/dojo/backstack";

type WeeklyTab = "board" | "library" | "reflection" | "archive";
const WEEKLY_TABS: {key: WeeklyTab; label: string; icon: string}[] = [
  {key: "board", label: "本週", icon: "grid"}, {key: "library", label: "組盤", icon: "layers"},
  {key: "reflection", label: "回望", icon: "write"}, {key: "archive", label: "封存", icon: "history"},
];
function weekDescription(weekStart: string) {
  const thursday = new Date(`${weekStart}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const number = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year} 年 · 第 ${number} 週`;
}

const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];
const ENGLISH_CELL_SHORT_LABELS: Record<string, string> = {
  "journal-translation": "日記自譯",
  "vocabforge-journal-round": "生詞一輪",
  "vocabforge-journal-round-1": "生詞第一輪",
  "vocabforge-journal-round-2": "生詞第二輪",
  "work-five-expressions": "說法實戰",
  "speaking-scenario": "情境對話",
  "shadowing-twice": "跟讀 ×2",
  "speaking-maintenance": "口說維持",
  "topic-select-video": "主題選片",
  "topic-watch-absorb": "觀看吸收",
  "topic-context-talk": "主題對談",
  "magic-tree-house-read": "故事閱讀",
  "magic-tree-house-retell": "讀後重述",
  "english-context-chat": "語境聊天",
  "journal-translation-1": "自譯一段",
  "journal-translation-2": "再譯一段",
  "vocabforge-one-round": "詞彙一輪",
  "weekly-topic-understanding": "主題理解",
  "weekly-topic-expression": "主題表達",
  "independent-material-understanding": "素材理解",
  "independent-material-expression": "素材表達",
  "vocabforge-scientific-week": "詞彙淬煉",
  "cross-date-revisit": "跨日回訪",
  "work-expression-practice": "工作實戰",
};

function bingoCellShortLabel(cell: BingoCell) {
  return cell.shortLabel.trim() || (cell.learning?.trackKey === "english" ? ENGLISH_CELL_SHORT_LABELS[cell.learning.templateKey] : "") || cell.text;
}

function fmtWeek(weekStart: string) {
  const end = addCalendarDays(weekStart, 6);
  const compact = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${Number(month)}/${Number(day)}`;
  };
  return `${compact(weekStart)} — ${compact(end)}`;
}

function shuffledBoard(board: WeeklyBoard): WeeklyBoard {
  const movable = board.cells.filter((cell) => cell.index !== 12);
  const shuffled = [...movable];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
  }
  if (shuffled.every((cell, index) => cell.index === movable[index].index)) {
    shuffled.push(shuffled.shift()!);
  }
  let cursor = 0;
  return {
    ...board,
    cells: board.cells.map((cell) => {
      if (cell.index === 12) return cell;
      const moved = shuffled[cursor];
      cursor += 1;
      return { ...moved, index: cell.index };
    }),
  };
}

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function BingoPage() {
  const today = useMemo(() => taipeiTodayISO(), []);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [board, setBoard] = useState<WeeklyBoard>(() => emptyWeeklyBoard(weekStart));
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WeeklyTab>("board");
  const [libraryTab, setLibraryTab] = useState<WeeklySourceTab>("routine");
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [weekDateDraft, setWeekDateDraft] = useState(weekStart);
  const [categoryFilter, setCategoryFilter] = useState<DailyTaskCategory | "all">("all");
  const [archiveBoards, setArchiveBoards] = useState<WeeklyBoard[]>([]);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [shortLabelDraft, setShortLabelDraft] = useState("");
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [cellTextDraft, setCellTextDraft] = useState("");
  const [criteriaDraft, setCriteriaDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("1");
  const [unitDraft, setUnitDraft] = useState("次");
  const [modeDraft, setModeDraft] = useState<BingoCell["completion"]["mode"]>("single");
  const [noteDraft, setNoteDraft] = useState("");
  const [checklistDraft,setChecklistDraft]=useState("");
  const [view,setView]=useState<"board"|"list">("board");
  const [carryLinks,setCarryLinks]=useState<WeeklyCarryLink[]>([]);
  const [carryTarget,setCarryTarget]=useState("");
  const [showRollover,setShowRollover]=useState(false);
  const gridRef=useRef<HTMLDivElement>(null);
  const [lineGeometry,setLineGeometry]=useState<{width:number;height:number;points:{x:number;y:number}[]}|null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [sourceTypeDraft, setSourceTypeDraft] = useState<BingoCell["sourceType"]>("manual");
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState("本週行光盤");
  const detailOpen = selected !== null && !editing;

  useBackableState(weekPickerOpen, () => setWeekPickerOpen(false));
  useBackableState(detailOpen, () => setSelected(null));
  useBackableState(boardSettingsOpen, () => setBoardSettingsOpen(false));

  useEffect(() => {
    if (!detailOpen && !boardSettingsOpen && !weekPickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailOpen, boardSettingsOpen, weekPickerOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      setSelected(null);
      setEditing(false);
      setBoardSettingsOpen(false);
      try {
        const boardResponse = await fetch(`/api/dojo/bingo?week=${weekStart}`, { cache: "no-store" });
        const json = await readResponse<{ board: WeeklyBoard }>(boardResponse);
        const linksResponse=await fetch(`/api/dojo/bingo/continue?week=${weekStart}`,{cache:'no-store'});
        const linksJson=await readResponse<{links:WeeklyCarryLink[]}>(linksResponse);
        if (!cancelled) {
          setCarryLinks(linksJson.links);setShowRollover(false);
          setBoard(json.board);
          setBoardTitleDraft(json.board.title);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  useEffect(() => {
    function syncTab() {
      const key = window.location.hash.slice(1);
      if (WEEKLY_TABS.some(tab => tab.key === key)) setActiveTab(key as WeeklyTab);
      else setActiveTab("board");
    }
    syncTab();
    window.addEventListener("popstate", syncTab);
    window.addEventListener("hashchange", syncTab);
    return () => { window.removeEventListener("popstate", syncTab); window.removeEventListener("hashchange", syncTab); };
  }, []);

  function navigateTab(tab: WeeklyTab) {
    setActiveTab(tab);
    if (window.location.hash !== `#${tab}`) window.history.pushState(null, "", `#${tab}`);
  }

  useEffect(() => {
    if (activeTab !== "archive") return;
    let cancelled = false;
    async function load() {
      setArchiveLoading(true);
      try {
        const response = await fetch("/api/dojo/bingo?archive=true", {cache: "no-store"});
        const json = await readResponse<{boards: WeeklyBoard[]}>(response);
        if (!cancelled) setArchiveBoards(json.boards);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally { if (!cancelled) setArchiveLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [activeTab, board.archivedAt]);

  function openCell(index: number) {
    const cell = board.cells[index];
    setSelected(index);
    setEvidenceNote(cell.evidenceNote);
    setShortLabelDraft(bingoCellShortLabel(cell));
    setCellTextDraft(cell.text);
    setCriteriaDraft(cell.completion.criteria ?? "");
    setTargetDraft(String(cell.completion.target));
    setUnitDraft(cell.completion.unit);
    setModeDraft(cell.completion.mode);
    setNoteDraft(cell.note);
    setChecklistDraft(cell.checklist?.map(item=>item.text).join("\n")||"");
    setCarryTarget(carryLinks.find(l=>l.taskInstanceId===cell.taskInstanceId)?.targetWeek||addCalendarDays(weekStart,7));
    setSourceTypeDraft(cell.sourceType);
    setCellEditOpen(false);
    setMoveTarget("");
  }

  async function save(next: WeeklyBoard, message?: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/bingo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, board: { ...next, version: 3, rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 1 } } }),
      });
      const json = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(json.board);
      if (message) setNotice(message);
      return json.board;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function removeCells(indexes: number[], label: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dojo/bingo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-cells", weekStart, cellIndexes: indexes }),
      });
      const json = await readResponse<{ board: WeeklyBoard; removed: number; preservedDailyTasks: number }>(response);
      setBoard(json.board);
      setSelected(null);
      setCellEditOpen(false);
      const preserved = json.preservedDailyTasks > 0 ? `；${json.preservedDailyTasks} 筆今天任務已保留並解除週盤連結` : "";
      setNotice(`已從本週移除「${label}」${json.removed} 格${preserved}。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function saveCellEdit() {
    if (selected === null || board.archivedAt) return;
    const text = cellTextDraft.trim();
    const oldItems=board.cells[selected].checklist||[];
    const used=new Set<string>();
    const checklist=checklistDraft.split(/\r?\n/).map(t=>t.trim()).filter(Boolean).slice(0,24).map((text,i)=>{const prior=oldItems.find(item=>item.text===text&&!used.has(item.id));if(prior)used.add(prior.id);return {id:prior?.id||`item-${Date.now()}-${i}`,text:text.slice(0,300),done:prior?.done||false}});
    if(modeDraft==='checklist'&&!checklist.length){setError('子項目清單至少需要一項。');return;}
    const target = modeDraft==='checklist'?checklist.length:modeDraft === "count" ? Math.max(1, Math.min(99, Math.round(Number(targetDraft) || 1))) : 1;
    const unit = unitDraft.trim().slice(0, 20) || "次";
    if (!text) {
      setError("任務名稱不能留空；若不需要這格，請使用「從本週刪除」。");
      return;
    }
    const next: WeeklyBoard = {
      ...board,
      colorsConfirmedAt: null,
      cells: board.cells.map((cell) => {
        if (cell.index !== selected) return cell;
        const progress = modeDraft==="checklist"?checklist.filter(item=>item.done).length:Math.min(target, cell.completion.progress);
        const completed = progress >= target;
        return {
          ...cell,
          checklist,
          text: text.slice(0, 300),
          sourceType: sourceTypeDraft,
          shortLabel: shortLabelDraft.trim().slice(0, 12),
          taskInstanceId: cell.taskInstanceId ?? `task:${weekStart}:${Date.now().toString(36)}`,
          completion: {
            ...cell.completion,
            mode: modeDraft,
            target,
            progress,
            unit,
            requiresEvidence: modeDraft === "free" || Boolean(cell.learning && cell.completion.requiresEvidence),
            criteria: criteriaDraft.trim().slice(0, 1000),
          },
          note: noteDraft.trim().slice(0, 2000),
          completed,
          completedAt: completed ? (cell.completedAt ?? new Date().toISOString()) : null,
        };
      }),
    };
    try {
      const saved = await save(next, "任務內容與完成條件已更新；請重新確認本週三色。");
      const cell = saved.cells[selected];
      setCellTextDraft(cell.text);
      setShortLabelDraft(bingoCellShortLabel(cell));
      setCriteriaDraft(cell.completion.criteria ?? "");
      setTargetDraft(String(cell.completion.target));
      setUnitDraft(cell.completion.unit);
      setModeDraft(cell.completion.mode);
      setNoteDraft(cell.note);
      setSourceTypeDraft(cell.sourceType);
      setCellEditOpen(false);
    } catch { /* save 已顯示錯誤 */ }
  }

  async function removeSelectedCell() {
    if (selected === null || board.archivedAt) return;
    const cell = board.cells[selected];
    const detail = cell.assignedDate
      ? "已排入今天的任務會保留，但會解除週盤連結。"
      : cell.completed ? "已完成的生活與學習紀錄會保留。" : "";
    if (!window.confirm(`確定從本週刪除「${bingoCellShortLabel(cell)}」嗎？${detail}`)) return;
    try { await removeCells([selected], bingoCellShortLabel(cell)); } catch { /* removeCells 已顯示錯誤 */ }
  }

  async function replaceSelectedCell() {
    if (selected === null || board.archivedAt) return;
    const index = selected;
    const cell = board.cells[index];
    const warning = cell.completion.progress > 0 || cell.completed ? "舊任務的進度會保留在本週歷史，新任務不會繼承。" : "新任務不會繼承舊任務資料。";
    if (!window.confirm(`確定替換「${bingoCellShortLabel(cell)}」嗎？${warning}`)) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dojo/bingo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "replace-cells", weekStart, cellIndexes: [index] }) });
      const value = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(value.board); setNotice("舊任務已保留在本週歷史；請為這個位置加入新任務。");
      const empty = value.board.cells[index];
      setCellTextDraft(""); setShortLabelDraft(""); setCriteriaDraft(""); setTargetDraft("1"); setUnitDraft("次"); setModeDraft("single"); setNoteDraft(empty.note); setCellEditOpen(true);
      setSourceTypeDraft("manual");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function moveSelectedCell() {
    if (selected === null || !moveTarget || board.archivedAt) return;
    const targetIndex = Number(moveTarget);
    const source = board.cells[selected];
    const target = board.cells[targetIndex];
    if (!target || target.index === 12 || target.text.trim()) { setError("請選擇一個空白格。"); return; }
    const next = { ...board, cells: board.cells.map((cell) => cell.index === selected ? { ...target, index: selected } : cell.index === targetIndex ? { ...source, index: targetIndex } : cell) };
    try { await save(next, `已移到第 ${targetIndex + 1} 格；任務 ID 與進度保持不變。`); setSelected(targetIndex); setMoveTarget(""); }
    catch { /* save 已顯示錯誤 */ }
  }

  async function saveBoardTitle() {
    const title = boardTitleDraft.trim();
    if (!title) { setError("週盤名稱不能留空。"); return; }
    try {
      await save({ ...board, title: title.slice(0, 200) }, "週盤名稱已更新。");
      setBoardSettingsOpen(false);
    } catch { /* save 已顯示錯誤 */ }
  }

  async function deleteBoard() {
    if (board.archivedAt) return;
    const contentCount = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim()).length;
    const confirmed = window.confirm(`確定刪除 ${fmtWeek(weekStart)} 的整張週盤嗎？目前有 ${contentCount} 個格子；今天任務與已完成紀錄會保留。`);
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/dojo/bingo?week=${weekStart}`, { method: "DELETE" });
      const json = await readResponse<{ board: WeeklyBoard; deleted: boolean; preservedDailyTasks: number }>(response);
      setBoard(json.board);
      setBoardTitleDraft(json.board.title);
      setBoardSettingsOpen(false);
      setSelected(null);
      const preserved = json.preservedDailyTasks > 0 ? `，並保留 ${json.preservedDailyTasks} 筆今天任務` : "";
      setNotice(json.deleted ? `本週週盤已移至 Notion 垃圾桶${preserved}。` : "本週原本就是空白週盤。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeProgress(direction: -1 | 1, checklistId?:string) {
    if (selected === null || selected === 12 || board.archivedAt) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dojo/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "progress-bingo", weekStart, cellIndex: selected, direction, evidenceNote, checklistId }),
      });
      const json = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(json.board);
      const cell = json.board.cells[selected];
      setNotice(cell.completed ? (cell.learning?"這一格已完成，進度已回寫修習所。":"這一格已完成，紀錄已儲存。") : `已記下 ${cell.completion.progress}/${cell.completion.target} ${cell.completion.unit}。`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function assignToToday() {
    if (selected === null || selected === 12 || board.archivedAt) return;
    const cell = board.cells[selected];
    if (!cell.text.trim()) return;
    const category = cell.category;
    if (!category) { setError("請先在週盤為這一格決定重要、喜歡或照顧自己。"); return; }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const dailyResponse = await fetch(`/api/dojo/daily?date=${today}`, { cache: "no-store" });
      const dailyJson = await readResponse<{ record: DailyRecord }>(dailyResponse);
      const existing = dailyJson.record.tasks[category].text.trim();
      if (existing && existing !== cell.text.trim()) {
        const replace = window.confirm(`「${DAILY_TASK_CATEGORIES[category].label}」已有內容，要用這一格取代嗎？`);
        if (!replace) return;
      }
      const response = await fetch("/api/dojo/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign-bingo", weekStart, cellIndex: selected, date: today, category }),
      });
      const json = await readResponse<{ board: WeeklyBoard }>(response);
      setBoard(json.board);
      setNotice(`已排入今天的「${DAILY_TASK_CATEGORIES[category].label}」。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setCellCategory(category: DailyTaskCategory) {
    if (selected === null || board.archivedAt) return;
    const next: WeeklyBoard = {
      ...board,
      version: 3,
      rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 1 },
      colorsConfirmedAt: null,
      cells: board.cells.map((cell) => cell.index === selected ? { ...cell, category } : cell),
    };
    try { await save(next, `已設為「${DAILY_TASK_CATEGORIES[category].label}」。`); } catch { /* save 已顯示錯誤 */ }
  }

  async function confirmColors() {
    const uncolored = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && !cell.category).length;
    if (uncolored) { setError(`還有 ${uncolored} 個已填格子尚未定色。`); return; }
    try {
      await save({ ...board, version: 3, rules: { planningDay: 0, crossColorLines: true, minimumLineColors: 1 }, colorsConfirmedAt: new Date().toISOString() }, "本週三色已確認；排入今天時會沿用這裡的分類。");
    } catch { /* save 已顯示錯誤 */ }
  }

  async function shuffleCells() {
    if (board.archivedAt || board.cells.some((cell) => cell.assignedDate)) return;
    setSelected(null);
    try {
      await save(shuffledBoard(board), "24 個一般格已隨機換位；中央自在格保持原位。");
    } catch { /* save 已顯示錯誤 */ }
  }

  async function archiveBoard() {
    if (board.archivedAt) return;
    const confirmed = window.confirm("封存後仍可回看，但這週盤將不能再編輯。確定封存嗎？");
    if (!confirmed) return;
    try {
      await save({ ...board, completedLineIds: completedBingoLineIds(board), archivedAt: new Date().toISOString() }, "本週週盤已封存。");
    } catch {
      // save() 已顯示錯誤。
    }
  }

  useEffect(()=>{
    const grid=gridRef.current;if(!grid||view!=='board'||activeTab!=='board')return;
    function measure(){if(!grid)return;const box=grid.getBoundingClientRect();const nodes=grid.querySelectorAll<HTMLElement>('[data-cell-index]');const points=Array.from({length:25},()=>({x:0,y:0}));nodes.forEach(node=>{const rect=node.getBoundingClientRect();points[Number(node.dataset.cellIndex)]={x:rect.left-box.left+rect.width/2,y:rect.top-box.top+rect.height/2}});setLineGeometry({width:box.width,height:box.height,points});}
    measure();const observer=new ResizeObserver(measure);observer.observe(grid);return()=>observer.disconnect();
  },[board,editing,loading,view,activeTab]);
  async function setDisposition(disposition?:'paused'|'cancelled'){
    if(selected===null)return;
    try{await save({...board,cells:board.cells.map(c=>c.index===selected?{...c,disposition}:c)},disposition==='paused'?'任務已暫停，進度保留。':disposition==='cancelled'?'任務已取消，紀錄保留。':'任務已恢復。');}catch{}
  }
  async function continueTask(index:number,targetWeek:string){
    const cell=board.cells[index];setSaving(true);setError(null);
    try{const result=await readResponse<{link:WeeklyCarryLink}>(await fetch('/api/dojo/bingo/continue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({weekStart,targetWeek,taskInstanceId:cell.taskInstanceId})}));setCarryLinks(current=>[...current.filter(l=>l.taskInstanceId!==cell.taskInstanceId),result.link]);setNotice(`已續排至 ${targetWeek}，原週紀錄保留。`);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false)}
  }
  const completed = board.cells.filter((cell) => cell.index !== 12 && cell.completed).length;
  const activeLineIds = board.archivedAt && board.completedLineIds.length ? board.completedLineIds : completedBingoLineIds(board);
  const connectedIndices=new Set<number>(activeLineIds.flatMap(id=>[...(BINGO_LINES[Number(id.replace('line-',''))]||[])]));
  const selectedCell = selected === null ? null : board.cells[selected];
  const selectedLink=carryLinks.find(l=>l.taskInstanceId===selectedCell?.taskInstanceId);
  const selectedBlocked=Boolean(selectedCell?.disposition||selectedLink);
  const unfinished=board.cells.filter(c=>c.index!==12&&c.text&&!c.completed&&!c.disposition&&!carryLinks.some(l=>l.taskInstanceId===c.taskInstanceId));
  const colorCounts = CATEGORIES.map((category) => ({
    category,
    count: board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && cell.category === category).length,
  }));
  const uncoloredCount = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim() && !cell.category).length;
  const hasAssignedCells = board.cells.some((cell) => Boolean(cell.assignedDate));
  const hasBoardContent = board.cells.some((cell) => cell.index !== 12 && Boolean(cell.text.trim()));
  const clearedManagedCells = board.cells.filter((cell) =>
    cell.index !== 12 && !cell.text.trim() && Boolean(cell.sourceId || cell.learning || cell.assignedDate || cell.completion.progress)
  ).length;

  return (
    <section className="screen bingo-screen">
      <div className="weekly-heading">
        <div><h1>週盤</h1><p>把想推進的事，放進一週的生活。</p></div>
        <button className="weekly-icon-button" disabled={loading} aria-label="週盤設定" onClick={() => {setBoardTitleDraft(board.title); setBoardSettingsOpen(true);}}><WeeklyIcon name="settings"/></button>
      </div>
      <div className="weekly-week-picker" aria-label="切換週盤">
        <button aria-label="查看上一週" onClick={() => setWeekStart(addCalendarDays(weekStart, -7))}><WeeklyIcon name="back"/></button>
        <button className="weekly-date-select" aria-label="選擇週盤日期" onClick={() => {setWeekDateDraft(weekStart); setWeekPickerOpen(true);}}><b>{fmtWeek(weekStart)}</b><span>{weekDescription(weekStart)}</span></button>
        <button aria-label="查看下一週" onClick={() => setWeekStart(addCalendarDays(weekStart, 7))}><WeeklyIcon name="arrow"/></button>
      </div>
      <nav className="weekly-page-tabs" aria-label="週盤功能">
        {WEEKLY_TABS.map(tab => <button key={tab.key} aria-current={activeTab === tab.key ? "page" : undefined} onClick={() => navigateTab(tab.key)}><WeeklyIcon name={tab.icon}/>{tab.label}</button>)}
      </nav>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}
      {loading && <div className="empty">正在讀取週盤…</div>}

      {activeTab === "archive" && <section className="weekly-archive-view" aria-label="週盤封存紀錄">
        <div className="weekly-section-intro"><h2>收好走過的一週</h2><p>保留當時的任務、完成進度與每週回望。</p></div>
        {archiveLoading ? <p className="empty" role="status">正在讀取封存週盤…</p> : archiveBoards.filter(item => item.archivedAt).length === 0 ? <div className="weekly-empty-state"><WeeklyIcon name="history"/><h3>還沒有封存的週盤</h3><p>完成每週回望後，可以把這一週收在這裡。</p><button onClick={() => navigateTab("reflection")}>前往每週回望</button></div> : <div className="weekly-archive-list">{archiveBoards.filter(item => item.archivedAt).map(item => <button key={item.weekStart} onClick={() => {setWeekStart(item.weekStart); navigateTab("board");}}><span className="weekly-archive-date"><b>{item.weekStart.slice(5).replace("-", "/")}</b><small>{item.weekStart.slice(0,4)}</small></span><span><b>{item.title}</b><small>{item.cells.filter(cell => cell.index !== 12 && cell.completed).length}/24 完成 · {completedBingoLines(item)} 條連線</small></span><WeeklyIcon name="arrow"/></button>)}</div>}
      </section>}

      {weekPickerOpen && <div className="modal bingo-detail-modal" onClick={event => event.target === event.currentTarget && setWeekPickerOpen(false)}><section className="sheet board-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="week-picker-title"><div className="toolbar bingo-detail-heading"><h2 id="week-picker-title">選擇週盤日期</h2><button onClick={() => setWeekPickerOpen(false)}>關閉</button></div><label htmlFor="weekly-date-input">這一週的任一天</label><input id="weekly-date-input" className="field" type="date" value={weekDateDraft} onChange={event => setWeekDateDraft(event.target.value)}/><div className="weekly-action-row"><button className="primary" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(weekDateDraft)} onClick={() => {setWeekStart(mondayOf(weekDateDraft)); setWeekPickerOpen(false);}}>查看這一週</button><button onClick={() => {setWeekStart(mondayOf(today)); setWeekPickerOpen(false);}}>回到本週</button></div></section></div>}

      {boardSettingsOpen && (
        <div className="modal bingo-detail-modal" onClick={(event) => event.target === event.currentTarget && setBoardSettingsOpen(false)}>
          <section className="sheet board-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="board-settings-title">
            <div className="bingo-detail-handle" aria-hidden="true" />
            <div className="toolbar bingo-detail-heading">
              <div><span className="eyebrow">{fmtWeek(weekStart)}</span><h2 id="board-settings-title">週盤設定</h2></div>
              <button onClick={() => setBoardSettingsOpen(false)}>關閉</button>
            </div>
            {board.archivedAt && <p className="muted-note">這一週已封存，設定與內容均保留供回看。</p>}
            <label htmlFor="board-settings-name">週盤名稱</label>
            <input id="board-settings-name" className="field" maxLength={200} disabled={Boolean(board.archivedAt)} value={boardTitleDraft} onChange={(event) => setBoardTitleDraft(event.target.value)} />
            <button type="button" className="primary" disabled={saving || Boolean(board.archivedAt) || !boardTitleDraft.trim() || boardTitleDraft.trim() === board.title} onClick={() => void saveBoardTitle()}>{saving ? "儲存中…" : "儲存名稱"}</button>
            <div className="board-delete-zone">
              <b>刪除整張週盤</b>
              <p>週盤會移至 Notion 垃圾桶。已排入今天的任務與完成紀錄會保留，但不再連回這張週盤。</p>
              <button type="button" className="danger-button" disabled={saving || Boolean(board.archivedAt)} onClick={() => void deleteBoard()}>刪除 {fmtWeek(weekStart)} 週盤</button>
            </div>
          </section>
        </div>
      )}

      {!loading && (
        <>
          <section className="weekly-tab-panel weekly-library-view" hidden={activeTab !== "library"} aria-label="組盤任務來源">
            <div className="weekly-section-intro"><h2>把想做的事，放進這一週</h2><p>本週還有 {board.cells.filter(cell => cell.index !== 12 && !cell.text.trim()).length} 個空白格。先選任務，再確認本週名稱與完成條件。</p></div>
          {!board.archivedAt && (
            <WeeklyTaskLibrary
              inline
              sourceTab={libraryTab}
              onSourceChange={setLibraryTab}
              reading={<ReadingInsightPlanner board={board} disabled={saving} showEmpty onApply={async next => {await save(next, "閱讀洞察已選入本週盤面；原始卡片仍留在閱讀萃取。");}}/>}
              key={weekStart}
              board={board}
              disabled={saving}
              onApply={async (next, message) => { await save(next, message); }}
            />
          )}

            {board.archivedAt && <div className="weekly-empty-state"><h3>這一週已經封存</h3><p>切換到未封存的週盤，再加入新任務。</p><button onClick={() => navigateTab("board")}>回到盤面</button></div>}
          </section>
          <div className="weekly-tab-panel" hidden={activeTab !== "board"} aria-label="本週週盤">
            <section className="weekly-summary" aria-label="本週摘要"><WeeklyMotif/><h2>{board.title}</h2><p>{board.archivedAt ? "把走過的一週，好好收在這裡。" : "讓重要、喜歡與照顧自己，都有位置。"}</p><div className="weekly-summary-meta"><span><b>{completed}</b> / 24 完成</span><span><b>{activeLineIds.length}</b> 條連線</span><span className="weekly-summary-state">{board.archivedAt ? "已封存" : `已安排 ${board.cells.filter(cell => cell.index !== 12 && cell.text.trim()).length} 格`}</span></div></section>
            <div className="weekly-board-layout"><div className="weekly-board-main">
          <section className="ritual-card board-card">
            <div className="weekly-board-top">
              <div className="weekly-view-tabs" aria-label="盤面顯示方式"><button aria-pressed={view === "board"} onClick={() => setView("board")}>盤面</button><button aria-pressed={view === "list"} onClick={() => {setView("list"); setEditing(false);}}>清單</button></div>
              {board.archivedAt ? <span className="saved-mark">唯讀</span> : <button className="weekly-edit-button" onClick={() => {setSelected(null); setEditing(value => !value);}}><WeeklyIcon name="write"/>{editing ? "完成編輯" : "編輯格子"}</button>}
            </div>
            {editing && <label className="weekly-title-editor">週盤名稱<input className="field" value={board.title} onChange={event => setBoard({...board, title: event.target.value})}/></label>}
            {view === "list" && <div className="weekly-list-filters" aria-label="篩選任務"><button aria-pressed={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>全部</button>{colorCounts.map(({category}) => <button key={category} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{category === "important" ? "重要" : category === "hobby" ? "喜歡" : "照顧自己"}</button>)}</div>}
            {view==='list'?<div className="weekly-task-list">{board.cells.filter(c=>c.index!==12&&c.text&&(categoryFilter==='all'||c.category===categoryFilter)).map(cell=><button key={cell.index} onClick={()=>openCell(cell.index)}><span>{String(cell.index+1).padStart(2,'0')} · {cell.completed?'✓ 完成':`${cell.completion.progress}/${cell.completion.target}`}</span><b>{cell.text}</b><small>{cell.completion.criteria}</small></button>)}</div>:<div ref={gridRef} className={`bingo-grid ${editing?'editing':''}`}>
              {!editing&&lineGeometry&&<svg className="bingo-lines" viewBox={`0 0 ${lineGeometry.width} ${lineGeometry.height}`} aria-hidden="true">{activeLineIds.map(id=>{const indices=BINGO_LINES[Number(id.replace('line-',''))];if(!indices)return null;const a=lineGeometry.points[indices[0]],b=lineGeometry.points[indices[4]];return <g key={id}><line className="line-underlay" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/><line className="line-thread" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/></g>})}</svg>}
              {board.cells.map(cell=>editing&&cell.index!==12?<textarea data-cell-index={cell.index} key={cell.index} value={cell.text} maxLength={300} disabled={Boolean(cell.assignedDate)||carryLinks.some(l=>l.taskInstanceId===cell.taskInstanceId)} onChange={e=>setBoard({...board,cells:board.cells.map(c=>c.index===cell.index?{...c,text:e.target.value}:c)})} placeholder={`${cell.index+1}`} aria-label={`第 ${cell.index+1} 格`}/>:<button data-cell-index={cell.index} key={cell.index} className={`bingo-cell ${cell.category||'uncolored'} ${cell.completed?'done':cell.completion.progress?'partial':cell.text?'assigned':'empty-cell'} ${cell.index===12?'free':''} ${connectedIndices.has(cell.index)?'in-line':''}`} onClick={()=>{if(cell.index!==12)openCell(cell.index)}} aria-label={cell.index===12?'自在格，已完成':`${cell.text||'加入任務'}，${cell.completed?'已完成':`${cell.completion.progress}/${cell.completion.target}`}`}>
                {cell.index === 12 ? <><WeeklyIcon name="spark" className="weekly-free-icon"/><span className="bingo-cell-title">自在格</span></> : cell.text ? <><span className="weekly-cell-meta"><span>{String(cell.index + 1).padStart(2, "0")}</span><span>{cell.disposition ? (cell.disposition === "paused" ? "暫停" : "取消") : cell.completed ? <WeeklyIcon name="check"/> : cell.completion.target > 1 ? `${cell.completion.progress}/${cell.completion.target}` : <WeeklyIcon name={cell.category === "health" ? "leaf" : cell.category === "hobby" ? "heart" : cell.category === "important" ? "target" : "compass"}/>}</span></span><span className="bingo-cell-title">{Array.from(bingoCellShortLabel(cell)).slice(0, 4).reduce((rows, c, i) => rows + c + (i === 1 ? "\n" : ""), "")}</span></> : <><WeeklyIcon name="plus" className="weekly-empty-plus"/><span className="weekly-empty-number">{String(cell.index + 1).padStart(2, "0")}</span></>}

              </button>)}
            </div>}
            {activeLineIds.length>0&&<aside className="weekly-connection-summary" role="status"><b><WeeklyIcon name="check"/> 已完成 {activeLineIds.length} 條連線</b><span>{activeLineIds.map(id=>{const i=Number(id.replace('line-',''));return i<5?`第 ${i+1} 橫列`:i<10?`第 ${i-4} 直行`:i===10?'左上至右下':'右上至左下'}).join('、')}</span></aside>}
            <div className="weekly-category-key">{colorCounts.map(({category, count}) => <button key={category} onClick={() => {setCategoryFilter(category); setView("list"); setEditing(false);}}><span className={`weekly-dot ${category}`}/>{category === "important" ? "重要" : category === "hobby" ? "喜歡" : "照顧自己"} <b>{count}</b></button>)}</div>
            <p className="weekly-board-hint">方格以兩行顯示四字簡稱，編號與進度置中排列；點開可看完整任務。中央自在格已完成，不計入24格。</p>
            {!board.archivedAt && <div className="weekly-action-row"><button onClick={() => navigateTab("library")}><WeeklyIcon name="plus"/>加入任務</button><button disabled={saving || editing || hasAssignedCells || !hasBoardContent} title={hasAssignedCells ? "已有任務排入今天，本週不再換位" : "中央自在格不移動"} onClick={() => void shuffleCells()}><WeeklyIcon name="shuffle"/>隨機換位</button></div>}
            {editing && (
              <>
                {clearedManagedCells > 0 && <p className="form-error">有 {clearedManagedCells} 格原有任務被清空，請先重新輸入名稱。若要移除，請保留名稱、完成編輯後再使用「從本週刪除」。</p>}
                <button className="primary" disabled={saving || clearedManagedCells > 0} onClick={() => void save(board, "週盤格子已儲存。") }>
                  {saving ? "儲存中…" : "儲存週盤"}
                </button>
              </>
            )}
          </section>

            </div><div className="weekly-board-secondary">
          <section className="ritual-card weekly-color-plan">
            <div className="section-heading">
              <div><span className="eyebrow">週日定色</span><h2>本週三色</h2></div>
              <span className={`saved-mark ${board.colorsConfirmedAt ? "confirmed" : ""}`}>{board.colorsConfirmedAt ? "已確認" : `${uncoloredCount} 格待定`}</span>
            </div>
            <p className="lead">這週為什麼做，由你決定。排入今天時，會沿用每格的分類。</p>
            <div className="weekly-color-counts">
              {colorCounts.map(({ category, count }) => <span key={category} className={category}>{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")} <b>{count}</b></span>)}
            </div>
            {!board.archivedAt && <button className="primary" disabled={saving || uncoloredCount > 0} onClick={() => void confirmColors()}>{board.colorsConfirmedAt ? "重新確認本週三色" : "確認本週三色"}</button>}
          </section>

            {!board.archivedAt && <section className="weekly-rollover">
            <button onClick={()=>setShowRollover(v=>!v)}>整理未完成任務／續排下週</button>
            {showRollover&&<div className="weekly-task-list"><p>由你逐項決定，保留進度續排；也可點開任務調整範圍、暫停或取消。</p>{unfinished.map(c=><div key={c.taskInstanceId||c.index}><button onClick={()=>openCell(c.index)}>{c.text} · {c.completion.progress}/{c.completion.target}</button><button disabled={saving} onClick={()=>void continueTask(c.index,addCalendarDays(weekStart,7))}>續排下週</button></div>)}{!unfinished.length&&<p>目前沒有待整理的未完成任務。</p>}</div>}

            </section>}
            <div className="weekly-shortcuts"><button onClick={() => navigateTab("library")}><WeeklyIcon name="layers"/><span><b>任務與範本</b><small>常用範本、階段專案、當週任務</small></span><WeeklyIcon name="arrow"/></button><button onClick={() => {setLibraryTab("reading"); navigateTab("library");}}><WeeklyIcon name="book"/><span><b>閱讀洞察候選</b><small>從一個想法，走向一次實踐</small></span><WeeklyIcon name="arrow"/></button><button onClick={() => navigateTab("reflection")}><WeeklyIcon name="write"/><span><b>為這一週留下脈絡</b><small>本週記錄、調整與下週方向</small></span><WeeklyIcon name="arrow"/></button></div>
            <aside className="weekly-prompt"><b>一週不必填滿。</b><p>可以先安排 16～20 格，也可以更少。留白的格子，週中隨時能再補入。</p></aside>
            </div></div>
          </div>

          {selectedCell && !editing && (
            <div className="modal bingo-detail-modal" onClick={(event) => event.target === event.currentTarget && setSelected(null)}>
              <section className="sheet selected-cell-panel" role="dialog" aria-modal="true" aria-labelledby="bingo-detail-title">
                <div className="bingo-detail-handle" aria-hidden="true" />
                <div className="toolbar bingo-detail-heading">
                  <div>
                    <span className="eyebrow">第 {selectedCell.index + 1} 格</span>
                    <h2 id="bingo-detail-title">{selectedCell.text || "加入本週任務"}</h2>
                  </div>
                  <button onClick={() => setSelected(null)}>關閉</button>
                </div>
                {selectedCell.learning && <p className="learning-cell-source">修習所・{selectedCell.learning.trackKey === "english" ? "英文到 C1" : selectedCell.learning.trackKey}・{selectedCell.learning.path === "system" ? "系統建置" : "英文修習"}・{selectedCell.learning.skill}</p>}
                {selectedCell.sourceType === "reading" && <p className="learning-cell-source">閱讀萃取・執行型洞察</p>}
                {selectedCell.completion.criteria && <p className="cell-completion-criteria"><b>做到什麼才算完成？</b>{selectedCell.completion.criteria}</p>}

                <div className="cell-detail-facts">
                  <span><small>盤面名稱</small><b>{bingoCellShortLabel(selectedCell)}</b></span>
                  <span><small>完成條件</small><b>{selectedCell.completion.target} {selectedCell.completion.unit}</b></span>
                  <span><small>本週分類</small><b>{selectedCell.category ? DAILY_TASK_CATEGORIES[selectedCell.category].label.replace(/^一件/, "") : "尚未定色"}</b></span>
                </div>

                {!board.archivedAt && !selectedLink ? (
                  <>
                    <div className="cell-management-actions">
                      <button type="button" onClick={() => setCellEditOpen((value) => !value)}>{cellEditOpen ? "收起編輯" : selectedCell.text ? "編輯任務" : "自由建立"}</button>
                      {selectedCell.text && <button type="button" disabled={saving} onClick={() => void replaceSelectedCell()}>替換任務</button>}
                      {selectedCell.text && <button type="button" className="danger-button" disabled={saving} onClick={() => void removeSelectedCell()}>從本週移除</button>}
                    </div>
                    {selectedCell.text && !selectedCell.assignedDate && <div className="cell-move-row"><select className="field" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}><option value="">移動到空白格…</option>{board.cells.filter((cell) => cell.index !== 12 && !cell.text.trim()).map((cell) => <option key={cell.index} value={cell.index}>第 {cell.index + 1} 格</option>)}</select><button disabled={!moveTarget || saving} onClick={() => void moveSelectedCell()}>移動</button></div>}
                    {cellEditOpen && (
                      <div className="cell-task-editor">
                        <label htmlFor="bingo-task-name">任務名稱</label>
                        <textarea id="bingo-task-name" className="field" rows={3} maxLength={300} value={cellTextDraft} onChange={(event) => setCellTextDraft(event.target.value)} />
                        <label htmlFor="bingo-short-label">盤面短名稱</label>
                        <input id="bingo-short-label" className="field" maxLength={12} value={shortLabelDraft} onChange={(event) => setShortLabelDraft(event.target.value)} placeholder="盤面顯示前四字；完整名稱保留" />
                        <label htmlFor="bingo-source-type">任務來源</label>
                        <select id="bingo-source-type" className="field" value={sourceTypeDraft} onChange={(event) => setSourceTypeDraft(event.target.value as BingoCell["sourceType"])}><option value="routine">常駐任務</option><option value="project">本週專案</option><option value="manual">自由建立</option><option value="learning">修習所</option><option value="reading">閱讀萃取</option><option value="flexible">其他系統</option></select>
                        <label htmlFor="bingo-completion-criteria">做到什麼才算完成？</label>
                        <textarea id="bingo-completion-criteria" className="field" rows={3} maxLength={1000} value={criteriaDraft} onChange={(event) => setCriteriaDraft(event.target.value)} placeholder="例如：完成一章閱讀並留下三句重述" />
                        <label htmlFor="bingo-completion-mode">完成規則</label>
                        <select id="bingo-completion-mode" className="field" value={modeDraft} onChange={(event) => setModeDraft(event.target.value as BingoCell["completion"]["mode"])}>
                          <option value="single">完成一次</option><option value="count">累積次數</option><option value="specified">指定成果</option><option value="free">自由成果</option><option value="checklist">子項目清單</option>
                        </select>
                        {modeDraft === "count" && <div className="cell-completion-editor">
                          <label htmlFor="bingo-completion-target">目標數量<input id="bingo-completion-target" className="field" type="number" min="1" max="99" inputMode="numeric" value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} /></label>
                          <label htmlFor="bingo-completion-unit">單位<input id="bingo-completion-unit" className="field" maxLength={20} value={unitDraft} onChange={(event) => setUnitDraft(event.target.value)} placeholder="次" /></label>
                        </div>}
                        {modeDraft==='checklist'&&<label>子項目（每行一項）<textarea className="field" rows={4} value={checklistDraft} onChange={e=>setChecklistDraft(e.target.value)}/></label>}
                        <label htmlFor="bingo-task-note">補充說明（選填）</label>
                        <textarea id="bingo-task-note" className="field" rows={2} maxLength={2000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
                        <button type="button" className="primary" disabled={saving || !cellTextDraft.trim()} onClick={() => void saveCellEdit()}>{saving ? "儲存中…" : "儲存任務修改"}</button>
                        <small>來源企劃與既有進度不會因修改名稱而消失。</small>
                      </div>
                    )}
                    {selectedCell.text && <div className="cell-color-picker">
                      <small>本週三色</small>
                      <div className="row">{CATEGORIES.map((category) => <button key={category} className={`task-category-button ${category} ${selectedCell.category === category ? "on" : ""}`} onClick={() => void setCellCategory(category)} disabled={saving || Boolean(selectedCell.assignedDate)}>{DAILY_TASK_CATEGORIES[category].label.replace(/^一件/, "")}</button>)}</div>
                    </div>}
                    {selectedCell.completion.requiresEvidence && <label className="evidence-field">完成成果<textarea className="field" rows={3} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="記下實際完成的內容；保留你的自由寫法" /></label>}
                    {selectedCell.text && selectedCell.completion.mode!=="checklist" && <div className="cell-progress">
                      <span>本週進度 <b>{selectedCell.completion.progress}/{selectedCell.completion.target}</b> {selectedCell.completion.unit}</span>
                      <div><button onClick={() => void changeProgress(-1)} disabled={saving || selectedBlocked || selectedCell.completion.progress === 0}>−</button><button className="primary" onClick={() => void changeProgress(1)} disabled={saving || selectedBlocked || selectedCell.completed}>{selectedCell.completed ? "已完成" : selectedCell.completion.target > 1 ? "記一次" : "完成這格"}</button></div>
                    </div>}
                    {selectedCell.completion.mode==='checklist'&&<div className="weekly-checklist">{selectedCell.checklist?.map(item=><label key={item.id}><input type="checkbox" checked={item.done} disabled={saving||selectedBlocked} onChange={()=>void changeProgress(1,item.id)}/><span>{item.text}</span></label>)}<small>在今天完成整項任務時，會一併完成所有子項目。</small></div>}
                    {selectedCell.text&&<div className="weekly-lifecycle">{selectedCell.disposition?<button disabled={saving} onClick={()=>void setDisposition()}>恢復任務</button>:<><button disabled={saving} onClick={()=>void setDisposition('paused')}>暫停任務</button><button disabled={saving} onClick={()=>void setDisposition('cancelled')}>取消任務（保留紀錄）</button></>}</div>}
                    {selectedCell.text && <div className="two">
                      <button onClick={() => void assignToToday()} disabled={saving || selectedBlocked || !selectedCell.category}>{selectedCell.assignedDate ? `已排入 ${selectedCell.assignedDate.slice(5)}` : selectedCell.category ? `排入今天・${DAILY_TASK_CATEGORIES[selectedCell.category].label.replace(/^一件/, "")}` : "請先定色"}</button>
                      <Link href="/" className="button-link">查看今天</Link>
                    </div>}
                  </>
                ) : (
                  <div className="cell-progress"><span>封存進度 <b>{selectedCell.completion.progress}/{selectedCell.completion.target}</b> {selectedCell.completion.unit}</span></div>
                )}
                {selectedCell.text&&!selectedCell.completed&&!selectedCell.disposition&&(selectedLink?.status==='complete'||!board.archivedAt)&&<div className="weekly-continuation">{selectedLink?.status==='complete'?<button onClick={()=>{setSelected(null);setWeekStart(selectedLink.targetWeek)}}>已續排至 {selectedLink.targetWeek} · 前往週盤</button>:<><label>續排到哪一週（選週一）<input className="field" type="date" min={addCalendarDays(weekStart,7)} value={carryTarget} disabled={Boolean(selectedLink)} onChange={e=>setCarryTarget(e.target.value)}/></label><button disabled={saving||!carryTarget} onClick={()=>void continueTask(selectedCell.index,carryTarget)}>{selectedLink?'重試完成續排':'保留進度續排'}</button></>}</div>}
                {error&&<p className="form-error" role="alert">{error}</p>}
                {notice&&<p className="save-notice" role="status">{notice}</p>}
              </section>
            </div>
          )}

          <section className="ritual-card weekly-tab-panel weekly-reflection" hidden={activeTab !== "reflection"} aria-label="每週回望">
            <span className="eyebrow">每週回望</span>
            <h2>為這一週留下脈絡</h2>
            <label htmlFor="week-bright">這週值得記下的一件事</label>
            <textarea id="week-bright" placeholder="這週有哪些完成、發現，或讓你有感的片刻？" className="field" disabled={Boolean(board.archivedAt)} value={board.reflection.brightSpot} onChange={(event) => setBoard({ ...board, reflection: { ...board.reflection, brightSpot: event.target.value } })} />
            <label htmlFor="week-adjust">想調整什麼</label>
            <textarea id="week-adjust" className="field" disabled={Boolean(board.archivedAt)} value={board.reflection.adjustment} onChange={(event) => setBoard({ ...board, reflection: { ...board.reflection, adjustment: event.target.value } })} />
            <label htmlFor="week-next">下週想聚焦的方向</label>
            <textarea id="week-next" className="field" disabled={Boolean(board.archivedAt)} value={board.reflection.nextFocus} onChange={(event) => setBoard({ ...board, reflection: { ...board.reflection, nextFocus: event.target.value } })} />
            {!board.archivedAt && (
              <div className="two">
                <button className="primary" disabled={saving} onClick={() => void save(board, "每週回望已儲存。")}>儲存回望</button>
                <button disabled={saving} onClick={() => void archiveBoard()}>封存本週</button>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
