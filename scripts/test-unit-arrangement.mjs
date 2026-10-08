import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = mkdtempSync(join(tmpdir(), "lumen-unit-arrangement-"));
execFileSync("npx", ["tsc", "--outDir", output, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "tests/unit-arrangement.test.ts"], { stdio: "inherit" });
execFileSync("node", [join(output, "tests/unit-arrangement.test.js")], { stdio: "inherit" });
