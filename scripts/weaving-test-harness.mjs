import { createRequire, Module } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function loader(stubs = {}) {
  const cache = new Map();
  function load(path) {
    const file = resolve(path);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file); cache.set(file, mod); mod.filename = file;
    mod.require = name => {
      if (name in stubs) return typeof stubs[name] === 'function' ? stubs[name]() : stubs[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(file), name);
        const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(p => existsSync(p) && /\.(ts|tsx|mjs|js)$/.test(p));
        if (!target) throw Error(`Missing module ${name} from ${file}`);
        return load(target);
      }
      return require(name);
    };
    mod._compile(ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
    return mod.exports;
  }
  return load;
}
