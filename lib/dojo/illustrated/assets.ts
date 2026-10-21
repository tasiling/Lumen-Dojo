import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import sharp from 'sharp';
import { WeavingError } from '../weavingWorkflow/model';
import { assetId } from './model';
export type AssetInfo = { id: string; mime: string; width: number; height: number };
function directory() { const root = process.env.LEARNING_WRITE_LOCK_DIR; if (!root || !isAbsolute(root)) throw new WeavingError('圖片保存尚未啟用：需要持久保存目錄', 503); return join(root, 'illustrated-assets'); }
async function inspect(bytes: Buffer): Promise<Omit<AssetInfo, 'id'>> {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new WeavingError('圖片大小須在 8 MiB 以內', 413);
  try { const info = await sharp(bytes, { limitInputPixels: 8192 * 8192 }).metadata();
    if (!['png','jpeg','webp'].includes(info.format ?? '') || !info.width || !info.height || info.width > 8192 || info.height > 8192 || (info.pages ?? 1) > 1) throw new Error('format');
    await sharp(bytes, { limitInputPixels: 8192 * 8192 }).stats();
    return { mime: `image/${info.format}`, width: info.width, height: info.height };
  } catch { throw new WeavingError('圖片必須是有效的單張 PNG、JPEG 或 WebP'); }
}
export async function saveAsset(bytes: Buffer): Promise<AssetInfo> {
  const dir = directory(), info = await inspect(bytes), id = createHash('sha256').update(bytes).digest('hex');
  await mkdir(dir, { recursive: true });
  try { const handle = await open(join(dir, `${id}.bin`), 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; const old = await readFile(join(dir, `${id}.bin`)); if (!old.equals(bytes)) throw new WeavingError('圖片保存內容不符', 409); }
  return { id, ...info };
}
export async function readAsset(id: string) {
  assetId(id); const dir = directory(); let bytes: Buffer;
  try { bytes = await readFile(join(dir, `${id}.bin`)); } catch { throw new WeavingError('找不到已保存的圖片', 404); }
  if (createHash('sha256').update(bytes).digest('hex') !== id) throw new WeavingError('圖片內容核對失敗', 409);
  return { id, ...await inspect(bytes), bytes };
}
