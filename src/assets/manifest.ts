/**
 * Asset + licence manifest (brief §51, §52).
 *
 * Every asset that ships with the product is listed here with its source,
 * author, licence, attribution duty and whether redistribution is permitted.
 * The Diagnostics screen renders this list, so attribution is visible inside
 * the product rather than only in a repository file.
 *
 * Rule: nothing is added to this app from a search engine, a stock site or a
 * hotlink. Binary assets are limited to the Stockfish WASM build and three
 * OFL typefaces; every board theme and piece set is generated in code.
 */

export type AssetKind = "typeface" | "engine" | "procedural" | "icon";

export type AssetEntry = {
  id: string;
  kind: AssetKind;
  label: string;
  /** Where it came from. */
  source: string;
  author: string;
  /** SPDX-style identifier where one exists. */
  license: string;
  /** What we must do to comply. */
  attribution: string;
  redistribution: "permitted" | "prohibited" | "not applicable";
  /** Where it lives in this repository. */
  path?: string;
};

export const ASSET_MANIFEST: AssetEntry[] = [
  {
    id: "font-instrument-serif",
    kind: "typeface",
    label: "Instrument Serif 400 + Italic (latin subset)",
    source: "https://github.com/Instrument/instrument-serif",
    author: "The Instrument Serif Project Authors (2022)",
    license: "SIL OFL 1.1",
    attribution: "Ship the OFL text and this notice with the font; no renaming (files are unmodified).",
    redistribution: "permitted",
    path: "public/fonts/instrument-serif-latin.woff2",
  },
  {
    id: "font-inter",
    kind: "typeface",
    label: "Inter Variable 100–900 (latin subset)",
    source: "https://github.com/rsms/inter",
    author: "The Inter Project Authors (2016)",
    license: "SIL OFL 1.1",
    attribution: "Ship the OFL text and this notice with the font; no renaming (file is unmodified).",
    redistribution: "permitted",
    path: "public/fonts/inter-latin-var.woff2",
  },
  {
    id: "engine-stockfish",
    kind: "engine",
    label: "Stockfish 19 (lite-single WASM, NNUE embedded)",
    source: "https://github.com/official-stockfish/Stockfish",
    author: "The Stockfish developers (see AUTHORS)",
    license: "GPL-3.0-or-later",
    attribution: "The whole application is distributed under GPL-3.0; source is offered in this repository.",
    redistribution: "permitted",
    path: "public/stockfish/",
  },
  {
    id: "geometry-pieces",
    kind: "procedural",
    label: "Chess piece geometry — six sets from one original SVG path set",
    source: "Original work created for this project",
    author: "Chess Intelligence",
    license: "GPL-3.0-only (same as the project)",
    attribution: "None required.",
    redistribution: "not applicable",
    path: "src/components/Piece.tsx",
  },
  {
    id: "themes-boards",
    kind: "procedural",
    label: "Board themes (Obsidian, Ivory, Slate, Walnut, Paper, Carbon) — CSS token sets",
    source: "Original work created for this project",
    author: "Chess Intelligence",
    license: "GPL-3.0-only (same as the project)",
    attribution: "None required — themes are computed, so they add no bytes.",
    redistribution: "not applicable",
    path: "src/styles/tokens.css",
  },
  {
    id: "fx-ambient",
    kind: "procedural",
    label: "Ambient background, contextual cursor, scroll reveal",
    source: "Original work created for this project (CSS + SVG + requestAnimationFrame)",
    author: "Chess Intelligence",
    license: "GPL-3.0-only (same as the project)",
    attribution: "None required. No WebGL/Three.js dependency.",
    redistribution: "not applicable",
    path: "src/components/ambient.tsx",
  },
  {
    id: "icons-app",
    kind: "icon",
    label: "App icons and maskable icon",
    source: "Original work created for this project",
    author: "Chess Intelligence",
    license: "GPL-3.0-only (same as the project)",
    attribution: "None required.",
    redistribution: "not applicable",
    path: "public/icons/",
  },
];

/** Distinct licences in use, for the diagnostics readout. */
export function licenseSummary(): Array<{ license: string; count: number }> {
  const counts = new Map<string, number>();
  for (const asset of ASSET_MANIFEST) {
    counts.set(asset.license, (counts.get(asset.license) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([license, count]) => ({ license, count }))
    .sort((a, b) => b.count - a.count || a.license.localeCompare(b.license));
}
