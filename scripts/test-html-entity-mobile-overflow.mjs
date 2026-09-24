import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = mkdtempSync(join(tmpdir(), "lumen-html-entity-overflow-"));
execFileSync("npx", ["tsc", "--outDir", output, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "tests/html-entity-mobile-overflow.test.ts"], { stdio: "inherit" });
execFileSync("node", [join(output, "tests/html-entity-mobile-overflow.test.js")], { stdio: "inherit" });
