export type ParsedReadmooShare = {
  excerpt: string;
  bookTitle: string;
  isReadmoo: boolean;
};

export function parseReadmooShare(value: string): ParsedReadmooShare {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  const titleMatch = normalized.match(/(?:^|\n)\s*[-—–－]{1,3}\s*《([^》]+)》\s*(?:\n|$)/);
  const bookTitle = titleMatch?.[1]?.trim() ?? "";
  const markerIndex = titleMatch?.index ?? -1;
  const withoutAttribution = normalized
    .replace(/^\s*Readmoo\s*讀墨電子書\s*$/gim, "")
    .trim();
  const excerpt = markerIndex >= 0
    ? normalized.slice(0, markerIndex).trim()
    : withoutAttribution;

  return {
    excerpt,
    bookTitle,
    isReadmoo: Boolean(titleMatch || /Readmoo\s*讀墨電子書/i.test(normalized)),
  };
}
