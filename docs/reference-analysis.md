# Reference Analysis — stefan-kp/chess_tutor

Studied as **reference implementation only**. Nothing here licenses copying source
code, branding, text, prompts, UI layouts, CSS, personality descriptions or assets
from that project. See the "Do NOT copy" section below.

Clone location: `/reference/chess_tutor` (shallow clone).

---

## 1. What the project is

"AI Chess Tutor" — a Next.js (App Router, React 19, TypeScript, Tailwind 4) web app
where the user plays against Stockfish while a cloud LLM (Google Gemini) coaches in
one of 9 personalities. ~23.7k lines of TS/TSX across 111 source files, Jest unit
tests, Playwright e2e, Docker deployment, Capacitor-based iOS/Android wrappers.

### Architecture as found

```
Browser (React 19 client)
  ├── stockfish.js in a Web Worker          (local play-vs-engine evaluations)
  └── fetch → Next.js API routes
              ├── /api/v1/stockfish         (server worker_threads Stockfish, depth 15)
              ├── /api/v1/llm/chat          (Gemini, BYO API key)
              ├── /api/v1/llm/opening-explanation
              ├── /api/v1/personalities
              └── /api/v1/wikipedia/summary (network dependency)
```

Key modules:

| Area | Files | Notes |
|---|---|---|
| Engine abstraction | `src/lib/engine/{types,LocalEngine,RemoteEngine,index}.ts` | `ChessEngine` interface with local vs. remote impls (remote exists so GPL Stockfish.js can be stripped from app-store builds) |
| Client engine | `src/lib/stockfish.ts` | Worker + UCI parsing, promise queue, white-perspective normalization |
| Server engine | `src/lib/server/stockfishEngine.ts` | Spawns a **new worker_threads Worker per evaluation**, 15 s timeout |
| LLM | `src/lib/gemini.ts`, `analysisPrompts.ts`, `server/tutorPrompt.ts` | Gemini via `@google/generative-ai`; API key from env or localStorage |
| Tactical detection | `src/lib/tacticDetection.ts` (383 LOC) | 7 tactics: win_piece, win_pawn, pin, fork, skewer, check, hanging_piece — runs on the *engine's best move*, not the position in general |
| Tactical puzzles | `src/lib/tacticalLibrary.ts` (824 LOC) | Hardcoded Lichess-derived puzzles, 8 themes |
| Openings | `src/lib/openings.ts`, `openingTrainer/*` | 12,379-entry ECO JSON index, session state machine, Wikipedia blurbs |
| Personalities | `src/lib/personalities.ts` (268 LOC) | 9 personas, presentation-layer only |
| Persistence | `src/lib/savedGames.ts` | localStorage for in-progress games only |
| i18n | `src/lib/i18n/*` | en/de/fr/it/pl |
| Mobile | `capacitor.config.ts` | Wrapper around the web build; remote engine forced for stores |

---

## 2. What it does well

1. **Clean engine abstraction.** `ChessEngine` interface with `LocalEngine` /
   `RemoteEngine` implementations and a factory — the right instinct; we keep the
   idea of an interface (ours adds scheduler, budgets, cancellation, MultiPV results).
2. **UCI handling is careful.** Client engine queues evaluations, waits for `uciok`
   with timeout, parses `info depth/score cp/score mate/bestmove`, and normalizes
   scores to White's perspective — a subtle bug class they got right.
3. **Conservative tactical detection.** Filters (eval-loss threshold, recapture
   safety) reduce false positives rather than hyping every capture as a tactic.
4. **Real test culture.** Jest unit tests on prompts, format detection, game state,
   tactic detection, opening-trainer state machine; Playwright e2e; fixtures.
5. **Opening trainer depth.** ECO index, families, session persistence, deviation
   handling (undo / continue / explore) is genuinely well-factored into a reducer +
   orchestrator.
6. **Personality = prompt layer only.** All 9 personalities consume the same engine
   data; presentation changes only. Correct separation.
7. **Dual-license pragmatism.** Documents GPL-3.0 code vs. proprietary store builds
   honestly (LICENSING.md, COPYRIGHT).
8. **Debug mode** exposing raw prompts/responses — great for trust and troubleshooting.
9. **Responsive, dark-mode UI** with eval bar, move-history table, PGN/FEN import +
   export.

---

## 3. What it does poorly / is missing

### Architectural blockers (relative to our product vision)

1. **Cloud LLM dependency.** The coach requires a Google Gemini API key (env or
   localStorage). No key → no coaching. Games and positions are sent to a third
   party to get coaching. Directly violates: local AI, no API keys, "your games
   stay on your device", offline-first.
2. **Server-required app.** Next.js API routes mean the product cannot run
   self-contained in a browser; Stockfish evaluation for analysis goes through the
   server. No offline capability beyond cached static assets; no PWA, no service
   worker, no model/asset caching strategy.
3. **No local inference at all.** No WebGPU/WASM LLM, no model profiles, no device
   detection, no deterministic coach fallback ("No fake AI" is trivially satisfied
   only because AI is simply absent offline).
4. **No player intelligence.** No evidence-based player model, no skill dimensions,
   no Chess DNA, no confidence/sample-size tracking, no recurring-pattern detection,
   no "why do I keep losing?" across history.
5. **No local game database.** Only in-progress games in localStorage. No import
   history, no dedupe fingerprints, no per-move storage, no analytics over one's
   own games, no export/import of a full data package.
6. **No training engine.** No puzzle generation from the user's own mistakes, no
   spaced repetition, no personalized plans, no improvement measurement beyond
   streaks.
7. **No move classification system.** No Best/Inaccuracy/Mistake/Blunder taxonomy
   with documented thresholds, no accuracy/ACPL, no ranked critical moments, no
   game-review summary, no eval graph (only a move table with eval changes).
8. **Analysis strategy is naive.** Every move → same depth-15 evaluation; server
   spawns a fresh worker per evaluation; no two-stage shallow→deep selective
   analysis, no EngineScheduler, no priority/cancellation/time budgets, no
   battery/thermal awareness, no page-visibility pausing.
9. **Tactical coverage is thin.** 7 detected themes vs. the ~20 our spec requires;
   detection only reasons about the engine's best move in the position after it,
   so it misses zwischenzug, deflection, decoy, overload, removal-of-defender,
   clearance, X-ray, trapped piece, back-rank, promotion, mating patterns etc.
10. **No coach evidence/validation layer.** No structured coach-context contract, no
    post-generation claim validation, no "Show evidence" / confidence UI.
11. **No PWA, offline, installability, lazy-loading strategy or performance
    budget.** Bundle loads engine + opening index + tactical library eagerly.
12. **No privacy story, no local profile, no achievements, no timeline, no weekly
    report, no personal search, no game comparison, no command palette, no hidden
    diagnostics screen** (debug panel exists but is prompt logging only).
13. **Mobile = afterthought wrapper.** Capacitor wraps a responsive web UI; it is
    not mobile-first (no bottom sheets, no touch-first analysis flow), and forcing
    remote engine for stores reintroduces server dependence.

### Smaller code-level issues

- Two divergent Stockfish implementations (client worker vs. server worker) with
  duplicated UCI parsing — drift risk.
- Server creates/terminates a worker per evaluation (cold-start cost each time).
- `stockfish.js@10` — a 2019-era engine (no NNUE), far behind current Stockfish.
- Tactical detection re-implements attack generation instead of reusing a single
  shared module; pin/skewer scan runs over all 64 squares × directions each call.
- Eval normalization duplicated in three places (client, server, API route docs).
- API-key-in-localStorage pattern (XSS-exposed secret) we will not replicate at all.
- Wikipedia summary calls happen at render time — network dependency inside
  "learning" flows.

---

## 4. What should be redesigned (our independent approach)

| Concern | Reference | Our design |
|---|---|---|
| LLM | Cloud Gemini + BYO key | On-device Gemma via WebLLM-class runtime, model profiles, IndexedDB/CacheStorage caching, deterministic rule-based coach fallback |
| Engine | Client v10 worker + server worker per request | Single `StockfishEngine` (npm `stockfish@19`, WASM) behind a `ChessEngine` interface, managed by an `EngineScheduler` (priority queue, pooled workers, budgets, cancellation, visibility/battery awareness) |
| Data | localStorage in-progress games | Dexie/IndexedDB schema: games, moves, analyses, positions, stats, profile, training, coach memory, settings; JSON/PGN export-import |
| Analysis | Flat depth-15 per move | Two-stage: shallow sweep → critical-moment detection → deep analysis of important positions only |
| Intelligence | None | Deterministic Player Intelligence with score/confidence/sample_size/trend/evidence, powering Chess DNA, recurring patterns, recommendations |
| Coach contract | Free-form prompt | Structured `CoachContext` (engine facts JSON) + response validation + evidence linking; model may only *explain* |
| Training | Static hardcoded puzzles | Puzzles generated from the player's own mistakes + spaced-repetition scheduler + adaptive plans |
| Mobile | Capacitor wrapper | Mobile-first responsive PWA (375/390/412 px first), bottom sheets, touch/drag/long-press, offline service worker |
| Personalities | 9 novelty personas (toxic, drunk, Shakespeare…) | 9 professional coaching styles (Professional, Friendly, Tactical, Opening, Endgame, Tournament, Beginner, Advanced, Engine Analyst) — same data, different presentation |

---

## 5. Ideas worth implementing independently (not copying)

- Engine abstraction interface concept (re-architected with scheduler/budgets).
- Two-sided evaluation normalization to White's perspective (verify with tests).
- Conservative tactic detection philosophy (threshold + recapture safety) — extended
  to a much larger deterministic tactic library of our own implementation.
- Deviation handling in opening training (undo / continue / explore).
- Prompt-logging debug mode → generalized into a hidden diagnostics screen.
- Personality-as-presentation-layer separation.
- Session persistence/resume pattern (generalized to local-first DB).
- Dual-engine local/remote *concept* documented as a future optional sync/analysis
  service (not implemented now).

---

## 6. Do NOT copy

- Any source code, CSS, UI layouts, or architecture verbatim.
- Branding, name, logo, screenshots, text, README prose.
- System prompts / prompt wording.
- Personality names, descriptions, personas (several would be off-brand for us).
- Piece/board assets, puzzle JSON, opening JSON — unless a separately licensed
  dataset is documented in `docs/licenses.md`.
- Their tests as our tests (we write our own from the spec).
