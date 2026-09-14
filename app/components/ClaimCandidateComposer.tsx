"use client";

import { useState } from "react";
import {
  KNOWLEDGE_CLAIM_TYPES,
  type Claimant,
  type KnowledgeClaim,
  type KnowledgeClaimType,
  type KnowledgeSourceRef,
} from "@/lib/dojo/knowledgeClaims";

type Props = {
  source: KnowledgeSourceRef;
  defaultStatement: string;
  defaultType?: KnowledgeClaimType;
  defaultClaimant?: Claimant;
  supportingEvidence?: string;
  contradictingEvidence?: string;
  buttonLabel?: string;
};

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? `操作失敗（${response.status}）`);
  return json as T;
}

export default function ClaimCandidateComposer({
  source,
  defaultStatement,
  defaultType = "understanding",
  defaultClaimant = "crystal",
  supportingEvidence = "",
  contradictingEvidence = "",
  buttonLabel = "整理成知識候選",
}: Props) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState(defaultStatement);
  const [type, setType] = useState<KnowledgeClaimType>(defaultType);
  const [claimant, setClaimant] = useState<Claimant>(defaultClaimant);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function create() {
    if (!statement.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await responseJson<{ claim: KnowledgeClaim; duplicate?: boolean }>(await fetch("/api/dojo/knowledge-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement,
          title: statement.slice(0, 80),
          type,
          claimant,
          generatedBy: "human",
          sources: [source],
          supportingEvidence,
          contradictingEvidence,
          preventDuplicateSource: true,
        }),
      }));
      setNotice(result.duplicate ? "這份來源已經連到一項知識主張。" : "已建立 K2 候選；尚未自動採用。 ");
      if (!result.duplicate) setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setSaving(false); }
  }

  if (!open) return <div className="claim-candidate-entry"><button type="button" onClick={() => { setOpen(true); setNotice(""); }}>{buttonLabel}</button>{notice && <small>{notice}</small>}</div>;

  return <div className="claim-candidate-composer">
    <div><b>建立 K2 候選</b><p>只建立可審閱主張，不會自動成為正式知識。</p></div>
    <textarea className="field" rows={3} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="一句完整、可判斷的主張" />
    <div className="knowledge-create-grid">
      <select className="field" value={type} onChange={(event) => setType(event.target.value as KnowledgeClaimType)}>{Object.entries(KNOWLEDGE_CLAIM_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select className="field" value={claimant} onChange={(event) => setClaimant(event.target.value as Claimant)}><option value="crystal">Crystal 的主張</option><option value="external_author">來源作者的主張</option><option value="shared">共同形成</option><option value="unknown">尚未確認</option></select>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="knowledge-card-actions"><button type="button" onClick={() => setOpen(false)} disabled={saving}>取消</button><button type="button" className="primary" onClick={() => void create()} disabled={saving || !statement.trim()}>{saving ? "建立中…" : "建立候選主張"}</button></div>
  </div>;
}
