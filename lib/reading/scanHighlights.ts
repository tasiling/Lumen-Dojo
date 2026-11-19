import { engine } from "./browserOcr";
import { originalHref, type ClipLayout, type ClipPage } from "./clips";
import { detectRegions, groupFragments, type Fragment } from "./highlights";

export async function scanHighlights(
  pages: ClipPage[],
  layout: ClipLayout,
  signal: AbortSignal,
  status: (s: string) => void,
) {
  const api = await engine(),
    base = new URL("/reading-ocr/", location.origin).href;
  signal.throwIfAborted();
  const worker = await api.createWorker(layout === "vertical" ? "chi_tra_vert" : "chi_tra", 1, {
    workerPath: base + "worker.min.js",
    corePath: base + "tesseract-core-lstm.wasm.js",
    langPath: base,
    workerBlobURL: false,
  });
  const parts: Fragment[] = [];
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: layout === "vertical" ? "5" : "7",
      user_defined_dpi: "300",
    });
    for (const [page, p] of pages.entries()) {
      signal.throwIfAborted();
      status("核對色筆範圍 · 第 " + (page + 1) + "／" + pages.length + " 張");
      const photo = new Image();
      photo.src = originalHref(p.id);
      await photo.decode();
      const scale = Math.min(1, 600 / photo.naturalWidth, 1100 / photo.naturalHeight);
      const sample = document.createElement("canvas");
      sample.width = Math.round(photo.naturalWidth * scale);
      sample.height = Math.round(photo.naturalHeight * scale);
      const ctx = sample.getContext("2d")!;
      ctx.drawImage(photo, 0, 0, sample.width, sample.height);
      const width = sample.width,
        height = sample.height;
      const regions = detectRegions(ctx.getImageData(0, 0, width, height).data, width, height, layout);
      for (const r of regions) {
        signal.throwIfAborted();
        const crop = document.createElement("canvas"),
          sx = (r.x * photo.naturalWidth) / width,
          sy = (r.y * photo.naturalHeight) / height;
        const sw = (r.w * photo.naturalWidth) / width,
          sh = (r.h * photo.naturalHeight) / height;
        crop.width = Math.ceil(sw) + 16;
        crop.height = Math.ceil(sh) + 16;
        const ink = crop.getContext("2d")!;
        ink.fillStyle = "#fff";
        ink.fillRect(0, 0, crop.width, crop.height);
        ink.drawImage(photo, sx, sy, sw, sh, 8, 8, sw, sh);
        const { data } = await worker.recognize(crop);
        parts.push({
          ...r,
          page,
          pageId: p.id,
          width,
          height,
          text: data.text
            .trim()
            .replace(/\s*\n\s*/g, "")
            .replace(/([\p{Script=Han}，。！？、])[ \t]+(?=[\p{Script=Han}，。！？、])/gu, "$1"),
        });
        crop.width = crop.height = 1;
      }
      sample.width = sample.height = 1;
    }
    return groupFragments(parts, layout);
  } finally {
    await worker.terminate();
  }
}
