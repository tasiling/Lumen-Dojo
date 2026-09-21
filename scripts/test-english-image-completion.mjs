import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = mkdtempSync(join(tmpdir(), "lumen-english-image-completion-"));
execFileSync("npx", ["tsc", "--outDir", output, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022", "--esModuleInterop", "--skipLibCheck", "tests/english-image-completion.test.ts"], { stdio: "inherit" });
execFileSync("node", [join(output, "tests/english-image-completion.test.js")], { stdio: "inherit" });
