import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { originalTool, type ToolRealm } from './catalog';

export async function originalDocument(id: string, realm: ToolRealm = 'liaojie') {
  if (!originalTool(id)) throw new Error('找不到這個工具');
  const root = path.join(process.cwd(), 'lib/liaojieTools');
  const [html, bridge, theme] = await Promise.all([
    readFile(path.join(root, 'originals', `${id}.html`), 'utf8'),
    readFile(path.join(root, 'frame-bridge.js'), 'utf8'),
    readFile(path.join(root, 'field-theme.css'), 'utf8'),
  ]);
  // Executable originals remain private; no public static source route is added.
  const realmTheme = realm === 'weaving' ? ':root{--bg:#FCF5FB;--surface-2:#F8E7F4;--muted:#58677C;--sub:#58677C;--line:#EBDDEC;--border:#EBDDEC;--accent:#8B3F68;--primary:#8B3F68;--primary-hover:#713254;--gold:#8B3F68;--green:#8B3F68;--green-dark:#713254;--green-soft:#F8E7F4;--cream:#F8E7F4;}' : '';
  return { html: html.replace('</head>', `<style>${theme}${realmTheme}</style></head>`), bridge };
}
