"use client";

import { useEffect, useState } from "react";
import type { CaptureTranscript } from "@/lib/dojo/formal";
import { transcriptReadingText } from "@/lib/dojo/douyin/transcriptText";
import { TIDY_MANUAL, tidyComparison, tidyParagraphs, tidyWords, type ManualTidyCheck, type TranscriptTidy } from "@/lib/dojo/douyin/tidyText";

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
  kind?: "douyin" | "file";
  source?: string;
  status: keyof typeof statuses;
  phase: string;
  title: string;
  share: string;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  error: string;
  synced?: boolean;
  finishedAt?: string | null;
  /** 'pending' while correction is queued or running; null when it was never requested. */
  tidyState?: "pending" | "done" | "failed" | "skipped" | null;
  tidy?: TranscriptTidy | null;
  tidyReason?: string;
  /** The Traditional original the corrected text is compared with, for 「改了哪裡」. */
  tidyBase?: string;
};
/** A video or audio file waiting in the Mac's iCloud inbox folder; only its name, size and hash are known here. */
type Offer = { file: string; name: string; size: number };
type State = {
  connection: keyof typeof connections;
  mac?: { files: boolean; inbox: string };
  offers?: Offer[];
  unsynced?: number;
  job: Job | null;
};
const INBOX_NAME = "行光轉錄";

function megabytes(size: number) {
  return size >= 1048576 ? `${Math.round(size / 1048576)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

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

/**
 * Mac transcription for a capture. 抖音 captures can be queued from their link. For any capture, a video or audio
 * file saved to the iCloud Drive inbox folder is transcribed on the Mac; the file itself is never sent to this site.
 *
 * `stored` is the transcript in the capture's Notion record, which is what the page shows. The queue supplies
 * progress, timestamps, and the text itself only until Notion has it (or beyond what Notion could hold).
 */
export default function ForageDouyin({ captureId, captureTitle, douyin = true, stored }: { captureId?: string; captureTitle?: string; douyin?: boolean; stored?: CaptureTranscript }) {
  const [data, setData] = useState<State | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState<"tidy" | "raw">("tidy");
  // 貼回校正版：the text being pasted, what the check found, and the copy just saved (shown before the page reloads).
  const [paste, setPaste] = useState("");
  const [pasteCheck, setPasteCheck] = useState<ManualTidyCheck | null>(null);
  const [pasted, setPasted] = useState<TranscriptTidy | null>(null);
  const job = data?.job;
  const visible = Boolean(captureId) || connectionOpen;
  // Captures without a transcript keep polling slowly so a file that reaches the Mac shows up here.
  const active = connectionOpen || job?.status === "queued" || job?.status === "running" || job?.tidyState === "pending";
  const poll = active || (Boolean(captureId) && !job);

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
    const timer = poll ? window.setInterval(refresh, active ? 9000 : 30000) : undefined;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, busy, captureId, poll, reload, visible]);

  async function submit(action: "install" | "retry" | "attach" | "syncTranscripts" | "tidy", file?: string) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const response = await checked(await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, captureId, file }),
      }));
      if (action === "syncTranscripts") {
        const result = await response.json() as State & { synced: number; failed: number };
        setData(result);
        setNotice(result.failed ? `有 ${result.failed} 筆這次沒有寫入 Notion，稍後會自動再試。` : result.unsynced
          ? `已寫入 ${result.synced} 筆，還有 ${result.unsynced} 筆，可以再按一次。` : "逐字稿都已寫回 Notion。");
      } else if (action !== "install") {
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

  async function submitPaste(confirm: boolean) {
    setBusy(true); setActionError(""); setNotice("");
    try {
      const response = await checked(await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tidyPaste", captureId, text: paste, confirm }),
      }));
      const result = await response.json() as State & { check: ManualTidyCheck; saved: boolean; tidy?: TranscriptTidy };
      setPasteCheck(result.saved ? null : result.check);
      if (result.saved && result.tidy) {
        setData(result); setPasted(result.tidy); setPaste(""); setVersion("tidy");
        setNotice("已放回校正版。原始辨識仍然保留，可以隨時切換對照。");
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

  const offers = data?.offers ?? [];
  const canAttach = Boolean(captureId) && (!job || job.status === "done" || job.status === "failed");
  const done = job?.status === "done" ? job : null;
  // Notion's copy is shown once it holds this transcript in full; until then the queue's copy stands in.
  const inNotion = stored && (!done || (done.synced !== false && stored.finishedAt === done.finishedAt)) ? stored : null;
  const fullText = inNotion && !(inNotion.truncated && done) ? inNotion.text : done ? transcriptReadingText(done) : "";
  // The corrected copy is shown by default; the raw recognition stays one tap away and is never replaced.
  const tidy = pasted ?? (inNotion && !(inNotion.truncated && done) ? inNotion.tidy : done?.tidy ?? inNotion?.tidy) ?? null;
  const manual = tidy?.model === TIDY_MANUAL;
  const showTidy = Boolean(tidy) && version === "tidy";
  const shownText = showTidy ? tidy!.text : fullText;
  const transcript = shownText ? transcriptPreview(shownText) : null;
  // A pasted copy may be re-paragraphed, so it has no paragraph-by-paragraph comparison; both versions stay readable.
  const comparison = tidy && !manual && done?.tidyBase ? tidyComparison(done.tidyBase, tidy.text) : null;
  // Word fixes are listed one by one; punctuation, breaks and 〔？〕 marks are only counted, so the fixes stay visible.
  const wordFixes = comparison?.map((item) => ({ ...item, hunks: item.hunks.filter((h) => tidyWords(h.before) !== tidyWords(h.after)) }))
    .filter((item) => item.hunks.length) ?? [];
  const markOnly = (comparison?.reduce((sum, item) => sum + item.hunks.length, 0) ?? 0) - wordFixes.reduce((sum, item) => sum + item.hunks.length, 0);
  const unsure = tidy ? tidy.text.split("〔？〕").length - 1 : 0;
  const tidyPending = done?.tidyState === "pending";
  const canTidy = Boolean(done) && !tidyPending && (!tidy || tidy.state !== "done" || manual);
  const canPaste = Boolean(captureId) && !tidyPending && Boolean(fullText);
  const revertedPreview = tidy ? tidyParagraphs(tidy.text) : [];
  const pending = Boolean(done && done.synced === false);
  const status = job && !(inNotion && job.status === "failed") ? statuses[job.status]
    : inNotion ? statuses.done : data ? "尚未排入轉錄" : loadError ? "" : "正在讀取轉錄狀態…";

  return (
    <section className="forage-douyin" aria-label={captureId ? "逐字稿" : "Mac 轉錄設定"}>
      {captureId && <>
        <div className="forage-douyin-heading">
          <b>逐字稿</b>
          <span aria-live="polite">{status}</span>
        </div>
        {job?.title && job.title !== captureTitle && job.title !== "抖音影片" && <p className="forage-douyin-title">{job.title}</p>}
        {job?.status === "queued" && (job.kind === "file" && data?.connection === "ready" && data.mac?.files === false
          ? <p>Mac 的連線程式是舊版，還不能轉錄資料夾裡的檔案。請展開下方「Mac 轉錄設定」重新下載配對檔並執行。</p>
          : <p>Mac 可用時會自動接續這筆素材。</p>)}
        {job?.status === "running" && phases[job.phase] && <p>{phases[job.phase]}中…</p>}
        {job?.status === "failed" && <p role="alert" className="form-error">
          {phases[job.phase] ? `${phases[job.phase]}時未完成。` : ""}{job.error || "可以讓 Mac 再試一次。"}
        </p>}
        {data && ((!job && douyin) || job?.status === "failed") && <button type="button" disabled={busy} onClick={() => void submit("retry")}>
          {job ? "重試轉錄" : "排入 Mac 轉錄"}
        </button>}
        {data && !job && !douyin && <p>
          Threads、IG 等平台的影片：在 iPhone 把影片或音訊存進 iCloud 雲碟的「{INBOX_NAME}」資料夾。同步到 Mac 後，行光剪藏會在 LINE 問你要掛到哪一筆素材；影片只留在你的 Mac，這裡只收逐字稿。
        </p>}
        {data?.mac?.inbox === "unreadable" && <p role="alert" className="form-error">
          Mac 讀不到 iCloud 雲碟的「{INBOX_NAME}」資料夾。請在 Mac 的「系統設定 → 隱私權與安全性 → 檔案與檔案夾」允許 Python 取用 iCloud 雲碟，並確認資料夾存在。
        </p>}
        {canAttach && offers.length > 0 && <div className="forage-douyin-offers">
          <b>Mac 上待指定的檔案</b>
          {job && <p>指定後會取代這筆素材目前的逐字稿。</p>}
          <ul>{offers.map((offer) => <li key={offer.file}>
            <span>{offer.name}（{megabytes(offer.size)}）</span>
            <button type="button" disabled={busy} onClick={() => void submit("attach", offer.file)}>轉錄到這筆素材</button>
          </li>)}</ul>
        </div>}
        {pending && <p role="status">
          這份逐字稿還沒寫回 Notion，會自動再試。
          <button type="button" disabled={busy} onClick={() => void submit("syncTranscripts")}>立即寫回 Notion</button>
        </p>}
        {inNotion?.truncated && <p role="status">
          這份逐字稿太長，Notion 只存到前 {inNotion.text.length.toLocaleString()} 字{done ? "；這裡顯示的是轉錄佇列裡的完整內容" : ""}。
        </p>}
        {tidyPending && <p role="status">正在校正逐字稿（簡轉繁、辨識修正）…完成前先顯示原始辨識。</p>}
        {tidy && <div className="forage-douyin-versions" role="radiogroup" aria-label="逐字稿版本">
          <button type="button" role="radio" aria-checked={showTidy} className={showTidy ? "on" : ""} onClick={() => setVersion("tidy")}>{tidy.state === "done" ? "校正版" : "繁體原稿"}</button>
          <button type="button" role="radio" aria-checked={!showTidy} className={!showTidy ? "on" : ""} onClick={() => setVersion("raw")}>原始辨識</button>
        </div>}
        {tidy && showTidy && <div className="forage-douyin-tidy-note" role="note">
          {manual && <p>這是你貼回的校正版{tidy.at ? `（${new Date(tidy.at).toLocaleDateString("zh-TW")}）` : ""}。討論與淬鍊會使用這一版；原始辨識仍然保留。</p>}
          {!manual && tidy.state === "done" && <p>已校正：簡體轉為繁體，修正辨識錯字、標點與分段，共改了 {tidy.changes} 處；沒有刪句、增句或改寫。</p>}
          {tidy.state === "skipped" && <p>{done?.tidyReason || "只轉成繁體，沒有做辨識修正。"}</p>}
          {tidy.state === "failed" && <p>{done?.tidyReason || "辨識修正沒有完成。"}這裡顯示的是只轉成繁體的原始辨識。</p>}
          {tidy.state === "done" && tidy.reverted.length > 0 && <details className="forage-douyin-fold">
            <summary>這幾段沒有校正（{tidy.reverted.length} 段）</summary>
            <p>這些段落的校正結果沒有通過檢查（改動過多或出現原稿沒有的句子），維持繁體原稿：</p>
            <ul className="forage-douyin-reverted">{tidy.reverted.map((n) => <li key={n}>第 {n} 段：{(revertedPreview[n - 1] ?? "").slice(0, 24)}…</li>)}</ul>
          </details>}
          {comparison && comparison.length > 0 && <details className="forage-douyin-fold">
            <summary>改了哪裡（{comparison.reduce((sum, item) => sum + item.hunks.length, 0)} 處，簡轉繁不列入）</summary>
            <p>{wordFixes.length ? `修正用字 ${wordFixes.reduce((sum, item) => sum + item.hunks.length, 0)} 處：` : "沒有修改用字。"}</p>
            {wordFixes.length > 0 && <ol className="forage-douyin-changes">{wordFixes.map((item) => <li key={item.n}>
              <b>第 {item.n} 段</b>
              <ul>{item.hunks.map((hunk, index) => <li key={index}><del>{hunk.before || "（無）"}</del> → <ins>{hunk.after || "（刪去）"}</ins></li>)}</ul>
            </li>)}</ol>}
            {(markOnly > 0 || unsure > 0) && <p>{markOnly > 0 ? `其餘 ${markOnly} 處只加了標點、換行或〔？〕。` : ""}{unsure > 0 ? `〔？〕表示聽不出來的地方，共 ${unsure} 處。` : ""}</p>}
          </details>}
        </div>}
        {canTidy && <button type="button" disabled={busy} onClick={() => void submit("tidy")}>{manual ? "改用自動校正" : tidy ? "重新校正" : "補做校正"}</button>}
        {canPaste && <details className="forage-douyin-fold forage-douyin-paste" open={Boolean(paste) || undefined}>
          <summary>貼回校正版（在 GPT 完整校正後放回來）</summary>
          <p>把校正後的整份逐字稿貼在這裡，它會成為這筆素材的校正版。原始辨識不會被取代。</p>
          <label>校正後的逐字稿
            <textarea className="field" rows={6} value={paste} onChange={(event) => { setPaste(event.target.value); setPasteCheck(null); }} />
          </label>
          <button type="button" className="primary" disabled={busy || !paste.trim()} onClick={() => void submitPaste(false)}>核對並放回</button>
          {pasteCheck && <div className="forage-douyin-paste-check" role="alert">
            <b>這一版和原始辨識有出入，請先看過再決定</b>
            <p>原始辨識 {pasteCheck.baseChars.toLocaleString()} 字，貼回的版本 {pasteCheck.tidyChars.toLocaleString()} 字，相差 {Math.round(pasteCheck.drift * 100)}%。</p>
            {pasteCheck.added.length > 0 && <details className="forage-douyin-fold" open>
              <summary>原始辨識裡找不到的句子（{pasteCheck.added.length} 句）</summary>
              <p>可能是 GPT 加的開場白、小結，或改寫過的句子。</p>
              <ul>{pasteCheck.added.slice(0, 30).map((line, index) => <li key={index}>{line}</li>)}</ul>
            </details>}
            {pasteCheck.missing.length > 0 && <details className="forage-douyin-fold" open>
              <summary>貼回的版本裡找不到的段落（{pasteCheck.missing.length} 處）</summary>
              <p>可能是被刪掉或改寫的地方，以下是原始辨識的文字。</p>
              <ul>{pasteCheck.missing.slice(0, 30).map((line, index) => <li key={index}>{line}</li>)}</ul>
            </details>}
            <p>可以回到上方修改貼上的文字再核對一次，或直接採用。</p>
            <button type="button" disabled={busy} onClick={() => void submitPaste(true)}>我看過了，仍要採用這一版</button>
          </div>}
        </details>}
        {transcript && <>
          <p className="forage-douyin-text">{transcript.lead}</p>
          {transcript.rest && <details className="forage-douyin-fold">
            <summary>展開完整逐字稿</summary>
            <p className="forage-douyin-text">{transcript.rest}</p>
          </details>}
          <button type="button" onClick={() => void copyTranscript(shownText)}>{showTidy ? "複製完整逐字稿（校正版）" : "複製完整逐字稿"}</button>
          {done && done.segments.length > 0 && <details className="forage-douyin-fold" onToggle={(event) => setTimesOpen(event.currentTarget.open)}>
            <summary>查看時間戳（{done.segments.length} 段）</summary>
            {timesOpen && <ol className="forage-douyin-timestamps">
              {done.segments.map((segment, index) => <li key={`${segment.start}-${index}`}>
                <time dateTime={`PT${Math.floor(segment.start)}S`}>{timestamp(segment.start)}</time>
                <span>{segment.text}</span>
              </li>)}
            </ol>}
          </details>}
        </>}
        {job?.share && job.kind !== "file" && <details className="forage-douyin-fold">
          <summary>抖音分享文字</summary>
          <p className="forage-douyin-text">{job.share}</p>
        </details>}
      </>}
      <details className="forage-douyin-connection" onToggle={(event) => setConnectionOpen(event.currentTarget.open)}>
        <summary>Mac 轉錄設定{data ? `・${connections[data.connection]}` : ""}</summary>
        <p>在安裝 BiliNote 的 Mac 登入正式版。下載配對檔後，到 Mac 的「終端機」執行下方指令，並開著原有的 Docker 和 BiliNote。</p>
        <p>安裝後，Mac 會留意 iCloud 雲碟的「{INBOX_NAME}」資料夾；轉完的原檔會移到 Mac 的「影片 → 行光轉錄封存」，以素材編號命名。</p>
        <code>{INSTALL_COMMAND}</code>
        <button type="button" disabled={busy} onClick={() => void submit("install")}>下載 Mac 配對檔</button>
        {Boolean(data?.unsynced) && <p role="status">
          有 {data?.unsynced} 筆逐字稿尚未寫回 Notion。
          <button type="button" disabled={busy} onClick={() => void submit("syncTranscripts")}>立即寫回 Notion</button>
        </p>}
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
