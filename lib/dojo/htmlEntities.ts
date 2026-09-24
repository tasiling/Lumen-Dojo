const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  lt: "<",
  mdash: "—",
  nbsp: "\u00a0",
  ndash: "–",
  quot: '"',
};

export const HTML_ENTITY_MAX_DECODE_PASSES = 3;

function unicodeScalar(codePoint: number): string | null {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return null;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntityPass(value: string): string {
  return value.replace(
    /&#(?:x([0-9a-f]+)|(\d+));|&([a-z][a-z0-9]+);/giu,
    (entity, hexadecimal: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (named) return NAMED_HTML_ENTITIES[named.toLowerCase()] ?? entity;
      const numeric = hexadecimal ?? decimal;
      if (!numeric) return entity;
      const codePoint = Number.parseInt(numeric, hexadecimal ? 16 : 10);
      return unicodeScalar(codePoint) ?? entity;
    },
  );
}

/**
 * Decodes external metadata as text without parsing or executing HTML.
 * Multiple passes handle nested encodings such as &amp;#x5f35;, while the fixed
 * pass limit prevents malformed input from causing an unbounded loop.
 */
export function decodeHtmlEntities(
  value: string,
  maxPasses = HTML_ENTITY_MAX_DECODE_PASSES,
): string {
  let decoded = value;
  const passes = Math.max(0, Math.min(HTML_ENTITY_MAX_DECODE_PASSES, Math.floor(maxPasses)));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = decodeHtmlEntityPass(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export function normalizeExternalPreviewText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/gu, " ").trim();
}

export function extractExternalMetaContent(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const found = html.match(pattern)?.[1];
      if (found) return normalizeExternalPreviewText(found);
    }
  }
  return "";
}
