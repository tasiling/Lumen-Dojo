/** Wording for 抖音 transcription status in LINE replies and completion notices. */

export type DouyinConnection = "unpaired" | "offline" | "waiting" | "ready";
export type DouyinJobStatus = { status: string; phase: string; title: string; error: string };

const phaseLabels: Record<string, string> = {
  resolve: "辨認抖音作品",
  download: "取得影片",
  audio: "讀取音軌",
  transcribe: "辨識語音",
  write: "存回這張素材卡",
};

const waitingReasons: Record<DouyinConnection, string> = {
  unpaired: "Mac 尚未配對，配對後才會開始。",
  offline: "Mac 目前離線，開機連線後會自動開始。",
  waiting: "Mac 已連線，BiliNote 尚未就緒。",
  ready: "已排入佇列。",
};

const willNotify = "完成或失敗時會再通知你。";

/** One line that says where a clip's transcription stands and what it is waiting for. */
export function douyinStatusLine(job: DouyinJobStatus | null, connection: DouyinConnection): string {
  if (!job) return "尚未排入轉錄";
  if (job.status === "done") return "已有逐字稿";
  if (job.status === "failed") return "轉錄未完成，可在素材內重試";
  if (job.status === "running") {
    const phase = phaseLabels[job.phase];
    return `Mac 正在轉錄${phase ? `：${phase}` : ""}。${willNotify}`;
  }
  return `等待 Mac 轉錄：${waitingReasons[connection] ?? waitingReasons.offline}${willNotify}`;
}

/** The notice sent once a transcription ends; null while it is still queued or running. */
export function douyinFinishedMessage(job: DouyinJobStatus | null): string | null {
  if (!job) return null;
  const title = `「${job.title}」`;
  if (job.status === "done") return ["轉錄完成｜抖音", title, "逐字稿已可在這筆素材查看。"].join("\n");
  if (job.status !== "failed") return null;
  const phase = phaseLabels[job.phase];
  return [
    "轉錄未完成｜抖音", title,
    ...(phase ? [`停在：${phase}`] : []),
    ...(job.error ? [`原因：${job.error}`] : []),
    "可在素材內重試。",
  ].join("\n");
}
