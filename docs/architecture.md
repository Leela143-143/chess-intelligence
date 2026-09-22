# Chess Intelligence — Architecture

Browser-first. Mobile-first. Local-first. Everything that can run on-device, does.

## 1. Layers

```
┌────────────────────────── UI (React 19 + Vite) ──────────────────────────┐
│  Pages: Dashboard · Board · Games · Game · Training · Settings · Diag    │
│  Components: ChessBoard · MoveList · EnginePanel · CoachPanel ·          │
│              EvaluationGraph · BottomSheet · CommandPalette · Cards      │
└────────────┬───────────────────────────────┬─────────────────────────────┘
             │                               │
   ┌─────────▼──────────┐          ┌─────────▼──────────┐
   │  EngineScheduler   │          │  CoachController   │
   │  priority queue    │          │  engine selection  │
   │  worker pool       │          │  validation        │
   │  cancel / pause    │          │  evidence          │
   └─────────┬──────────┘          └─────────┬──────────┘
             │ ChessEngine iface            │ CoachEngine iface
   ┌─────────▼──────────┐          ┌─────────▼────────────────┐
   │  StockfishEngine   │          │ LocalCoachEngine (Gemma) │
   │  UciClient         │          │ DeterministicCoach       │
   │  └─ Web Worker ────│──┐       └──────────────────────────┘
   └────────────────────┘  │
                    ┌──────▼───────────────┐
                    │ stockfish-19 WASM    │
                    │ (single-thread lite) │
                    └──────────────────────┘

   ┌──────────────── Local data (Dexie/IndexedDB) ────────────────┐
   │ games · analyses · profile · settings · training · coach     │
   └──────────────────────────────────────────────────────────────┘
```

## 2. Engine abstraction (spec §12–17)

- `ChessEngine` interface: `ready() / analyze() / stop() / dispose()`.
- `StockfishEngine` implements it over UCI messaging with a `UciClient`
  (handshake `uci → uciok → isready → readyok`, `info`/`bestmove` parsing,
  White-perspective normalization, AbortSignal → UCI `stop`).
- Future engines plug in without UI changes.
- **The AI never replaces Stockfish.** Model output is explanation only.

### EngineScheduler

- Bounded pool (`poolSize` by device class: 1 on low/mobile, up to 3 on desktop).
- Priority: 1 current position · 2 user-selected move · 3 game review ·
  4 background historical analysis.
- Per-strength budgets (`STRENGTH_BUDGETS`): fast 10ply/400ms · standard 16/2000 ·
  deep 22/6000 · maximum 30/15000 — bounded so a misclick can't cook a phone.
- Page hidden → stop in-flight jobs, requeue at front, suspend new work.
- `backgroundPermitted()` gates priority-4 work (user setting + battery).
- Suspension reasons: `hidden | user | battery | coach` (engine ↔ coach coordination,
  spec §92).

## 3. Coach architecture (spec §18–22, §51–55, §69–72)

UI → `CoachController` → first available `CoachEngine` → **validation** → screen.

- `LocalCoachEngine` (Gemma): profile system (Mobile Fast / Mobile / Browser
  Balanced / Browser Quality), device detection (cores/memory/WebGPU/touch),
  download state machine (idle → downloading(progress) → ready/error), streaming
  `onToken`, `unload()` for memory release. The actual runtime plugs in via
  `registerGemmaRuntime()` in Phase 4 — until then `isAvailable()` is false.
- `DeterministicCoach`: rule-based text generated from classification + eval swing +
  tactic theme + phase. Labeled **"Rule-based"**, never "AI".
- `validateCoachResponse`: drops sentences containing
  - evaluations not present in the provided engine data,
  - moves illegal in the position (and not the engine's move/discussed move),
  - statistics without provided player stats.
  Removed claims are disclosed in the UI.
- Personalities (9) only alter presentation; data is identical.
- The prompt contract (`CoachContext`, spec §20) carries engine facts as JSON —
  the model explains them, never invents them.

## 4. Analysis pipeline status

Phase 1 provides **per-position** analysis: cached evals keyed by FEN feed
classification (`classifyMove`) and tactics (`detectTacticsAfterMove`) into the
coach context. Phase 2 adds the two-stage game pipeline
(shallow sweep → critical-moment detection → deep re-analysis of key positions,
`findCriticalMoments` + accuracy metrics already implemented and tested).

## 5. Worker architecture (spec §65)

- Stockfish runs in a dedicated Web Worker (`public/stockfish/*.js` classic worker,
  spawned by `UciClient`). The main thread only parses promises of structured results.
- PGN parsing, fingerprints and stats are synchronous but bounded (size caps, capped
  game counts); if profiling shows cost they move to a worker without API changes.
- LLM inference (Phase 4) runs inside the runtime's own workers.

## 6. Security (spec §83)

- PGN: 5 MB cap, 500 games/import, 1000 plies/game, 300-char headers,
  control-character stripping; React renders all text (no `dangerouslySetInnerHTML`).
- Backup import: size cap, schema check, `__proto__`/`constructor`/`prototype` key
  rejection, typed shape validation, no orphan analyses.
- No third-party accounts, cookies, or remote endpoints at all.

## 7. PWA & offline (spec §63–64)

- `manifest.webmanifest` + SVG icons (any/maskable), standalone display.
- `sw.js`: precaches shell + engine wasm; navigations network-first with offline
  fallback; same-origin assets stale-while-revalidate → after first session the
  board, engine and coach work fully offline.
- Code splitting: vendor / chess / app chunks; engine and model are separate
  on-demand assets.

## 8. Testing strategy (spec §102–104)

- **Chess regression** (rules: mate/stalemate/castling/en-passant/promotion/
  repetition/50-move/insufficient material/FEN-SAN-UCI round-trips).
- **Classification thresholds**, **metrics** (accuracy/ACPL/critical moments),
  **UCI parsing**, **opening detection**, **PGN import & security**,
  **coach validation** (AI regression: no invented evals/moves/stats),
  **IndexedDB schema, dedupe, backup** (fake-indexeddb).
- All green: `npm test` → 84 tests, 8 files.
