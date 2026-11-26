"use client";

import { useCallback, useEffect, useState } from "react";
import type { CaptureEntry } from "@/lib/dojo/formal";
import { rhythmFacts, type VideoAnalysis } from "@/lib/dojo/videoAnalysis";

type QueueView = { status: string; phase: string; error: string } | null;
type Status = { analysis: VideoAnalysis | null; queue: QueueView; macReady: boolean };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "操作沒有完成，請稍後再試。");
  return body;
}

/** Where the analysis stands, in words, while it is not finished. */
function progressText(analysis: VideoAnalysis | null, queue: QueueView): string {
  if (analysis?.state === "reading" || queue?.status === "reading") return "AI 正在看關鍵畫面，完成後會用 LINE 通知。";
  if (queue?.status === "running") {
    if (queue.phase === "fetch") return "Mac 正在重新取得影片。";
    if (queue.phase === "frames") return "Mac 正在量鏡頭切點、切出關鍵畫面。";
    if (queue.phase === "upload") return "Mac 正在傳送關鍵畫面。";
    return "Mac 已接手，正在準備。";
  }
  return "已排入，等 Mac 接手。Mac 開著並連上行光道場時才會開始。";
}

/**
 * 畫面與節奏：只在擁有者按下時分析。切點與時間由 Mac 用 FFmpeg 量出；畫面描述與手法由 AI 看關鍵畫面寫成，需要核對。
 * 核對確認後，分鏡才會帶進淬鍊；每個手法可以加上自己的話，存成手法觀察卡。
 */
export default function CaptureVideoAnalysisPanel({ capture, onUpdated }: { capture: CaptureEntry; onUpdated: (capture: CaptureEntry) => void }) {
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(capture.clip.videoAnalysis ?? null);
  const [queue, setQueue] = useState<QueueView>(null);
  const [macReady, setMacReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<number, { title: string; words: string }>>({});
  const url = `/api/dojo/captures/${encodeURIComponent(capture.id)}/video-analysis`;

  useEffect(() => { setAnalysis(capture.clip.videoAnalysis ?? null); }, [capture.clip.videoAnalysis]);

  const apply = useCallback((status: Status) => { setAnalysis(status.analysis); setQueue(status.queue); setMacReady(status.macReady); }, []);
  const refresh = useCallback(async () => {
    try { apply(await json<Status>(await fetch(url, { cache: "no-store" }))); } catch { /* the next poll tries again */ }
  }, [apply, url]);

  const pending = analysis?.state === "queued" || analysis?.state === "working" || analysis?.state === "reading";
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [pending, refresh]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const result = await json<Status | { capture: CaptureEntry }>(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      if ("capture" in result) { onUpdated(result.capture); setAnalysis(result.capture.clip.videoAnalysis ?? null); }
      else apply(result);
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); return false; }
    finally { setBusy(false); }
  }

  const shown = analysis?.state === "ready" && analysis.shots.length > 0 ? analysis : null;
  const facts = shown ? rhythmFacts(shown.duration, shown.cuts) : null;

  return <section className="capture-image-text capture-video-analysis" aria-label="畫面與節奏">
    <div className="capture-exploration-heading">
      <div><b>畫面與節奏</b><span>{analysis?.confirmed ? "已核對，淬鍊時分鏡會接在原文後面。" : "想學這支影片怎麼做時，可以請 Mac 切出關鍵畫面、由 AI 整理分鏡與手法；核對確認後才會帶進淬鍊。"}</span></div>
      <button type="button" disabled={busy || pending} onClick={() => {
        if (analysis?.confirmed && !window.confirm("重新分析會取代目前核對過的分鏡，需要再確認一次；已存的手法觀察卡會保留。要繼續嗎？")) return;
        void post({ action: "request" });
      }}>{pending ? "分析中…" : analysis ? "重新分析" : "分析畫面與節奏"}</button>
    </div>
    {!macReady && <p className="refine-note">Mac 的連線程式是舊版，還不能分析畫面。請展開「Mac 轉錄設定」重新下載配對檔並執行，更新後就會開始。</p>}
    {pending && <p className="refine-note">{progressText(analysis, queue)}</p>}
    {analysis?.state === "failed" && <p className="form-error">{analysis.error || queue?.error || "分析沒有完成，請稍後重試。"}</p>}
    {error && <p className="form-error">{error}</p>}

    {shown && facts && <>
      <div className="video-analysis-timeline" role="img" aria-label={`共 ${facts.shotCount} 個鏡頭，總長 ${clock(shown.duration)}`}>
        {shown.shots.map((shot) => <span key={shot.index} style={{ flexGrow: Math.max(0.01, shot.end - shot.start) }} title={`鏡頭 ${shot.index}｜${clock(shot.start)}–${clock(shot.end)}`}>{shot.index}</span>)}
      </div>
      <p className="video-analysis-facts">
        量測：總長 {clock(shown.duration)}，{facts.shotCount} 個鏡頭，最短 {facts.shortest} 秒、最長 {facts.longest} 秒
        {facts.fastest ? `；${clock(facts.fastest.start)}–${clock(facts.fastest.end)} 這三秒切了 ${facts.fastest.count} 個鏡頭，是最快的一段` : ""}。
      </p>

      <details open={shown.shots.length <= 8}>
        <summary>分鏡（{shown.shots.length} 個鏡頭）</summary>
        <ol className="video-analysis-shots">
          {shown.shots.map((shot) => <li key={shot.index}>
            <b>鏡頭 {shot.index}<small>　{clock(shot.start)}–{clock(shot.end)}（{(shot.end - shot.start).toFixed(1)} 秒）</small></b>
            {shot.picture && <p>畫面：{shot.picture}</p>}
            {shot.camera && <p>鏡頭：{shot.camera}</p>}
            {shot.motion && <p>動作：{shot.motion}</p>}
            {shot.transition && <p>轉場：{shot.transition}</p>}
            {shot.text && <p>字幕：{shot.text}</p>}
          </li>)}
        </ol>
      </details>

      {shown.rhythm && <p className="video-analysis-rhythm"><b>節奏</b>{shown.rhythm}</p>}
      {shown.uncertain && <p className="refine-note">需要核對：{shown.uncertain}</p>}

      <div className="forage-actions">
        {!shown.confirmed && <button type="button" className="primary" disabled={busy} onClick={() => void post({ action: "confirm" })}>確認分鏡，帶進淬鍊</button>}
        {shown.confirmed && <button type="button" disabled={busy} onClick={() => void post({ action: "unconfirm" })}>取消確認</button>}
      </div>

      {shown.techniques.length > 0 && <div className="video-analysis-techniques">
        <b>可以學的手法</b>
        {shown.techniques.map((technique, index) => {
          const draft = drafts[index] ?? { title: "", words: "" };
          const shots = technique.shots.length ? `鏡頭 ${technique.shots.join("、")}` : "";
          return <div key={`${index}-${technique.name}`} className="video-analysis-technique">
            <p><b>{technique.name}</b><small>　{technique.basis === "visible" ? "畫面可見" : "依前後畫面推測"}{shots ? `｜${shots}` : ""}</small></p>
            <p>{technique.how}</p>
            {technique.cardId ? <p className="refine-note">已存成手法觀察卡。</p> : <>
              <input className="field" value={draft.title} disabled={busy} placeholder={`卡片標題（留空就用「${technique.name}」）`}
                onChange={(event) => setDrafts((current) => ({ ...current, [index]: { ...draft, title: event.target.value } }))} />
              <textarea className="field" rows={3} value={draft.words} disabled={busy} placeholder="用自己的話寫下想學的是什麼、打算怎麼用（必填，會成為卡片的「我的原話」）"
                onChange={(event) => setDrafts((current) => ({ ...current, [index]: { ...draft, words: event.target.value } }))} />
              <div className="forage-actions">
                <button type="button" disabled={busy || !draft.words.trim()} onClick={async () => {
                  if (await post({ action: "card", index, title: draft.title, words: draft.words })) setDrafts((current) => { const next = { ...current }; delete next[index]; return next; });
                }}>存成手法觀察卡</button>
              </div>
            </>}
          </div>;
        })}
      </div>}
      <p className="refine-note">切點與時間是 Mac 量出來的；畫面、鏡頭運動與手法是 AI 看關鍵畫面整理的，動作若標「依前後畫面推測」請以影片為準。沒有分析聲音，節奏只看剪接。</p>
    </>}
  </section>;
}
