# License Inventory

Authoritative licensing record for **Chess Intelligence**. Started as the
Phase-0 audit of the reference project and dependencies; kept current as assets
and dependencies are added (Phase 1 code, Phase 2 typefaces and visual system).

---

## 1. Reference project (study only — never redistributed)

| Component | License | Notes |
|---|---|---|
| stefan-kp/chess_tutor (source, docs, assets) | GPL-3.0 (+ proprietary mobile dual-license by holder) | Cloned to `/reference/chess_tutor` **for study only**. No code, prompts, text, branding, CSS, layouts or assets are copied into our work. |
| stockfish.js v10 (their dependency) | GPL-3.0 | Not used by us. |
| @google/generative-ai (their dependency) | Apache-2.0 | Not used by us (no cloud LLM). |
| Their opening collection | Derived from ragizaki/ChessOpeningsRecommender (see their credits) | Not reused; we use our own/licensed ECO data. |
| Their Lichess-derived puzzles | Unstated | Not reused. |

---

## 2. Planned dependencies for chess-intelligence

| Dependency | License | Purpose | Compliance notes |
|---|---|---|---|
| react, react-dom | MIT | UI | OK |
| typescript | Apache-2.0 | Build | OK (dev) |
| vite, @vitejs/plugin-react | MIT | Build | OK (dev) |
| chess.js | MIT | Rules: legal moves, SAN/UCI/PGN/FEN, outcomes | OK |
| dexie | Apache-2.0 | IndexedDB abstraction | OK |
| stockfish (npm, v19.x) | **GPL-3.0** | Authoritative engine (WASM, in Web Worker) | **Copyleft:** the web app distributing Stockfish WASM must be GPL-3.0-compatible. Our repo is licensed GPL-3.0-only. Stockfish source: https://github.com/official-stockfish/Stockfish — exact npm/ engine version recorded at build time in `docs/licenses.md` and the diagnostics screen. |
| eslint + typescript-eslint | MIT / Apache-2.0 | Lint (dev) | OK |
| vitest, jsdom, fake-indexeddb | MIT | Tests (dev) | OK |

### Local AI model (Phase 4)

| Asset | License | Compliance notes |
|---|---|---|
| Gemma 2B-class weights (e.g. `google/gemma-2-2b-it`, Q4/Q8 quantized for WebLLM/Transformers.js) | **Gemma Terms of Use** (Google, gates redistribution) | We **do not redistribute weights**. The app downloads the model from a model hub at first use, accepting the hub's/Google's terms on the user's behalf flow. Exact model id, quantization, hub source and size are recorded here and in the diagnostics screen when implemented. |
| WebLLM / Transformers.js runtime | Apache-2.0 | Model runtime; OK |

### Board & piece assets

- Phase 1 uses **original** inline SVG/typographic piece glyphs (our own drawings /
  Unicode chess glyphs) and CSS-generated board squares — **no third-party images,
  no hotlinking**.
- Phase 2 keeps that rule: all six board themes and all six piece sets are
  **generated from one original SVG geometry plus CSS custom properties**
  (`src/components/Piece.tsx`, `src/styles/tokens.css`). No binary image was
downloaded from any search engine or stock site. See `src/assets/README.md`.
- Any future piece set or board texture must be added here with
  `{ source, author, license, attribution, asset version }` before shipping
  (`public/assets/manifest.json`).

---

## 2b. Phase 2 — typefaces (redistributed binaries)

Three font files are self-hosted in `public/fonts/` (needed for an offline-first
PWA). Both families are SIL Open Font License 1.1, which permits redistribution
and web embedding, including in a GPL-3.0 work.

| File | Family / style | Copyright holder | License | Source |
|---|---|---|---|---|
| `instrument-serif-latin.woff2` | Instrument Serif 400 | Copyright 2022 The Instrument Serif Project Authors | **SIL OFL 1.1** | https://github.com/Instrument/instrument-serif |
| `instrument-serif-italic-latin.woff2` | Instrument Serif 400 Italic | Copyright 2022 The Instrument Serif Project Authors | **SIL OFL 1.1** | https://github.com/Instrument/instrument-serif |
| `inter-latin-var.woff2` | Inter Variable 100–900 | Copyright 2016 The Inter Project Authors | **SIL OFL 1.1** | https://github.com/rsms/inter |

- License text: `public/fonts/OFL.txt` (SIL OFL 1.1).
- Per-file attribution: `public/fonts/README.md`.
- Both files are the upstream **latin subsets**, unmodified (no renaming, no
  re-subsetting, no modification of glyph outlines). Redistribution permitted;
  no Reserved Font Name conflict because nothing is modified.
- Attribution shown to the user: the Diagnostics screen lists the type faces and
  their licenses (`#/diagnostics`).

---

## 2c. Phase 2 — motion, 3D and visual effects

| Technology | License | Where | Redistribution |
|---|---|---|---|
| CSS transitions/animations + Web Animations | — (platform) | all motion | n/a |
| SVG (inline paths, gradients, filters) | — (platform) | pieces, evaluation graph, radar, arrows | n/a |
| IntersectionObserver / rAF ambient layer | — (platform) | `src/components/ambient.tsx` | n/a |
| No GSAP / Framer Motion / Three.js | — | deliberately not added | No animation dependency was added: the motion system is CSS + SVG + rAF, so there is no extra license surface and no extra payload (brief §50). |

---

## 2d. Phase 2 — no scraped assets, verified

- `git grep -nE "https?://.*\.(png|jpe?g|gif|webp|svg)"` returns nothing: no remote
  image is referenced from code or CSS.
- Board themes and piece sets are computed from tokens, so a new theme adds zero
  bytes and zero licensing risk.
- The only binary assets in the repository are the Stockfish WASM build (GPL-3.0,
  §2) and the three OFL font files (§2b).

### Opening data / puzzle data

- Phase 1 ships no third-party opening or puzzle dataset. Opening detection starts
  with a small original ECO index (common main lines written from published theory,
  FEN/SAN sequences are facts, not copyrightable expression) — expansion must use a
  properly licensed dataset (e.g. CC0/PD sources), recorded here with
  source/license/version/attribution.
- Training puzzles are **generated from the user's own games** (Phase 7), plus any
  future PD/licensed datasets recorded here.

### npm dependency tree

- Full transitive inventory: `npm ls --all` output archived per release; advisories
  checked with `npm audit`.

---

## 3. Obligations checklist

- [x] Repo licensed GPL-3.0-only (required because of Stockfish).
- [x] `LICENSE` file present in product repo.
- [x] README credits Stockfish with version + source link.
- [ ] Record exact `stockfish` npm version resolved at build (done automatically in
      diagnostics screen / `src/lib/engine/stockfishVersion.ts`).
- [ ] Phase 4: record Gemma model id/quantization/hub; no weight redistribution.
- [x] Typefaces: OFL-1.1 files shipped with license text and attribution (§2b).
- [x] No scraped/stock imagery, no hotlinked assets (§2d).
- [ ] Keep `public/assets/manifest.json` complete for every visual asset.
