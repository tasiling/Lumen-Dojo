export const KNOWLEDGE_CLAIM_TITLE_PREFIX = "行光知識主張-";

export const KNOWLEDGE_CLAIM_TYPES = {
  understanding: "理解知識",
  experience: "經驗知識",
  perspective: "立場知識",
  procedure: "方法知識",
  style_policy: "語氣／操作規則",
} as const;

export type KnowledgeClaimType = keyof typeof KNOWLEDGE_CLAIM_TYPES;
export type KnowledgeMaturity = "K2" | "K3" | "K4";
export type KnowledgeClaimStatus =
  | "candidate"
  | "active"
  | "partial"
  | "disputed"
  | "refuted"
  | "superseded"
  | "archived";
export type KnowledgeUse = "inspiration" | "perspective" | "evidence" | "style";
export type Claimant = "external_author" | "crystal" | "shared" | "unknown";
export type ClaimGenerator = "human" | "llm_assisted" | "imported";

export type KnowledgeSourceRef = {
  sourceType:
    | "forage_capture"
    | "reading_insight"
    | "reading_note"
    | "weaving_core"
    | "weaving_reflection"
    | "external"
    | "manual";
  sourceId: string;
  label: string;
  locator: string;
  url: string;
  snapshot: string;
};

export type KnowledgeClaimVersion = {
  id: string;
  number: number;
  statement: string;
  maturity: KnowledgeMaturity;
  status: KnowledgeClaimStatus;
  claimant: Claimant;
  generatedBy: ClaimGenerator;
  adoptedBy: "Crystal" | null;
  sources: KnowledgeSourceRef[];
  supportingEvidence: string;
  contradictingEvidence: string;
  scope: string;
  qualifier: string;
  rebuttal: string;
  versionNote: string;
  createdAt: string;
  adoptedAt: string | null;
};

export type KnowledgeClaim = {
  version: 1;
  recordType: "knowledge-claim";
  id: string;
  title: string;
  type: KnowledgeClaimType;
  allowedUses: KnowledgeUse[];
  currentVersionId: string;
  versions: KnowledgeClaimVersion[];
  createdAt: string;
  updatedAt: string;
};

const CLAIM_TYPES = Object.keys(KNOWLEDGE_CLAIM_TYPES) as KnowledgeClaimType[];
const CLAIM_USES: KnowledgeUse[] = ["inspiration", "perspective", "evidence", "style"];
const CLAIMANTS: Claimant[] = ["external_author", "crystal", "shared", "unknown"];
const GENERATORS: ClaimGenerator[] = ["human", "llm_assisted", "imported"];
const MATURITIES: KnowledgeMaturity[] = ["K2", "K3", "K4"];
const STATUSES: KnowledgeClaimStatus[] = ["candidate", "active", "partial", "disputed", "refuted", "superseded", "archived"];
const SOURCE_TYPES: KnowledgeSourceRef["sourceType"][] = ["forage_capture", "reading_insight", "reading_note", "weaving_core", "weaving_reflection", "external", "manual"];

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function iso(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

function normalizeSource(value: unknown): KnowledgeSourceRef | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<KnowledgeSourceRef>;
  const sourceType = SOURCE_TYPES.includes(source.sourceType as KnowledgeSourceRef["sourceType"])
    ? source.sourceType as KnowledgeSourceRef["sourceType"]
    : "manual";
  const label = text(source.label, 300);
  const sourceId = text(source.sourceId, 300);
  if (!label && !sourceId) return null;
  return {
    sourceType,
    sourceId,
    label,
    locator: text(source.locator, 1000),
    url: text(source.url, 2000),
    snapshot: text(source.snapshot, 12000),
  };
}

function normalizeVersion(value: unknown, index: number, now: string): KnowledgeClaimVersion | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<KnowledgeClaimVersion>;
  const statement = text(source.statement, 6000);
  if (!statement) return null;
  const maturity = MATURITIES.includes(source.maturity as KnowledgeMaturity) ? source.maturity as KnowledgeMaturity : "K2";
  const status = STATUSES.includes(source.status as KnowledgeClaimStatus) ? source.status as KnowledgeClaimStatus : "candidate";
  return {
    id: text(source.id, 100) || crypto.randomUUID(),
    number: Number.isInteger(source.number) && Number(source.number) > 0 ? Number(source.number) : index + 1,
    statement,
    maturity,
    status,
    claimant: CLAIMANTS.includes(source.claimant as Claimant) ? source.claimant as Claimant : "unknown",
    generatedBy: GENERATORS.includes(source.generatedBy as ClaimGenerator) ? source.generatedBy as ClaimGenerator : "human",
    adoptedBy: source.adoptedBy === "Crystal" ? "Crystal" : null,
    sources: Array.isArray(source.sources) ? source.sources.flatMap((item) => normalizeSource(item) ?? []).slice(0, 30) : [],
    supportingEvidence: text(source.supportingEvidence, 12000),
    contradictingEvidence: text(source.contradictingEvidence, 12000),
    scope: text(source.scope, 6000),
    qualifier: text(source.qualifier, 3000),
    rebuttal: text(source.rebuttal, 6000),
    versionNote: text(source.versionNote, 3000),
    createdAt: iso(source.createdAt, now),
    adoptedAt: source.adoptedAt ? iso(source.adoptedAt, now) : null,
  };
}

export function currentClaimVersion(claim: KnowledgeClaim): KnowledgeClaimVersion {
  return claim.versions.find((version) => version.id === claim.currentVersionId) ?? claim.versions[claim.versions.length - 1];
}

export function normalizeKnowledgeClaim(
  value: unknown,
  options: { id: string; createdAt?: string; touch?: boolean },
): KnowledgeClaim | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<KnowledgeClaim>;
  if (source.recordType !== "knowledge-claim") return null;
  const now = new Date().toISOString();
  const createdAt = options.createdAt ?? iso(source.createdAt, now);
  const versions = Array.isArray(source.versions)
    ? source.versions.flatMap((item, index) => normalizeVersion(item, index, createdAt) ?? [])
    : [];
  if (versions.length === 0) return null;
  const currentVersionId = versions.some((version) => version.id === source.currentVersionId)
    ? String(source.currentVersionId)
    : versions[versions.length - 1].id;
  const current = versions.find((version) => version.id === currentVersionId) ?? versions[versions.length - 1];
  return {
    version: 1,
    recordType: "knowledge-claim",
    id: options.id,
    title: text(source.title, 300) || current.statement.slice(0, 80),
    type: CLAIM_TYPES.includes(source.type as KnowledgeClaimType) ? source.type as KnowledgeClaimType : "understanding",
    allowedUses: Array.isArray(source.allowedUses)
      ? [...new Set(source.allowedUses.filter((use): use is KnowledgeUse => CLAIM_USES.includes(use as KnowledgeUse)))]
      : [],
    currentVersionId,
    versions,
    createdAt,
    updatedAt: options.touch ? now : iso(source.updatedAt, now),
  };
}

export function newKnowledgeClaim(input: {
  id: string;
  title?: unknown;
  statement: unknown;
  type?: unknown;
  claimant?: unknown;
  generatedBy?: unknown;
  sources?: unknown;
}): KnowledgeClaim | null {
  const now = new Date().toISOString();
  const versionId = crypto.randomUUID();
  return normalizeKnowledgeClaim({
    version: 1,
    recordType: "knowledge-claim",
    title: input.title,
    type: input.type,
    allowedUses: ["inspiration"],
    currentVersionId: versionId,
    versions: [{
      id: versionId,
      number: 1,
      statement: input.statement,
      maturity: "K2",
      status: "candidate",
      claimant: input.claimant,
      generatedBy: input.generatedBy,
      adoptedBy: null,
      sources: input.sources,
      supportingEvidence: "",
      contradictingEvidence: "",
      scope: "",
      qualifier: "",
      rebuttal: "",
      versionNote: "建立候選主張",
      createdAt: now,
      adoptedAt: null,
    }],
    createdAt: now,
    updatedAt: now,
  }, { id: input.id, createdAt: now });
}

export function knowledgeClaimContent(claim: KnowledgeClaim): Omit<KnowledgeClaim, "id"> {
  const { id: _id, ...content } = claim;
  void _id;
  return content;
}

export function knowledgeClaimRecordTitle(nonce: string): string {
  return `${KNOWLEDGE_CLAIM_TITLE_PREFIX}${nonce}`;
}

export function adoptionError(claim: KnowledgeClaim): string | null {
  const version = currentClaimVersion(claim);
  if (!version.statement) return "主張不可空白";
  if (version.claimant === "unknown") return "請先確認是誰提出這項主張";
  if (!version.scope) return "正式採用前，請寫明適用情境或邊界";
  if (claim.type === "understanding" && !version.sources.some((source) => source.sourceType !== "manual")) return "理解知識需要至少一項可追溯的外部或閱讀來源";
  if (claim.type === "experience" && !version.supportingEvidence) return "經驗知識需要具體觀察或實作紀錄";
  if (claim.type === "procedure" && !version.supportingEvidence) return "方法知識需要使用紀錄；程序本身不等於成效已證實";
  return null;
}
