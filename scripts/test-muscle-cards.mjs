import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const output = mkdtempSync(join(tmpdir(), "lumen-muscle-cards-"));
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "--outDir",
      output,
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--target",
      "es2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "tests/muscle-cards.test.ts",
    ],
    { stdio: "inherit" },
  );
  execFileSync("node", [join(output, "tests/muscle-cards.test.js")], {
    stdio: "inherit",
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
