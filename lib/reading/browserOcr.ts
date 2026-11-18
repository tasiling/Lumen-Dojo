import type { ClipLayout } from "./clips";

type OcrWorker = {
  setParameters: (v: Record<string, string>) => Promise<unknown>;
  recognize: (i: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};
type Engine = {
  createWorker: (lang: string, oem: number, options: Record<string, unknown>) => Promise<OcrWorker>;
};
declare global {
  interface Window {
    Tesseract?: Engine;
  }
}
let script: Promise<Engine> | undefined;
async function engine(): Promise<Engine> {
  if (window.Tesseract) return window.Tesseract;
  if (!script)
    script = new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = "/reading-ocr/tesseract.min.js";
      tag.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(Error("文字辨識未載入")));
      tag.onerror = () => {
        tag.remove();
        reject(Error("文字辨識未載入"));
      };
      document.head.append(tag);
    });
  try {
    return await script;
  } catch (e) {
    script = undefined;
    throw e;
  }
}
export async function recognizeReadingImage(
  original: string,
  layout: ClipLayout,
  signal: AbortSignal,
  progress: (v: string) => void,
) {
  const T = await engine(),
    base = new URL("/reading-ocr/", window.location.origin).href;
  signal.throwIfAborted();
  const image = new Image();
  image.src = original;
  await image.decode();
  signal.throwIfAborted();
  const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("原圖無法讀取");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  let worker: OcrWorker | undefined;
  const dispose = () => {
    if (worker) {
      void worker.terminate().catch(() => {});
      worker = undefined;
    }
  };
  signal.addEventListener("abort", dispose, { once: true });
  try {
    worker = await new Promise<OcrWorker>((resolve, reject) => {
      T.createWorker(layout === "vertical" ? "chi_tra_vert" : "chi_tra", 1, {
        workerPath: base + "worker.min.js",
        corePath: base + "tesseract-core-lstm.wasm.js",
        langPath: base,
        workerBlobURL: false,
        errorHandler: reject,
        logger: (m: { status: string; progress: number }) => {
          if (!signal.aborted && m.status === "recognizing text")
            progress("正在辨識 " + Math.round(100 * m.progress) + "%");
        },
      }).then(resolve, reject);
    });
    signal.throwIfAborted();
    await worker.setParameters({
      tessedit_pageseg_mode: layout === "vertical" ? "5" : "3",
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(canvas);
    return {
      ...data,
      text: data.text
        .trim()
        .replace(
          /([\p{Script=Han}，。！？；：「」『』、（）《》〈〉])[ \t]+(?=[\p{Script=Han}，。！？；：「」『』、（）《》〈〉])/gu,
          "$1",
        ),
    };
  } finally {
    signal.removeEventListener("abort", dispose);
    dispose();
    canvas.width = canvas.height = 1;
  }
}
