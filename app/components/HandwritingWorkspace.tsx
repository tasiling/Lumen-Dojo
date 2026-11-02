"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "./PracticeRouteLink";
import { RealmArt } from "./PracticeArt";
import type {
  EntityInput,
  EntityKind,
  FoundationSnapshot,
  LearningEntity,
} from "@/lib/dojo/learningFoundation/model";

const FONT_STAGE = "英文字型探索與基礎書寫";
const STAGES = [
  {
    title: "01｜英文字型探索與基礎書寫",
    description: "第一個主軸。每一本字帖、每一種想學的手寫字型，都可以留下獨立主題和紀錄。",
    steps: ["認識教材與字型特色", "大小寫與筆順", "字高、寬度、斜度與間距", "單字、短句與字型比較"],
  },
  {
    title: "02｜英文連筆拆解",
    description: "另一條獨立路線。先理解入筆、出筆與接點，再練字母組合、單字、句子；以實際教材的筆順為準。",
    steps: ["基本線條與字母家族", "入筆／出筆／何時提筆", "斜接／橫接與字母組合", "連筆短句與可讀性"],
  },
  {
    title: "03｜中文書寫",
    description: "日後再啟動：筆畫、部件、間架結構、重心與留白，最後延伸到自己的風格。",
    steps: [],
  },
  {
    title: "04｜左手書寫",
    description: "未來可選的方向：握筆、紙張角度、控筆與左右手各自的進度，不強迫同步。",
    steps: [],
  },
] as const;

async function readFoundation(): Promise<FoundationSnapshot> {
  const response = await fetch("/api/dojo/learning/foundation", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "無法讀取學習項目");
  return result as FoundationSnapshot;
}

export default function HandwritingWorkspace() {
  const [snapshot, setSnapshot] = useState<FoundationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fontName, setFontName] = useState("");
  const [book, setBook] = useState("");
  const [bookPage, setBookPage] = useState("");

  const reload = useCallback(async () => {
    const next = await readFoundation();
    setSnapshot(next);
    return next;
  }, []);

  useEffect(() => {
    let live = true;
    readFoundation()
      .then((next) => { if (live) setSnapshot(next); })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : String(caught)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const matches = (snapshot?.entities ?? []).filter(
    (entity) => entity.kind === "item" && entity.name === "書寫修習",
  );
  const item = matches.length === 1 ? matches[0] : null;
  const stage = item ? snapshot?.entities.find(
    (entity) => entity.kind === "stage" && entity.itemId === item.id && entity.name === FONT_STAGE,
  ) : undefined;
  const fonts = stage ? (snapshot?.entities ?? [])
    .filter((entity) => entity.kind === "topic" && entity.itemId === item?.id && entity.stageId === stage.id)
    .sort((a, b) => a.order - b.order) : [];
  const canEdit = Boolean(item && item.status !== "archived");

  async function create(kind: EntityKind, input: EntityInput, itemId: string | null) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dojo/learning/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", kind, itemId, input }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "儲存失敗");
      await reload();
      setNotice("已儲存到修習所，可重新整理後繼續。");
      return true;
    } catch (caught) {
      setError(`未能確認完整保存結果：${caught instanceof Error ? caught.message : String(caught)}。請先重新讀取確認，再決定是否重試，避免建立重複項目。`);
      try { await reload(); } catch { /* Leave the error visible; do not retry a create automatically. */ }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addFont() {
    if (!item || !stage || !canEdit) return;
    const name = fontName.trim();
    if (!name) { setError("先填寫這款字型或字帖的名稱。"); return; }
    if (fonts.some((font) => font.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError("這個字型已有獨立主題，請選擇既有主題記錄進度。");
      return;
    }
    const source = [book.trim() && `教材：${book.trim()}`, bookPage.trim() && `頁碼：${bookPage.trim()}`]
      .filter(Boolean).join("；");
    const saved = await create("topic", {
      name,
      stageId: stage.id,
      description: source || "教材與頁碼尚未填寫；之後可以在學習項目管理頁補充。",
      goal: "字母筆順與字形理解，進而練習大小寫、單字及短句。",
      expectedOutcome: "保留這款字型獨立的字形比較、練習紀錄與下次想改善的地方。",
    }, item.id);
    if (saved) { setFontName(""); setBookPage(""); }
  }

  const itemUrl = item ? `/practice/learning?learningItem=${encodeURIComponent(item.id)}` : "/practice/learning";

  return <section className="screen practice-workspace practice-home">
    <div className="practice-realm-hero">
      <RealmArt />
      <span>修習所・心／知</span>
      <h1>書寫修習</h1>
      <p>從多種英文字型的探索開始，再練英文連筆，之後延伸到中文與左手書寫。</p>
      <Link className="primary" href={itemUrl}>回到我的學習項目</Link>
    </div>

    <section className="practice-panel">
      <h2>我的書寫路線</h2>
      <p>四個方向可以依自己的步調練，不必逐關解鎖。第一階段和連筆各有自己的目標。</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
        {STAGES.map((s) => <article className="card" key={s.title}>
          <h3>{s.title}</h3>
          <p>{s.description}</p>
          {s.steps.length > 0 && <ul>{s.steps.map((step) => <li key={step}>{step}</li>)}</ul>}
        </article>)}
      </div>
    </section>

    <section className="practice-panel" aria-labelledby="handwriting-styles">
      <h2 id="handwriting-styles">第一階段｜我的英文字型</h2>
      <p>各種字型都是正式的學習主題，不只是連筆前的暖身。先用一種字型練幾次，再探索其他字型；每種都保留自己的進度。</p>
      {loading && <p role="status">正在讀取修習所資料…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!loading && <button type="button" disabled={busy} onClick={() => { setError(""); void reload().catch((e) => setError(String(e))); }}>重新讀取</button>}
      {!loading && snapshot && matches.length > 1 && <p role="alert">找到多個同名書寫項目，為避免寫錯紀錄，請先到管理頁確認項目名稱。</p>}
      {!loading && snapshot && matches.length === 0 && <div className="card">
        <h3>建立書寫修習項目</h3>
        <p>按下後，才會在原有修習所建立一個正式學習項目。既有英文、週盤及其他學科不會改動；不會在開頁時自動寫入。</p>
        <button className="primary" type="button" disabled={busy} onClick={() => void create("item", {
          name: "書寫修習",
          description: "先探索不同英文字型、練習英文連筆，之後延伸至中文書寫及左手書寫。",
          vision: "培養清晰、流暢、舒適且有個人風格的雙語手寫能力。",
        }, null)}>建立學習項目</button>
      </div>}
      {item && <div className="card">
        <h3>已連結：{item.name}</h3>
        <p>學習項目、練習階段及字型主題的所有紀錄，都使用修習所既有資料庫。</p>
        {!stage && canEdit && <>
          <p>先建立「英文字型探索與基礎書寫」階段，之後就可以為每種教材字型建立獨立主題。</p>
          <button className="primary" type="button" disabled={busy} onClick={() => void create("stage", {
            name: FONT_STAGE,
            description: "多本字帖與不同書體的獨立練習；不把各字型的進度混在一起。",
            goal: "理解不同字型的字母、筆順、比例、傾角、間距與短句書寫。",
            expectedOutcome: "每款字型各自留下練習紀錄與作品比較。",
          }, item.id)}>建立英文字型階段</button>
        </>}
        {!canEdit && <p>這個學習項目已封存；若想新增練習，請先到管理頁恢復。</p>}
        <div className="foundation-actions">
          <Link href={itemUrl + "&tab=path"}>查看學習路徑</Link>
          <Link href={`/practice/manage?learningItem=${encodeURIComponent(item.id)}`}>管理字型與教材</Link>
          <Link href={`/practice/records?new=1&learningItem=${encodeURIComponent(item.id)}`}>留下書寫紀錄</Link>
        </div>
      </div>}
      {stage && canEdit && <div className="card">
        <h3>新增一款字型</h3>
        <p>依實際教材命名，不猜測字體。每一款會保存成獨立主題，可在管理頁更新詳情。</p>
        <div className="learning-editor">
          <label htmlFor="handwriting-font">字型或字帖內的書體名稱</label>
          <input className="field" id="handwriting-font" maxLength={300} value={fontName} onChange={(e) => setFontName(e.target.value)} placeholder="例如：教材 A 的第一款字型" />
          <label htmlFor="handwriting-book">教材名稱（選填）</label>
          <input className="field" id="handwriting-book" maxLength={200} value={book} onChange={(e) => setBook(e.target.value)} />
          <label htmlFor="handwriting-page">頁碼或章節（選填）</label>
          <input className="field" id="handwriting-page" maxLength={100} value={bookPage} onChange={(e) => setBookPage(e.target.value)} />
          <button className="primary" disabled={busy || !fontName.trim()} type="button" onClick={() => void addFont()}>{busy ? "儲存中…" : "建立字型主題"}</button>
        </div>
      </div>}
      {fonts.length > 0 && <div className="practice-topic-list">
        {fonts.map((font: LearningEntity) => <article className="card" key={font.id}>
          <h3>{font.name}</h3>
          <p>{font.description}</p>
          <p>建議順序：字形與筆順 → 大小寫 → 字距與比例 → 單字 → 短句 → 不看字帖的自主書寫。</p>
          <Link href={`/practice/records?new=1&learningItem=${encodeURIComponent(item!.id)}&stageId=${encodeURIComponent(stage!.id)}&topicId=${encodeURIComponent(font.id)}`}>為這款字型留下紀錄</Link>
        </article>)}
      </div>}
    </section>

    <section className="practice-panel">
      <h2>每次約 12–15 分鐘</h2>
      <p>暖手 2 分鐘；當天字型筆畫 3 分鐘；字母與比例 4 分鐘；單字或短句 3 分鐘；最後用 1–3 分鐘記錄一個發現。連筆練習則改為入筆、出筆和兩字母連接。</p>
      <p>可以先保留紙本字帖；目前尚未提供教材內頁，因此不預先建立具體字型或混用不同教材的筆順。</p>
    </section>
  </section>;
}
