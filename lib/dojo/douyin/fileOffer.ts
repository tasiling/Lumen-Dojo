import "server-only";

import { listCaptureEntries } from "@/lib/dojo/captureStore";
import type { CaptureEntry } from "@/lib/dojo/formal";
import { platformFromUrl, pushLineMessage, quickReplyItem } from "@/lib/dojo/lineClipping";
import { douyinQueue } from "./queue.mjs";

/** The label shown for a capture's media in notices: its platform, or 影片檔 for a capture with no source. */
export function fileSourceLabel(capture: Pick<CaptureEntry, "sourceUrl" | "clip">): string {
  const platform = capture.clip.platform.trim();
  if (platform && platform !== "LINE") return platform;
  return capture.sourceUrl ? platformFromUrl(capture.sourceUrl) : "影片檔";
}

/** A capture title for a file that gets a capture of its own: the file name without its extension. */
export function fileCaptureTitle(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, 80) || "影片檔";
}

/**
 * Asks the owner in LINE which capture a new file on the Mac belongs to: the most recent one, or a new one.
 * Only the file's name and hash are known here; the media stays on the Mac.
 */
export async function askOwnerAboutFile(file: string, name: string): Promise<void> {
  const recent = (await listCaptureEntries())[0];
  const items = [
    ...(recent ? [quickReplyItem("掛到最近一筆", new URLSearchParams({ action: "fileAttach", file, captureId: recent.id }).toString())] : []),
    quickReplyItem("另外新增一筆", new URLSearchParams({ action: "fileNew", file }).toString()),
  ];
  const text = [
    "Mac 收到新檔案｜待轉錄",
    `「${name}」`,
    "要把逐字稿掛到哪一筆素材？",
    ...(recent ? [`最近一筆：「${recent.title}」`] : []),
    "也可以開啟任何一筆素材，在逐字稿區塊指定這個檔案。",
  ].join("\n");
  if (await pushLineMessage(text, { items })) douyinQueue().asked(file);
}
