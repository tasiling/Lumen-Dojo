import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { originalTool } from './catalog';

export async function originalDocument(id: string) {
  if (!originalTool(id)) throw new Error('找不到這個工具');
  const root = path.join(process.cwd(), 'lib/liaojieTools');
  const [html, bridge] = await Promise.all([
    readFile(path.join(root, 'originals', `${id}.html`), 'utf8'),
    readFile(path.join(root, 'frame-bridge.js'), 'utf8'),
  ]);
  // Executable originals remain private; no public static source route is added.
  return { html, bridge };
}
