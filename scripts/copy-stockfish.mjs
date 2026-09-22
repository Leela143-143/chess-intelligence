/**
 * Copy the Stockfish engine build into public/ so it can be served as a
 * standalone Web Worker script.
 *
 * Default variant: `lite-single`
 *   - single-threaded (no COOP/COEP / SharedArrayBuffer requirements)
 *   - ~1.7 MB wasm with embedded NNUE net
 *   - fast startup, low memory — right default for mobile-first PWA
 *
 * Override with SF_VARIANT=full-single (99 MB wasm, strongest) etc.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "node_modules", "stockfish", "bin");
const outDir = path.join(root, "public", "stockfish");

const variant = process.env.SF_VARIANT ?? "lite-single";
const base = `stockfish-19-${variant}`;
const files = [`${base}.js`, `${base}.wasm`];

if (!existsSync(srcDir)) {
  console.error("stockfish package not installed — run npm install first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const manifest = {
  package: "stockfish@19.0.0",
  buildVersion: "19",
  variant,
  copiedAt: new Date().toISOString(),
  files: [],
};

for (const file of files) {
  const from = path.join(srcDir, file);
  const to = path.join(outDir, file);
  if (!existsSync(from)) {
    if (file.endsWith(".wasm")) {
      console.warn(`[copy-stockfish] ${file} not found (asm build?) — skipping.`);
      continue;
    }
    console.error(`[copy-stockfish] required file missing: ${file}`);
    process.exit(1);
  }
  copyFileSync(from, to);
  manifest.files.push({ name: file, bytes: statSync(to).size });
  console.log(`[copy-stockfish] ${file} -> public/stockfish/ (${manifest.files.at(-1).bytes} bytes)`);
}

writeFileSync(path.join(outDir, "build.json"), JSON.stringify(manifest, null, 2));
