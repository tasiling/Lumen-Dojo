import "server-only";

import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";
import {
  KNOWLEDGE_CLAIM_TITLE_PREFIX,
  knowledgeClaimContent,
  knowledgeClaimRecordTitle,
  newKnowledgeClaim,
  normalizeKnowledgeClaim,
  type KnowledgeClaim,
} from "./knowledgeClaims";
import { listJsonRecords, updateJsonRecordById } from "./notionStore";
import { parseJson } from "./formal";

export async function listKnowledgeClaims(): Promise<KnowledgeClaim[]> {
  const rows = await listJsonRecords(KNOWLEDGE_CLAIM_TITLE_PREFIX);
  return rows
    .map((row) => normalizeKnowledgeClaim(row.value, { id: row.id }))
    .filter((claim): claim is KnowledgeClaim => claim !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getKnowledgeClaim(id: string): Promise<{ claim: KnowledgeClaim; title: string }> {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(KNOWLEDGE_CLAIM_TITLE_PREFIX)) throw new Error("紀錄類型不符");
  const claim = normalizeKnowledgeClaim(parseJson(row.內容), { id });
  if (!claim) throw new Error("既有知識主張無法讀取");
  return { claim, title: row.標題 };
}

export async function createKnowledgeClaim(input: unknown): Promise<KnowledgeClaim> {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const claim = newKnowledgeClaim({
    id: "pending",
    title: source.title,
    statement: source.statement,
    type: source.type,
    claimant: source.claimant,
    generatedBy: source.generatedBy,
    sources: source.sources,
    supportingEvidence: source.supportingEvidence,
    contradictingEvidence: source.contradictingEvidence,
    scope: source.scope,
    qualifier: source.qualifier,
    rebuttal: source.rebuttal,
  });
  if (!claim) throw new Error("請先寫下一句完整主張");
  const created = await createKnowledgeEntry({
    標題: knowledgeClaimRecordTitle(crypto.randomUUID()),
    內容: JSON.stringify(knowledgeClaimContent(claim)),
  });
  claim.id = created.id;
  return claim;
}

export async function saveKnowledgeClaim(claim: KnowledgeClaim): Promise<KnowledgeClaim> {
  const current = await getKnowledgeClaim(claim.id);
  const normalized = normalizeKnowledgeClaim(claim, {
    id: claim.id,
    createdAt: current.claim.createdAt,
    touch: true,
  });
  if (!normalized) throw new Error("知識主張無法儲存");
  await updateJsonRecordById(normalized.id, KNOWLEDGE_CLAIM_TITLE_PREFIX, current.title, knowledgeClaimContent(normalized));
  return normalized;
}
