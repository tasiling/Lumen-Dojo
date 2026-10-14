"use client";
import { useState } from "react";
import type { Evidence, EvidenceInput } from "@/lib/dojo/assessments/model";
type NativeView = EvidenceInput & Partial<Pick<Evidence, "status" | "nativeMediaIdentity">>;
export default function NativeAttachmentView({ evidence }: { evidence: NativeView }) {
  const [failed, setFailed] = useState(false);
  if (!["file", "audio", "professional-proof"].includes(evidence.kind) || !evidence.referenceId || !evidence.fileBlockId) return null;
  if (evidence.status && evidence.status !== "available") return <p>來源目前不可用；保存的快照仍可查看。</p>;
  const q = new URLSearchParams({ page: evidence.referenceId, block: evidence.fileBlockId });
  if (evidence.nativeMediaIdentity) q.set("identity", evidence.nativeMediaIdentity);
  const src = "/api/dojo/assessments/media?" + q.toString();
  return <div>
    {evidence.kind === "audio" ? <><p>{evidence.label}：原生音訊</p><audio key={src} aria-label={evidence.label} controls preload="none" src={src} style={{ width: "100%", maxWidth: 480 }} onLoadedMetadata={() => setFailed(false)} onError={() => setFailed(true)} /></> : <a href={src} target="_blank" rel="noopener noreferrer">查看原生附件（另開分頁）</a>}
    {failed && <p role="alert">音訊目前無法播放。請重新讀取來源；若來源內容已變更，需要重新選入並保存，不能沿用舊作品的評核。</p>}
  </div>;
}
