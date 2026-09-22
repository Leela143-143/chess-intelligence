# License Inventory (Phase 0)

Audit of the reference project and of assets/dependencies planned for
**Chess Intelligence**. This file is the Phase-0 inventory; the product keeps its
own authoritative copy at `chess-intelligence/docs/licenses.md`, kept in sync.

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
- Any future piece set or board texture must be added here with
  `{ source, author, license, attribution, asset version }` before shipping
  (`public/assets/manifest.json`).

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
- [ ] Keep `public/assets/manifest.json` complete for every visual asset.
