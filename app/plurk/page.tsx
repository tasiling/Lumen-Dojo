"use client";

// 噗浪・蓋樓台(聊解室 → 噗浪蓋樓)。依擁有者驗證過的 plurk-tower.html 原型實作,
// 三個子頁(發文佇列/日上三更/範本)、分樓規則、逐樓複製流、字數檢查、排程到點
// 亮金邊、範本建立與編輯、由版型產生骨架皆照原型,不重新設計。視覺沿用行光道場
// .dojo CSS token(見 app/dojo.css 的 .plurk 區塊)。
//
// 儲存(2026-08-02 擁有者裁決):範本與草稿都存 DB-14 知識庫,不新增欄位,標題
// 前綴區分類型,排程時間/樓層/發布狀態序列化存進「內容」欄(lib/plurk/notionFormat.ts)。
// 文字類編輯(主噗/樓層內容)採 1.2 秒防抖自動存檔,結構性動作(新增/刪除/標記
// 完成/排程時間)即時送出,不需要使用者手動按「存檔」。
//
// 不接噗浪 API、不做自動發佈——排程只是「預先寫好＋到點提示」。
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import { useBackableState } from "@/lib/dojo/backstack";
import {
  SANKO_TEMPLATES,
  SANKO_SECT_ORDER,
  SANKO_SECT_HINT,
  DEFAULT_TEMPLATES,
  type SankoTemplateSpec,
} from "@/lib/plurk/data";
import {
  fill,
  fmtAt,
  isDue,
  deriveTitle,
  splitGeneric,
  PARSERS,
  scaffold,
  PLURK_CHAR_LIMIT,
  type PlurkDraft,
  type PlurkDraftStatus,
  type PlurkTemplate,
} from "@/lib/plurk/logic";

type TabKey = "post" | "sanko" | "tpl";
type DraftMode = "copy" | "edit";

function renderLine(line: string, key: number): ReactNode {
  const parts = line.split(/(\s+|\[emo\d+\])/);
  return (
    <Fragment key={key}>
      {parts.map((t, i) => {
        if (/^https:\/\/(emos|images)\.plurk\.com\/\S+\.(png|gif|jpe?g)$/i.test(t)) {
          return <img key={i} src={t} alt="" style={{ height: 16, verticalAlign: "-3px", margin: "0 1px" }} />;
        }
        if (/^\[emo\d+\]$/.test(t)) {
          return (
            <span key={i} className="emo">
              {t}
            </span>
          );
        }
        const segments = t.split(/\*\*(.+?)\*\*/g);
        if (segments.length === 1) return segments[0];
        return (
          <Fragment key={i}>
            {segments.map((seg, si) => (si % 2 === 1 ? <b key={si}>{seg}</b> : seg))}
          </Fragment>
        );
      })}
    </Fragment>
  );
}

function renderPv(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderLine(line, i)}
    </Fragment>
  ));
}

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "請求失敗");
  return data;
}
async function patchJSON(url: string, body: unknown) {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "請求失敗");
  return data;
}
async function del(url: string) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "刪除失敗");
  }
}

export default function PlurkPage() {
  const pathname=usePathname();
  const toolHome=pathname.startsWith('/weaving')?'/weaving/tools':'/liaojie/tools';
  const [templates, setTemplates] = useState<PlurkTemplate[]>([]);
  const [drafts, setDrafts] = useState<PlurkDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("post");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<DraftMode>("copy");
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTplId, setSplitTplId] = useState("");
  const [splitText, setSplitText] = useState("");
  const [copied, setCopied] = useState<Record<number, boolean>>({});
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const tplSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 打開一則草稿的詳情是頁面內的 drill-down,不是換頁(擁有者指示:返回手勢
  // 要能一步步退回):打開時推一筆瀏覽器歷史,返回時自動收合回發文佇列清單。
  useBackableState(openId != null, () => setOpenId(null));

  useEffect(() => {
    async function load() {
      try {
        const [tRes, dRes] = await Promise.all([fetch("/api/plurk/templates"), fetch("/api/plurk/drafts")]);
        const tData = await tRes.json();
        const dData = await dRes.json();
        if (!tRes.ok || !dRes.ok) throw new Error(tData.error ?? dData.error ?? "載入失敗");
        setTemplates(tData.templates ?? []);
        setDrafts(dData.drafts ?? []);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  function toast(msg?: string) {
    if (!msg) return;
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
  }

  function persistDraft(d: PlurkDraft) {
    clearTimeout(draftSaveTimers.current[d.id]);
    draftSaveTimers.current[d.id] = setTimeout(() => {
      patchJSON(`/api/plurk/drafts/${d.id}`, {
        method: d.method,
        tplName: d.tplName,
        main: d.main,
        floors: d.floors,
        at: d.at,
        status: d.status,
        createdAt: d.createdAt,
      }).catch(() => toast("草稿自動存檔失敗,請檢查網路"));
    }, 1200);
  }

  function persistTemplate(t: PlurkTemplate) {
    clearTimeout(tplSaveTimers.current[t.id]);
    tplSaveTimers.current[t.id] = setTimeout(() => {
      patchJSON(`/api/plurk/templates/${t.id}`, { name: t.name, method: t.method, main: t.main, floors: t.floors }).catch(() =>
        toast("範本自動存檔失敗,請檢查網路")
      );
    }, 1200);
  }

  async function newFromTpl(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const payload = {
      method: t.method,
      tplName: t.name,
      main: fill(t.main),
      floors: t.floors.map(fill),
      at: "",
      status: "draft" as PlurkDraftStatus,
    };
    try {
      const data = await postJSON("/api/plurk/drafts", payload);
      const d: PlurkDraft = { id: data.id, createdAt: data.createdAt, ...payload };
      setDrafts((prev) => [d, ...prev]);
      setOpenId(d.id);
      setMode("edit");
      setCopied({});
      setTab("post");
      toast("已用範本建立草稿");
    } catch {
      toast("建立草稿失敗,請檢查網路");
    }
  }

  async function newBlank() {
    const payload = { method: "", tplName: "", main: "", floors: [] as string[], at: "", status: "draft" as PlurkDraftStatus };
    try {
      const data = await postJSON("/api/plurk/drafts", payload);
      const d: PlurkDraft = { id: data.id, createdAt: data.createdAt, ...payload };
      setDrafts((prev) => [d, ...prev]);
      setOpenId(d.id);
      setMode("edit");
      setCopied({});
    } catch {
      toast("建立草稿失敗,請檢查網路");
    }
  }

  async function buildSanko(key: string, density: 1 | 3) {
    const m = SANKO_TEMPLATES.find((x) => x.key === key);
    if (!m) return;
    const s = scaffold(m, density);
    const payload = { name: m.name + "・噗浪版", method: m.key, main: fill(s.main), floors: s.floors };
    try {
      const data = await postJSON("/api/plurk/templates", payload);
      const t: PlurkTemplate = { id: data.id, method: payload.method, name: payload.name, main: payload.main, floors: payload.floors };
      setTemplates((prev) => [t, ...prev]);
      setTab("tpl");
      toast(`已建立「${t.name}」骨架,調好表符與字句就是你的範本`);
    } catch {
      toast("建立骨架失敗,請檢查網路");
    }
  }

  async function createDefaultTemplates() {
    try {
      for (const seed of DEFAULT_TEMPLATES) {
        const data = await postJSON("/api/plurk/templates", { name: seed.name, method: seed.method, main: seed.main, floors: seed.floors });
        const t: PlurkTemplate = { id: data.id, method: seed.method, name: seed.name, main: seed.main, floors: seed.floors };
        setTemplates((prev) => [t, ...prev]);
      }
      toast("已建立 2 個預設範本");
    } catch {
      toast("建立失敗,請檢查網路");
    }
  }

  async function doSplit() {
    if (!splitTplId) {
      toast("先選擇要套的範本");
      return;
    }
    const tpl = templates.find((t) => t.id === splitTplId);
    if (!tpl) return;
    const hasC = /[①-⑳]/.test(splitText);
    if (tpl.method === "xincheng" && hasC) {
      toast("內文有①②圈號,看起來是命運籤詩格式");
      return;
    }
    if (tpl.method === "qianshi" && !hasC) {
      toast("沒找到①②圈號,對不上命運籤詩的分樓規則");
      return;
    }
    const parser = PARSERS[tpl.method] ?? splitGeneric;
    const r = parser(splitText);
    if (!r.floors.length) {
      toast(`長文對不上「${tpl.name}」的分樓規則`);
      return;
    }
    let main = fill(tpl.main);
    if (r.intro) {
      if (tpl.method === "qianshi") {
        const b = r.intro
          .split("\n")
          .filter((l) => !/命運籤詩/.test(l))
          .join("\n")
          .trim();
        if (b) main = "**【聊解時間 ※ 命運籤詩】**\n" + b;
      } else if (tpl.method === "xincheng") {
        const b2 = r.intro
          .split("\n")
          .filter((l) => !/心乘光.{0,6}指引/.test(l))
          .join("\n")
          .trim();
        if (b2) main = fill("**【心乘光•指引:{{起}}～{{迄}}】**") + "\n(此處上傳本週牌卡圖)\n" + b2;
      }
    }
    const payload = { method: tpl.method, tplName: tpl.name, main, floors: r.floors, at: "", status: "draft" as PlurkDraftStatus };
    try {
      const data = await postJSON("/api/plurk/drafts", payload);
      const d: PlurkDraft = { id: data.id, createdAt: data.createdAt, ...payload };
      setDrafts((prev) => [d, ...prev]);
      setSplitOpen(false);
      setOpenId(d.id);
      setMode("edit");
      setCopied({});
      toast(`已分成 ${r.floors.length} 樓`);
    } catch {
      toast("建立草稿失敗,請檢查網路");
    }
  }

  function openCard(id: string, m: DraftMode) {
    if (openId === id && mode === m) setOpenId(null);
    else {
      setOpenId(id);
      setMode(m);
    }
    setCopied({});
  }

  function setDraftField<K extends keyof PlurkDraft>(id: string, key: K, value: PlurkDraft[K]) {
    const current = drafts.find((d) => d.id === id);
    if (!current) return;
    const next: PlurkDraft = { ...current, [key]: value };
    if (key === "at") next.status = (value as string) ? "scheduled" : "draft";
    setDrafts((prev) => prev.map((d) => (d.id === id ? next : d)));
    persistDraft(next);
  }

  async function delDraft(id: string) {
    if (!window.confirm("刪除這篇草稿?")) return;
    try {
      await del(`/api/plurk/drafts/${id}`);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      if (openId === id) setOpenId(null);
    } catch {
      toast("刪除失敗,請檢查網路");
    }
  }

  function addFloor(id: string) {
    const current = drafts.find((d) => d.id === id);
    if (!current) return;
    const next = { ...current, floors: [...current.floors, ""] };
    setDrafts((prev) => prev.map((d) => (d.id === id ? next : d)));
    persistDraft(next);
  }
  function delFloor(id: string, i: number) {
    const current = drafts.find((d) => d.id === id);
    if (!current) return;
    const next = { ...current, floors: current.floors.filter((_, x) => x !== i) };
    setDrafts((prev) => prev.map((d) => (d.id === id ? next : d)));
    persistDraft(next);
  }
  function editFloor(id: string, i: number, v: string) {
    const current = drafts.find((d) => d.id === id);
    if (!current) return;
    const next = { ...current, floors: current.floors.map((f, x) => (x === i ? v : f)) };
    setDrafts((prev) => prev.map((d) => (d.id === id ? next : d)));
    persistDraft(next);
  }

  async function saveAsTpl(id: string) {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const n = window.prompt("範本名稱:", d.tplName || deriveTitle(d));
    if (!n) return;
    const payload = { name: n, method: d.method, main: d.main, floors: [...d.floors] };
    try {
      const data = await postJSON("/api/plurk/templates", payload);
      const t: PlurkTemplate = { id: data.id, method: payload.method, name: payload.name, main: payload.main, floors: payload.floors };
      setTemplates((prev) => [t, ...prev]);
      toast("已存成範本");
    } catch {
      toast("存範本失敗,請檢查網路");
    }
  }

  function markPosted(id: string, status: PlurkDraftStatus) {
    setDraftField(id, "status", status);
    if (status === "posted") toast("恭喜發完 ✦");
  }

  async function doCopy(id: string, i: number) {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const txt = i === 0 ? d.main : d.floors[i - 1];
    let ok = false;
    try {
      await navigator.clipboard.writeText(txt);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = txt;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied((prev) => ({ ...prev, [i]: true }));
      toast("已複製,去噗浪貼上");
    } else {
      toast("複製失敗,請長按文字手動複製");
    }
  }

  function tplPatchField<K extends keyof PlurkTemplate>(id: string, key: K, value: PlurkTemplate[K]) {
    const current = templates.find((t) => t.id === id);
    if (!current) return;
    const next = { ...current, [key]: value };
    setTemplates((prev) => prev.map((t) => (t.id === id ? next : t)));
    persistTemplate(next);
  }
  function tplAddFloor(id: string) {
    const current = templates.find((t) => t.id === id);
    if (!current) return;
    const next = { ...current, floors: [...current.floors, ""] };
    setTemplates((prev) => prev.map((t) => (t.id === id ? next : t)));
    persistTemplate(next);
  }
  function tplDelFloor(id: string, i: number) {
    const current = templates.find((t) => t.id === id);
    if (!current) return;
    const next = { ...current, floors: current.floors.filter((_, x) => x !== i) };
    setTemplates((prev) => prev.map((t) => (t.id === id ? next : t)));
    persistTemplate(next);
  }
  function tplEditFloor(id: string, i: number, v: string) {
    const current = templates.find((t) => t.id === id);
    if (!current) return;
    const next = { ...current, floors: current.floors.map((f, x) => (x === i ? v : f)) };
    setTemplates((prev) => prev.map((t) => (t.id === id ? next : t)));
    persistTemplate(next);
  }
  async function delTpl(id: string) {
    if (templates.length <= 1) {
      toast("至少留一個範本");
      return;
    }
    if (!window.confirm("刪除這個範本?")) return;
    try {
      await del(`/api/plurk/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast("刪除失敗,請檢查網路");
    }
  }

  const dueCount = useMemo(() => drafts.filter((d) => isDue(d, now)).length, [drafts, now]);

  function ord(d: PlurkDraft) {
    if (isDue(d, now)) return 0;
    if (d.status === "scheduled") return 1;
    if (d.status === "draft") return 2;
    return 3;
  }
  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => {
      const x = ord(a) - ord(b);
      if (x) return x;
      if (a.at && b.at) return new Date(a.at).getTime() - new Date(b.at).getTime();
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, now]);

  function draftCard(d: PlurkDraft) {
    const due = isDue(d, now);
    const open = openId === d.id;
    const label =
      due ? "✦ 該發文了" : d.status === "posted" ? "已發佈" : d.at ? `排程 ${fmtAt(d.at)}` : "草稿";
    return (
      <section key={d.id} className={"card" + (due ? " due" : "") + (d.status === "posted" ? " posted" : "")}>
        <button className="chead" onClick={() => openCard(d.id, due || d.status === "scheduled" ? "copy" : "edit")}>
          <span className="ctitle">{deriveTitle(d)}</span>
          <span className="cmeta">
            {label}
            {d.floors.length ? ` ・ ${d.floors.length} 樓` : ""}
          </span>
        </button>
        {open && (
          <div className="cbody">
            <div className="seg">
              <button className={mode === "copy" ? "on" : ""} onClick={() => openCard(d.id, "copy")}>
                發文(複製流)
              </button>
              <button className={mode === "edit" ? "on" : ""} onClick={() => openCard(d.id, "edit")}>
                編輯
              </button>
            </div>
            {mode === "copy" ? draftCopyView(d) : draftEditView(d)}
          </div>
        )}
      </section>
    );
  }

  function draftCopyView(d: PlurkDraft) {
    const blocks = [{ l: "主噗", t: d.main }, ...d.floors.map((f, i) => ({ l: `${i + 1} 樓`, t: f }))];
    const doneCount = blocks.filter((_, i) => copied[i]).length;
    return (
      <>
        <div className="prog">
          {doneCount}/{blocks.length} 已複製
          <a className="tn" href="https://www.plurk.com/m" target="_blank" rel="noreferrer">
            開啟噗浪 ↗
          </a>
        </div>
        <ol className="tower">
          {blocks.map((b, i) => (
            <li key={i} className={copied[i] ? "done" : ""}>
              <div className="ftag">{b.l}</div>
              <div className="fbox">
                <div className="pv">{renderPv(b.t)}</div>
                <div className="ffoot">
                  <span className={"cnt" + (b.t.length > PLURK_CHAR_LIMIT ? " over" : "")}>
                    {b.t.length} 字{b.t.length > PLURK_CHAR_LIMIT ? "・超過噗浪上限" : ""}
                  </span>
                  <button className="sm go" onClick={() => doCopy(d.id, i)}>
                    {copied[i] ? "✓ 已複製" : "複製"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        {d.status !== "posted" ? (
          <button className="wide" onClick={() => markPosted(d.id, "posted")}>
            全部貼完了,標記已發佈
          </button>
        ) : (
          <button className="wide gh" onClick={() => markPosted(d.id, d.at ? "scheduled" : "draft")}>
            改回未發佈
          </button>
        )}
      </>
    );
  }

  function draftEditView(d: PlurkDraft) {
    return (
      <>
        <div className="lab">主噗內容</div>
        <textarea
          className="field"
          rows={7}
          value={d.main}
          onChange={(e) => setDraftField(d.id, "main", e.target.value)}
        />
        <div className="lab">樓層(留言解析)</div>
        {d.floors.map((f, i) => (
          <div className="fedit" key={i}>
            <div className="fehead">
              <span className="ftag">{i + 1} 樓</span>
              <button className="tn" onClick={() => delFloor(d.id, i)}>
                刪除
              </button>
            </div>
            <textarea className="field" rows={4} value={f} onChange={(e) => editFloor(d.id, i, e.target.value)} />
          </div>
        ))}
        <button className="gh" onClick={() => addFloor(d.id)}>
          ＋ 加一樓
        </button>
        <div className="lab">排程時間(到點卡片會亮金邊)</div>
        <input
          className="field"
          type="datetime-local"
          value={d.at}
          onChange={(e) => setDraftField(d.id, "at", e.target.value)}
        />
        <div className="acts">
          <button className="gh" onClick={() => saveAsTpl(d.id)}>
            存成範本
          </button>
          <button className="dg" onClick={() => delDraft(d.id)}>
            刪除草稿
          </button>
        </div>
      </>
    );
  }

  function sankoCard(m: SankoTemplateSpec) {
    const done = templates.filter((t) => t.method === m.key);
    return (
      <section key={m.key} className="card">
        <div className="chead st">
          <span className="ctitle">{m.name}</span>
          <span className="cmeta">
            {m.method}
            {m.opts.length ? ` ・ ${m.opts.length} 個選項` : ""}
            {m.text ? ` ・ ${m.text.length} 段` : ""}
            {m.text ? "" : ` ・ 傘＝${m.type}型`}
          </span>
        </div>
        <div className="cbody">
          {m.text ? (
            <div className="segline">
              {m.text.map((t, i) => (
                <Fragment key={i}>
                  <span className="k">{i + 1}</span>
                  {t}
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="segline">
              <span className="k">空</span>
              {m.kong}
              {m.yu && (
                <>
                  <span className="k">雨</span>
                  {m.yu}
                </>
              )}
              <span className="k">傘</span>
              {m.san}
            </div>
          )}
          {done.length > 0 ? (
            <>
              <div className="okline">✓ 已建立 {done.length} 個範本</div>
              <div className="acts">
                {done.map((t) => (
                  <button key={t.id} className="go" onClick={() => newFromTpl(t.id)}>
                    用「{t.name}」開草稿
                  </button>
                ))}
              </div>
            </>
          ) : m.text ? (
            <>
              <div className="lab">純文字型,不分選項。建立四段式骨架:</div>
              <div className="acts">
                <button onClick={() => buildSanko(m.key, 1)}>建立夜光骨架({m.text.length} 樓)</button>
              </div>
            </>
          ) : !m.opts.length ? (
            <div className="okline dim">此版型請於「範本」頁直接編輯</div>
          ) : (
            <>
              <div className="lab">還沒有噗浪版。選一個分樓密度,產生骨架:</div>
              <div className="acts">
                <button onClick={() => buildSanko(m.key, 1)}>每選項一樓({m.opts.length} 樓)</button>
                <button onClick={() => buildSanko(m.key, 3)}>
                  每選項{m.yu ? "三" : "二"}樓({m.opts.length * (m.yu ? 3 : 2)} 樓)
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  function tplCard(t: PlurkTemplate) {
    const mm = SANKO_TEMPLATES.find((x) => x.key === t.method);
    const editing = editingTplId === t.id;
    return (
      <section key={t.id} className="card">
        <div className="chead st">
          <span className="ctitle">{t.name}</span>
          <span className="cmeta">
            {mm ? `${mm.method} ・ ` : ""}
            {t.floors.length} 樓
          </span>
        </div>
        <div className="cbody">
          {editing ? (
            <>
              <div className="lab">範本名稱</div>
              <input
                className="field"
                type="text"
                value={t.name}
                onChange={(e) => tplPatchField(t.id, "name", e.target.value)}
              />
              <div className="lab">主噗</div>
              <textarea
                className="field"
                rows={7}
                value={t.main}
                onChange={(e) => tplPatchField(t.id, "main", e.target.value)}
              />
              <div className="lab">樓層</div>
              {t.floors.map((f, i) => (
                <div className="fedit" key={i}>
                  <div className="fehead">
                    <span className="ftag">{i + 1} 樓</span>
                    <button className="tn" onClick={() => tplDelFloor(t.id, i)}>
                      刪除
                    </button>
                  </div>
                  <textarea
                    className="field"
                    rows={3}
                    value={f}
                    onChange={(e) => tplEditFloor(t.id, i, e.target.value)}
                  />
                </div>
              ))}
              <button className="gh" onClick={() => tplAddFloor(t.id)}>
                ＋ 加一樓
              </button>
              <div className="acts">
                <button className="go" onClick={() => setEditingTplId(null)}>
                  完成
                </button>
                <button className="dg" onClick={() => delTpl(t.id)}>
                  刪除範本
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="pv">{renderPv(fill(t.main))}</div>
              <div className="acts">
                <button className="go" onClick={() => newFromTpl(t.id)}>
                  用這個範本開新草稿
                </button>
                <button className="gh" onClick={() => setEditingTplId(t.id)}>
                  編輯
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="screen plurk">
        <h1>噗浪・蓋樓台</h1>
        <p className="lead">載入中…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="screen plurk">
        <h1>噗浪・蓋樓台</h1>
        <div className="warn">讀取失敗:{loadError}</div>
      </section>
    );
  }

  return (
    <section className="screen plurk">
      <header className="creative-tool-heading"><Link href={toolHome}>← 創作工具</Link><h1>噗浪・蓋樓台</h1><p>寫好放著，時間到打開，一層層貼上去。</p></header>

      <div className="tabs">
        <button className={tab === "post" ? "on" : ""} onClick={() => setTab("post")}>
          發文佇列
          {dueCount > 0 && <span className="badge">{dueCount}</span>}
        </button>
        <button className={tab === "sanko" ? "on" : ""} onClick={() => setTab("sanko")}>
          日上三更
        </button>
        <button className={tab === "tpl" ? "on" : ""} onClick={() => setTab("tpl")}>
          範本
        </button>
      </div>

      {toastMsg && <div className="toast">{toastMsg}</div>}

      {tab === "post" && (
        <>
          <div className="acts">
            <button className="go" onClick={() => setSplitOpen((v) => !v)}>
              ✦ 長文分樓
            </button>
            {templates[0] && (
              <button className="gh" onClick={() => newFromTpl(templates[0].id)}>
                套「{templates[0].name}」
              </button>
            )}
            <button className="gh" onClick={newBlank}>
              空白
            </button>
          </div>

          {splitOpen && (
            <section className="card">
              <div className="cbody solo">
                <div className="lab">
                  第一步:選要套的範本。第二步:貼整篇長文。對不上規則會直接告訴你,不會亂切。
                </div>
                <div className="pickrow">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      className={"pick" + (splitTplId === t.id ? " on" : "")}
                      onClick={() => setSplitTplId(t.id)}
                    >
                      {t.name}
                      {!PARSERS[t.method] && <small>需用 --- 斷樓</small>}
                    </button>
                  ))}
                </div>
                <textarea
                  className="field"
                  rows={9}
                  value={splitText}
                  onChange={(e) => setSplitText(e.target.value)}
                  placeholder={"【選項A】\n現狀共振:\n…\n乘光訊息:\n…\n祈請詞定錨:\n「…」\n微光行動:\n…"}
                />
                <button className="go" onClick={doSplit}>
                  分樓建立草稿
                </button>
              </div>
            </section>
          )}

          {drafts.length === 0 ? (
            <div className="empty">還沒有草稿。用範本開第一篇,標題日期會自動帶入下週。</div>
          ) : (
            sortedDrafts.map((d) => draftCard(d))
          )}
          <p className="note">
            噗浪沒有開放自動發佈,這裡的排程是「預先寫好＋到點提示」。時間到卡片會亮金邊,打開噗浪照樓層順序貼上就好。單噗上限
            360 字。
          </p>
        </>
      )}

      {tab === "sanko" && (
        <>
          <p className="note">八套日上三更版型的噗浪版。已建立的直接開草稿;還沒建立的點下去產生骨架,調好表符與字句後它就是你的範本。</p>
          {SANKO_SECT_ORDER.map((sect) => (
            <Fragment key={sect}>
              <div className="sect">
                {sect}
                <small>{SANKO_SECT_HINT[sect]}</small>
              </div>
              {SANKO_TEMPLATES.filter((m) => m.sect === sect).map((m) => sankoCard(m))}
            </Fragment>
          ))}
          <p className="note">分樓密度看內容長度:單樓超過 360 字噗浪會擋。骨架建好後可在「範本」頁自由增刪樓層。</p>
        </>
      )}

      {tab === "tpl" && (
        <>
          {templates.length === 0 && (
            <div className="empty">
              還沒有範本。可以到「日上三更」頁籤挑一張版型產生骨架,或先建立 2 個現成的預設範本。
              <div className="acts" style={{ justifyContent: "center", marginTop: 10 }}>
                <button className="go" onClick={createDefaultTemplates}>
                  建立預設範本(心乘光・週指引 / 命運籤詩)
                </button>
              </div>
            </div>
          )}
          {templates.map((t) => tplCard(t))}
          {templates.length > 0 && (
            <p className="note">
              範本裡的 {"{{起}}"}／{"{{迄}}"} 會在建立草稿時自動換成下週一／下週日。表符就是把表符圖片網址直接放在文字裡。
            </p>
          )}
        </>
      )}
    </section>
  );
}
