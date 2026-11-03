import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

export const require = createRequire(import.meta.url);

// Compile the actual TS modules, replacing only framework/DB boundaries (same approach
// as tests/security.test.mjs). Components (.tsx) compile with the React JSX runtime, so a test can
// render them with react-dom/server.
export function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = { exports: {} };
  cache.set(filename, compiled);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "server-only") return {};
    if (id.startsWith("@/")) return load(existsSync(`${id.slice(2)}.tsx`) ? `${id.slice(2)}.tsx` : `${id.slice(2)}.ts`, mocks, cache);
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
