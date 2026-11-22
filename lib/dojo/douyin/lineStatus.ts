/** Wording for Mac transcription status (抖音 links and media files on the Mac) in LINE replies and completion notices. */

export type DouyinConnection = "unpaired" | "offline" | "waiting" | "ready";
/** `kind` and `source` are absent on jobs read before file transcription existed; those are 抖音 jobs. */
export type DouyinJobStatus = { status: string; phase: string; title: string; error: string; kind?: string; source?: string };

const phaseLabels: Record<string, string> = {
  resolve: "辨認抖音作品",
  download: "取得影片",
  audio: "讀取音軌",
  transcribe: "辨識語音",
  write: "存回這張素材卡",
};

/** The step a job stopped at or is working on, in the owner's words. */
export function transcriptionPhaseLabel(job: Pick<DouyinJobStatus, "phase" | "kind">): string {
  return phaseLabels[job.phase] ?? "";
}

/** Where the media came from: the capture's platform for a file on the Mac, otherwise 抖音. */
export function transcriptionSource(job: Pick<DouyinJobStatus, "kind" | "source">): string {
  return job.kind === "file" ? job.source || "影片檔" : "抖音";
}

const waitingReasons: Record<DouyinConnection, string> = {
  unpaired: "Mac 尚未配對，配對後才會開始。",
  offline: "Mac 目前離線，開機連線後會自動開始。",
  waiting: "Mac 已連線，BiliNote 尚未就緒。",
  ready: "已排入佇列。",
};
const needsUpdate = "Mac 的連線程式是舊版，請在素材頁重新下載 Mac 配對檔並執行。";

const willNotify = "完成或失敗時會再通知你。";

/**
 * One line that says where a clip's transcription stands and what it is waiting for.
 * `handlesFiles` is false when the paired Mac runs a worker installed before file transcription existed.
 */
export function douyinStatusLine(job: DouyinJobStatus | null, connection: DouyinConnection, handlesFiles = true): string {
  if (!job) return "尚未排入轉錄";
  if (job.status === "done") return "已有逐字稿";
  if (job.status === "failed") return "轉錄未完成，可在素材內重試";
  if (job.status === "running") {
    const phase = transcriptionPhaseLabel(job);
    return `Mac 正在轉錄${phase ? `：${phase}` : ""}。${willNotify}`;
  }
  const reason = job.kind === "file" && connection === "ready" && !handlesFiles
    ? needsUpdate
    : waitingReasons[connection] ?? waitingReasons.offline;
  return `等待 Mac 轉錄：${reason}${willNotify}`;
}

/** The notice sent once a transcription ends; null while it is still queued or running. */
export function douyinFinishedMessage(job: DouyinJobStatus | null): string | null {
  if (!job) return null;
  const title = `「${job.title}」`;
  const source = transcriptionSource(job);
  if (job.status === "done") return [`轉錄完成｜${source}`, title, "逐字稿已可在這筆素材查看。"].join("\n");
  if (job.status !== "failed") return null;
  const phase = transcriptionPhaseLabel(job);
  return [
    `轉錄未完成｜${source}`, title,
    ...(phase ? [`停在：${phase}`] : []),
    ...(job.error ? [`原因：${job.error}`] : []),
    job.kind === "file" ? "原檔仍在 Mac 的 iCloud 資料夾，可在素材內重試。" : "可在素材內重試。",
  ].join("\n");
}
