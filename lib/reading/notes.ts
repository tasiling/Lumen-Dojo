import type { ReadingNoteKind, ReadingNoteMetadata } from "./types";

export type StructuredReadingNoteInput = {
  kind: Exclude<ReadingNoteKind, "free">;
  text: string;
  metadata?: ReadingNoteMetadata;
};

const MARKERS: Record<Exclude<ReadingNoteKind, "free">, string> = {
  excerpt: "［行光閱讀：摘錄 v1］",
  thought: "［行光閱讀：想法 v1］",
  preview: "［行光閱讀：讀前 v1］",
  review: "［行光閱讀：讀後 v1］",
};

const SECTION_RE = /^---(.+?)---$/gm;
const INSIGHT_SOURCE_MARKER = "［行光閱讀：洞察來源 v1］";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readingNoteMetadataFromUnknown(value: unknown): ReadingNoteMetadata {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    source: clean(source.source),
    sourceBookTitle: clean(source.sourceBookTitle),
    chapter: clean(source.chapter),
    location: clean(source.location),
    reflection: clean(source.reflection),
    currentUnderstanding: clean(source.currentUnderstanding),
    verificationFocus: clean(source.verificationFocus),
    changedUnderstanding: clean(source.changedUnderstanding),
    openQuestion: clean(source.openQuestion),
    nextStep: clean(source.nextStep),
  };
}

function label(name: string, value: string | undefined): string[] {
  const text = clean(value);
  return text ? [`${name}：${text}`] : [];
}

function section(name: string, value: string | undefined): string[] {
  const text = clean(value);
  return text ? [`---${name}---`, text] : [];
}

export function serializeStructuredReadingNote(input: StructuredReadingNoteInput): string {
  const metadata = input.metadata ?? {};
  if (input.kind === "excerpt") {
    return [
      MARKERS.excerpt,
      ...label("來源", metadata.source || "Readmoo"),
      ...label("來源書名", metadata.sourceBookTitle),
      ...label("章節", metadata.chapter),
      ...label("位置", metadata.location),
      ...section("原文", input.text),
      ...section("我的想法", metadata.reflection),
    ].join("\n");
  }
  if (input.kind === "thought") {
    return [MARKERS.thought, ...section("內容", input.text)].join("\n");
  }
  if (input.kind === "preview") {
    return [
      MARKERS.preview,
      ...section("目前理解", metadata.currentUnderstanding || input.text),
      ...section("想確認", metadata.verificationFocus),
    ].join("\n");
  }
  return [
    MARKERS.review,
    ...section("理解改變", metadata.changedUnderstanding || input.text),
    ...section("仍想查證", metadata.openQuestion),
    ...section("接下來", metadata.nextStep),
  ].join("\n");
}

function parseSections(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const matches = [...text.matchAll(SECTION_RE)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const name = clean(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    result.set(name, text.slice(start, end).trim());
  }
  return result;
}

function readLabel(text: string, name: string): string {
  const line = text.split("\n").find((item) => item.startsWith(`${name}：`));
  return line ? line.slice(name.length + 1).trim() : "";
}

export function parseStoredReadingNote(text: string): {
  kind: ReadingNoteKind;
  text: string;
  metadata: ReadingNoteMetadata;
} {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const entry = (Object.entries(MARKERS) as [Exclude<ReadingNoteKind, "free">, string][])
    .find(([, marker]) => normalized.startsWith(marker));
  if (!entry) return { kind: "free", text: normalized, metadata: {} };

  const [kind] = entry;
  const sections = parseSections(normalized);
  if (kind === "excerpt") {
    return {
      kind,
      text: sections.get("原文") ?? "",
      metadata: {
        source: readLabel(normalized, "來源"),
        sourceBookTitle: readLabel(normalized, "來源書名"),
        chapter: readLabel(normalized, "章節"),
        location: readLabel(normalized, "位置"),
        reflection: sections.get("我的想法") ?? "",
      },
    };
  }
  if (kind === "thought") {
    return { kind, text: sections.get("內容") ?? "", metadata: {} };
  }
  if (kind === "preview") {
    const currentUnderstanding = sections.get("目前理解") ?? "";
    return {
      kind,
      text: currentUnderstanding,
      metadata: {
        currentUnderstanding,
        verificationFocus: sections.get("想確認") ?? "",
      },
    };
  }
  const changedUnderstanding = sections.get("理解改變") ?? "";
  return {
    kind,
    text: changedUnderstanding,
    metadata: {
      changedUnderstanding,
      openQuestion: sections.get("仍想查證") ?? "",
      nextStep: sections.get("接下來") ?? "",
    },
  };
}

export function isStructuredReadingNoteKind(value: unknown): value is Exclude<ReadingNoteKind, "free"> {
  return value === "excerpt" || value === "thought" || value === "preview" || value === "review";
}

export function serializeInsightSource(sourceNoteId: string, sourceText: string): string {
  return [
    INSIGHT_SOURCE_MARKER,
    ...label("來源筆記區塊", sourceNoteId),
    ...section("來源內容", sourceText),
  ].join("\n");
}

export function parseInsightSource(value: string): { sourceNoteId: string; sourceText: string } | null {
  if (!value.trim().startsWith(INSIGHT_SOURCE_MARKER)) return null;
  const sections = parseSections(value);
  return {
    sourceNoteId: readLabel(value, "來源筆記區塊"),
    sourceText: sections.get("來源內容") ?? "",
  };
}
