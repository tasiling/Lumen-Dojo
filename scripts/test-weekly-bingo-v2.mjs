import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = mkdtempSync(join(tmpdir(), "lumen-weekly-v2-"));
execFileSync("npx", ["tsc", "--outDir", output, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "tests/weekly-bingo-v2.test.ts"], { stdio: "inherit" });
execFileSync("node", [join(output, "tests/weekly-bingo-v2.test.js")], { stdio: "inherit" });
