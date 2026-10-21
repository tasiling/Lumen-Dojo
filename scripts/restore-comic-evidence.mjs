// Restore the exact browser-exported JSON from bounded repository evidence chunks.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=join(dirname(fileURLToPath(import.meta.url)),'../docs/creative-comic-evidence');
const manifest=JSON.parse(await readFile(join(dir,'source-package-manifest.json'),'utf8'));
if(manifest.schema!==1||manifest.encoding!=='gzip'||!Array.isArray(manifest.parts)||manifest.parts.some(p=>!/^source-package\.gz\.part-\d{3}$/.test(p)))throw Error('Invalid comic evidence manifest');
const bytes=gunzipSync(Buffer.concat(await Promise.all(manifest.parts.map(p=>readFile(join(dir,p))))));
if(bytes.length!==manifest.bytes||createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Comic source package checksum mismatch');
JSON.parse(bytes.toString('utf8'));await writeFile(join(dir,'ui-source.json'),bytes);
console.log(`Restored exact comic source JSON (${bytes.length} bytes; SHA-256 verified)`);
