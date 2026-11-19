import type { ClipLayout } from "./clips";

export const colors = ["黃色", "綠色", "藍色", "粉紅色", "紫色", "橘色"] as const;
export type Ink = (typeof colors)[number];
export type Region = { x: number; y: number; w: number; h: number; color: Ink };
export type Fragment = Region & { pageId: string; page: number; width: number; height: number; text: string };
export type Selection = { parts: Fragment[]; text: string };
export const regionKey = (r: Region & { pageId: string }) => [r.pageId, r.x, r.y, r.w, r.h].join(":");

function pigment(r: number, g: number, b: number) {
  const lo = Math.min(r, g, b),
    hi = Math.max(r, g, b);
  if (lo < 125 || hi < 190 || hi - lo < 16) return -1;
  if (g - r > 8 && g - b > 10) return 1;
  if (b - g > 11 && r > g + 3) return 4;
  if (b - r > 10 && b >= g - 4) return 2;
  if (r - g > 10 && b > g + 4) return 3;
  if (r - b > 14 && g - b > 8) return r - g > 18 ? 5 : 0;
  return -1;
}
function runs(active: boolean[], gap: number, min: number): [number, number][] {
  const spans: [number, number][] = [];
  let first = -1,
    last = -1;
  for (let i = 0; i <= active.length; i++) {
    if (active[i]) {
      if (first < 0) first = i;
      last = i;
    } else if (first >= 0 && (i - last > gap || i === active.length)) {
      if (last - first + 1 >= min) spans.push([first, last + 1]);
      first = -1;
    }
  }
  return spans;
}
// Identify tinted strips carrying printed ink. Neutral text, the page number and solid bookmark icons do not form excerpts.
export function detectRegions(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  layout: ClipLayout,
): Region[] {
  const vertical = layout === "vertical",
    across = vertical ? width : height,
    along = vertical ? height : width;
  const mask = new Int8Array(width * height);
  const idx = (line: number, pos: number) => (vertical ? pos * width + line : line * width + pos);
  const projection = new Uint16Array(across);
  for (let line = 0; line < across; line++)
    for (let pos = 0; pos < along; pos++) {
      const i = idx(line, pos),
        k = 4 * i;
      mask[i] = pigment(pixels[k], pixels[k + 1], pixels[k + 2]);
      if (mask[i] >= 0) projection[line]++;
    }
  const regions: Region[] = [];
  const lanes = runs(
    Array.from(projection, (v) => v >= Math.max(4, along * 0.006)),
    1,
    3,
  );
  for (const [l, r] of lanes) {
    const thickness = r - l;
    if (thickness > across * 0.2) continue;
    for (let c = 0; c < colors.length; c++) {
      const active = Array.from({ length: along }, (_, p) => {
        let count = 0;
        for (let a = l; a < r; a++) if (mask[idx(a, p)] === c) count++;
        return count >= Math.max(2, thickness * 0.16);
      });
      for (const [a, b] of runs(
        active,
        Math.max(1, Math.round(thickness * 0.13)),
        Math.max(4, thickness * 0.43),
      )) {
        let dark = 0;
        for (let t = l; t < r; t++) for (let p = a; p < b; p++) if (pixels[4 * idx(t, p)] < 100) dark++;
        if (dark < (r - l) * (b - a) * 0.018) continue;
        regions.push({
          x: vertical ? l : a,
          y: vertical ? a : l,
          w: vertical ? thickness : b - a,
          h: vertical ? b - a : thickness,
          color: colors[c],
        });
      }
    }
  }
  return regions.sort((a, b) => (vertical ? b.x - a.x || a.y - b.y : a.y - b.y || a.x - b.x));
}

export function groupFragments(parts: Fragment[], layout: ClipLayout): Selection[] {
  const result: Selection[] = [];
  const v = layout === "vertical";
  for (const part of parts) {
    const group = result.at(-1),
      prev = group?.parts.at(-1);
    if (prev && group && part.color === prev.color) {
      const end = v ? (prev.y + prev.h) / prev.height : (prev.x + prev.w) / prev.width;
      const start = v ? part.y / part.height : part.x / part.width;
      const laneDistance = v ? prev.x - part.x : part.y - prev.y;
      const nearby =
        part.page === prev.page && laneDistance > 0 && laneDistance < 3.5 * (v ? prev.w : prev.h);
      const adjacent =
        part.page === prev.page + 1 &&
        !/[。！？…][」』）]?$/u.test(prev.text.trim()) &&
        (v
          ? prev.x / prev.width < 0.24 && (part.x + part.w) / part.width > 0.76
          : (prev.y + prev.h) / prev.height > 0.76 && part.y / part.height < 0.24);
      if ((nearby || adjacent) && end > 0.76 && start < 0.26) {
        group.parts.push(part);
        group.text += part.text;
        continue;
      }
    }
    result.push({ parts: [part], text: part.text });
  }
  return result;
}
