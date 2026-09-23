# Assets

Brief §51/§52 require an `/assets` directory with boards, pieces, textures,
icons, illustrations and backgrounds — **all documented, none scraped**.

This app deliberately ships almost no binary art. The visual system is
*generated*, which means it stays sharp at any size, adds almost nothing to the
bundle, and carries no licensing risk. What exists here is the **manifest** that
proves it.

| Folder | Contents | Licence |
|---|---|---|
| `src/assets/manifest.ts` | Typed inventory of every shipped asset: source, author, licence, attribution duty, redistribution permission. Rendered on `#/diagnostics`. | GPL-3.0-only |
| `src/components/Piece.tsx` | Six piece sets drawn as original SVG geometry, themed by CSS custom properties. | GPL-3.0-only |
| `src/styles/tokens.css` | Six board themes + six piece themes as token sets (`--sq-*`, `--pc-*`, `--board-*`). | GPL-3.0-only |
| `src/components/ambient.tsx` | Ambient background, contextual cursor, scroll reveal (CSS + SVG + rAF). | GPL-3.0-only |
| `public/fonts/` | Three OFL typefaces (Instrument Serif regular/italic, Inter Variable). | SIL OFL 1.1 |
| `public/icons/` | PWA app icon + maskable icon (original SVG). | GPL-3.0-only |
| `public/stockfish/` | Stockfish 19 lite-single WASM + NNUE (copied at build time). | GPL-3.0-or-later |

## Policy for new assets

1. **Never** download art from a search engine, stock site or CDN and commit it.
2. Prefer generating the visual from geometry and tokens: a new board theme or
   piece set should be a token block, not a folder of PNGs.
3. If a real binary asset is unavoidable, it must have a documented
   `{ source, author, licence, attribution, version, redistribution }` entry in
   `manifest.ts` **before** it is referenced from code, and its licence must be
   compatible with GPL-3.0-only distribution.
4. Third-party licences in use today: `SIL OFL 1.1` (fonts), `GPL-3.0-or-later`
   (Stockfish). See `docs/licenses.md`.

## Boards and pieces

- **Board themes:** Obsidian, Ivory, Slate, Walnut, Paper, Carbon.
- **Piece sets:** Classic, Tournament, Editorial, Minimal, Sculptural, Technical.
- A theme/piece change is instant and adds zero bytes: board squares, frame,
  grain and every piece read their colour, gradient, stroke and depth from
  tokens (`--board-frame`, `--board-grain`, `--sq-light`, `--sq-dark`,
  `--pc-w-fill`, `--pc-b-hi`, `--pc-drop`, …).
