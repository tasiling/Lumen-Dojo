import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function douyinInstallFile(origin: string, ticket: string): string {
  const scripts = join(process.cwd(), "lib", "dojo", "douyinMac");
  const files = {
    "media.py": readFileSync(join(scripts, "media.py"), "utf8"),
    "worker.py": readFileSync(join(scripts, "worker.py"), "utf8"),
  };
  const bundle = Buffer.from(JSON.stringify({ origin, ticket, files }), "utf8").toString("base64");
  const installer = readFileSync(join(scripts, "install.py"), "utf8").replace("__YECAI_INSTALL_BUNDLE__", bundle);
  return `#!/bin/bash\nset -eu\nexec /usr/bin/env python3 -u - <<'YECAI_INSTALL_END'\n${installer}\nYECAI_INSTALL_END\n`;
}
