/**
 * Engine build info — surfaced in docs, README and the diagnostics screen.
 */
export const ENGINE_BUILD = {
  npmPackage: "stockfish",
  packageVersion: "19.0.0",
  buildVersion: "19",
  /** Variant copied to /public/stockfish (see scripts/copy-stockfish.mjs). */
  variant: "lite-single",
  workerPath: "/stockfish/stockfish-19-lite-single.js",
  /** Upstream engine source (GPL-3.0). */
  source: "https://github.com/official-stockish/Stockfish",
  license: "GPL-3.0-only",
} as const;
