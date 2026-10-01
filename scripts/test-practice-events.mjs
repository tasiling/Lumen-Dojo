import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "r2-3-records-"));
try {
  execFileSync("node_modules/.bin/tsc", ["--outDir", dir, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "tests/practice-events.test.ts"], { stdio: "inherit", timeout: 60000 });
  execFileSync("node", [join(dir, "tests/practice-events.test.js")], { stdio: "inherit", timeout: 30000 });
} finally { rmSync(dir, { recursive: true, force: true }); }
