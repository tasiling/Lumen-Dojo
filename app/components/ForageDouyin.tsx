"use client";

import { useEffect, useState } from "react";

const API = "/api/dojo/douyin";
const INSTALL_FILENAME = "YeCai-Connect-Mac-Production.command";
const INSTALL_COMMAND = `bash "$HOME/Downloads/${INSTALL_FILENAME}"`;

const sourceHosts = ["douyin.com", "iesdouyin.com"];
const statuses = {
  queued: "等待 Mac 轉錄",
  running: "Mac 正在轉錄",
  done: "已有逐字稿",
  failed: "轉錄未完成",
};
const phases: Record<string, string> = {
  resolve: "辨認抖音作品",
  download: "取得影片",
  audio: "讀取音軌",
  transcribe: "辨識語音",
  write: "存回這張素材卡",
};
const connections = {
  unpaired: "Mac 尚未配對",
  offline: "等待 Mac 連線",
  waiting: "Mac 已連線，等待 BiliNote 就緒",
  ready: "Mac 可轉錄",
};

type Job = {
  status: keyof typeof statuses;
  phase: string;
  title: string;
  share: string;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  error: string;
};
type State = { connection: keyof typeof connections; job: Job | null };

export function isDouyinCapture(sourceUrl: string, platform: string): boolean {
  if (platform === "抖音") return true;
  try {
    const { hostname } = new URL(sourceUrl);
    return sourceHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function timestamp(start: number) {
  const seconds = Math.floor(start);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function readingText(job: Job): string {
  if (job.text.includes("\n") || job.segments.length < 2) return job.text;
  const paragraphs: string[] = [];
  let cursor = 0;
  let paragraphAt = 0;
  let paragraphTime = job.segments[0].start;
  let lastEnd = paragraphTime;
  for (const segment of job.segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const at = job.text.indexOf(text, cursor);
    if (at < 0) continue;
    if (cursor && at > paragraphAt &&
       (segment.start - paragraphTime >= 40 || at - paragraphAt >= 240 || segment.start - lastEnd >= 3)) {
      paragraphs.push(job.text.slice(paragraphAt, at));
      paragraphAt = at;
      paragraphTime = segment.start;
    }
    cursor = at + text.length;
    lastEnd = segment.end;
  }
  paragraphs.push(job.text.slice(paragraphAt));
  return paragraphs.join("\n\n");
}

function transcriptPreview(text: string) {
  if (text.length <= 600) return { lead: text, rest: "" };
  const ending = text.slice(220, 440).search(/\n|[。！？.!?]/u);
  const cut = ending === -1 ? 440 : 221 + ending;
  return { lead: text.slice(0, cut), rest: text.slice(cut).trimStart() };
}

async function checked(response: Response) {
  if (response.ok) return response;
  const body = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(body.error || `目前無法讀取 Mac 轉錄資料（${response.status}）。`);
}

export default function ForageDouyin({ captureId, captureTitle }: { captureId?: string; captureTitle?: string }) {
  const [data, setData] = useState<State | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const job = data?.job;
  const visible = Boolean(captureId) || connectionOpen;
  const poll = connectionOpen || job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    if (!visible || busy) return;
    const controller = new AbortController();
    const url = captureId ? `${API}?captureId=${encodeURIComponent(captureId)}` : API;
    let inFlight = false;
    async function refresh() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const response = await checked(await fetch(url, { signal: controller.signal, cache: "no-store" }));
        const next = await response.json() as State;
        if (!controller.signal.aborted) {
          setData(next);
          setLoadError("");
        }
      } catch (caught) {
        if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : "無法讀取 Mac 轉錄狀態。");
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = poll ? window.setInterval(refresh, 9000) : undefined;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [busy, captureId, poll, reload, visible]);

  async function submit(action: "install" | "retry") {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const response = await checked(await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, captureId }),
      }));
      if (action === "retry") {
        setData(await response.json() as State);
      } else {
        const url = URL.createObjectURL(await response.blob());
        const download = document.createElement("a");
        download.href = url;
        download.download = INSTALL_FILENAME;
        document.body.append(download);
        download.click();
        download.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setNotice("已送出配對檔。請在 Mac 下載後十分鐘內執行。");
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "這次操作沒有完成。");
    } finally {
      setBusy(false);
    }
  }

  async function copyTranscript(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("已複製完整逐字稿。");
    } catch {
      setNotice("無法使用剪貼簿。可以展開全文後，長按文字複製。");
    }
  }

  const transcript = job?.status === "done" ? transcriptPreview(readingText(job)) : null;
  const status = job ? statuses[job.status] : data ? "尚未排入轉錄" : loadError ? "" : "正在讀取轉錄狀態…";

  return (
    <section className="forage-douyin" aria-label={captureId ? "抖音逐字稿" : "Mac 轉錄設定"}>
      {captureId && <>
        <div className="forage-douyin-heading">
          <b>逐字稿</b>
          <span aria-live="polite">{status}</span>
        </div>
        {job?.title && job.title !== captureTitle && job.title !== "抖音影片" && <p className="forage-douyin-title">{job.title}</p>}
        {job?.status === "queued" && <p>Mac 可用時會自動接續這筆素材。</p>}
        {job?.status === "running" && phases[job.phase] && <p>{phases[job.phase]}中…</p>}
        {job?.status === "failed" && <p role="alert" className="form-error">
          {phases[job.phase] ? `${phases[job.phase]}時未完成。` : ""}{job.error || "可以讓 Mac 再試一次。"}
        </p>}
        {data && (!job || job.status === "failed") && <button type="button" disabled={busy} onClick={() => void submit("retry")}>
          {job ? "重試轉錄" : "排入 Mac 轉錄"}
        </button>}
        {job && transcript && <>
          <p className="forage-douyin-text">{transcript.lead}</p>
          {transcript.rest && <details className="forage-douyin-fold">
            <summary>展開完整逐字稿</summary>
            <p className="forage-douyin-text">{transcript.rest}</p>
          </details>}
          <button type="button" onClick={() => void copyTranscript(job.text)}>複製完整逐字稿</button>
          {job.segments.length > 0 && <details className="forage-douyin-fold" onToggle={(event) => setTimesOpen(event.currentTarget.open)}>
            <summary>查看時間戳（{job.segments.length} 段）</summary>
            {timesOpen && <ol className="forage-douyin-timestamps">
              {job.segments.map((segment, index) => <li key={`${segment.start}-${index}`}>
                <time dateTime={`PT${Math.floor(segment.start)}S`}>{timestamp(segment.start)}</time>
                <span>{segment.text}</span>
              </li>)}
            </ol>}
          </details>}
        </>}
        {job?.share && <details className="forage-douyin-fold">
          <summary>抖音分享文字</summary>
          <p className="forage-douyin-text">{job.share}</p>
        </details>}
      </>}
      <details className="forage-douyin-connection" onToggle={(event) => setConnectionOpen(event.currentTarget.open)}>
        <summary>Mac 轉錄設定{data ? `・${connections[data.connection]}` : ""}</summary>
        <p>在安裝 BiliNote 的 Mac 登入正式版。下載配對檔後，到 Mac 的「終端機」執行下方指令，並開著原有的 Docker 和 BiliNote。</p>
        <code>{INSTALL_COMMAND}</code>
        <button type="button" disabled={busy} onClick={() => void submit("install")}>下載 Mac 配對檔</button>
      </details>
      {notice && <p role="status">{notice}</p>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {loadError && <div className="form-error" role="alert">
        <p>{loadError}</p>
        <button type="button" onClick={() => setReload((value) => value + 1)}>重新讀取轉錄狀態</button>
      </div>}
    </section>
  );
}
