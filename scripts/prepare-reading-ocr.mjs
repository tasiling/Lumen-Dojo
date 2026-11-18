import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../", import.meta.url));
const target = join(project, "public", "reading-ocr");
await mkdir(target, { recursive: true });
const dependencies = [
  ...["tesseract.min.js", "worker.min.js", "tesseract.min.js.LICENSE.txt", "worker.min.js.LICENSE.txt"].map(
    (file) => ["tesseract.js/dist/" + file, file],
  ),
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js/LICENSE.md", "LICENSE.txt"],
  ["tesseract.js-core/LICENSE", "core-LICENSE.txt"],
  ...["chi_tra", "chi_tra_vert"].map((lang) => [
    "@tesseract.js-data/" + lang + "/4.0.0_best_int/" + lang + ".traineddata.gz",
    lang + ".traineddata.gz",
  ]),
];
await Promise.all(
  dependencies.map(([source, name]) => copyFile(join(project, "node_modules", source), join(target, name))),
);

await writeFile(
  join(target, "NOTICE.txt"),
  [
    "Tesseract.js and its WebAssembly core: https://github.com/naptha/tesseract.js and https://github.com/naptha/tesseract.js-core",
    "Traditional Chinese horizontal and vertical traineddata: https://github.com/naptha/tessdata",
    "See the accompanying license files and distribution notices.",
  ].join("\n") + "\n",
);
