# Chess Intelligence

**Understand your chess. Improve deliberately.**

A browser-first, mobile-first, **local-private** chess intelligence and coaching
platform. Stockfish calculates, deterministic analytics interpret, local Gemma
explains — and your games never leave your device.

```
                USER
                  │
                  ▼
           CHESS INTELLIGENCE
                  │
      ┌───────────┼───────────┐
      │           │           │
      ▼           ▼           ▼
  STOCKFISH    ANALYTICS    PLAYER MODEL
      │           │           │
      └───────────┼───────────┘
                  ▼
             LOCAL GEMMA
                  │
                  ▼
             AI COACH
                  │
                  ▼
          TRAINING ENGINE
                  │
                  ▼
              IMPROVEMENT
```

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Script | Purpose |
|---|---|
| `npm run build` | copy engine assets + typecheck + production build |
| `npm test` | unit/integration tests (vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run copy:engine` | copy Stockfish WASM into `public/stockfish/` |
| `npm run preview` | serve the production build |

## What's inside (Phase 0–1 complete)

- **PWA shell** — installable, offline cache (`sw.js`), app icons, standalone display
- **Interactive chessboard** — tap + drag, promotion chooser, orientation, last-move/check
  highlights, legal-move dots, keyboard-operable labelled squares, 3 board themes,
  3 piece sets (original/typographic assets, no third-party images)
- **Local game database** — Dexie/IndexedDB: games, analyses, profile, settings,
  training, coach history; **fingerprint dedupe** on import
- **PGN/FEN import** — paste, file picker, drag-and-drop, bulk files, size caps,
  control-character sanitizing, multi-game split
- **Stockfish 19 (WASM)** — npm `stockfish@19.0.0` build in a Web Worker behind a
  `ChessEngine` interface; never blocks the UI thread
- **EngineScheduler** — priority queue (current position → user selection → game review →
  background), pooled workers sized per device, cancellation, page-visibility pausing,
  battery/profile gating, engine↔coach CPU coordination hook
- **Structured AI coach** — `CoachContext` (engine facts) → Local Gemma (Phase 4) →
  **response validation** that strips unsupported eval/move/stat claims → honest source
  badge; deterministic rule-based fallback when no model runs (**no fake AI, no cloud**)
- **Move classification** — documented thresholds: best/excellent/good/book/inaccuracy/
  mistake/blunder/missed-opportunity/forced
- **Deterministic tactics** — fork, double-attack, pin, skewer, discovered-check,
  double-check, hanging-piece, mate-in-one, back-rank-mate
- **Opening detection** — original ECO index (70+ main lines), longest-prefix matching
- **Command palette** — Ctrl/Cmd+K
- **Settings & themes** — Dark/Light/OLED/High-contrast, board & pieces independent,
  analysis intensity, background-analysis toggle, full JSON backup export/import
- **Hidden diagnostics** — `#/diagnostics` or command palette: engine stats, device
  class, WebGPU, storage, caches, model state
- **Device profiles** — Ultra Low/Low/Balanced/High/Desktop detection driving worker
  count and model-profile selection

## Roadmap (per development phases)

| Phase | Scope | Status |
|---|---|---|
| 0 | Reference study, license audit, architecture | ✅ |
| 1 | PWA shell, board, PGN/FEN, local DB, Stockfish WASM | ✅ |
| 2 | Two-stage game analysis, eval graph, critical moments | ⏳ |
| 3 | Statistics, opening intelligence, tactical training data, player profile | ⏳ |
| 4 | Gemma local inference, model profiles, download + cache, coach UI streaming | ⏳ |
| 5 | Coach orchestration, evidence system, response validation hardening | 🔶 mostly |
| 6 | Player Intelligence, Chess DNA, historical patterns | ⏳ |
| 7 | Training engine, mistake trainer, spaced repetition | ⏳ |
| 8 | Premium themes, mobile optimization, offline hardening | ⏳ |
| 9 | Provider import architecture (Lichess/Chess.com legit APIs) | ⏳ |
| 10 | Performance, battery, accessibility, security, testing, polish | ⏳ |

## Privacy

**Your games stay on your device.** Everything — games, analysis, coach
conversations, statistics, settings — lives in IndexedDB. No accounts, no servers,
no cloud AI, no API keys. Internet is only needed to install the app and its assets.

## Licenses

- Source code: **GPL-3.0-only** (see `LICENSE`) — required because Stockfish is GPL-3.0.
- Stockfish: GPL-3.0, https://github.com/official-stockfish/Stockfish (npm build
  `stockfish@19.0.0` by nmrugg/Chess.com).
- Gemma model weights: **not redistributed**; downloaded on demand under Google's
  Gemma terms (Phase 4). See `docs/licenses.md` for the full inventory.

## Documentation

- `docs/architecture.md` — system design
- `docs/data-model.md` — local database schema
- `docs/mobile-performance.md` — mobile/perf/battery strategy
- `docs/licenses.md` — license inventory
- `docs/reference-comparison.md` — vs. stefan-kp/chess_tutor
