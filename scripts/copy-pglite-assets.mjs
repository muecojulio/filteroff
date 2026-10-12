import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Nitro traces the JS but not PGLite's sibling wasm/data. Preview and Vercel
 * both resolve `new URL("./pglite.data", import.meta.url)` next to the bundled
 * module, so those three files must sit in the server function libs. */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const dest = join(root, ".vercel/output/functions/__server.func/_libs");

if (!existsSync(dest)) {
  console.warn("[pglite] server function libs missing; skip");
  process.exit(0);
}

for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  const from = join(srcDir, name);
  if (!existsSync(from)) {
    console.error(`[pglite] missing ${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(dest, name));
}

console.log("[pglite] copied wasm assets into the server function");
