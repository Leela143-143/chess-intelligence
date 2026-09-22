# Mobile Performance Strategy

Design targets: **375 px (iPhone SE), 390 px (iPhone 14), 412 px (Pixel)** first,
scale up. Not a shrunk desktop UI (spec §59–68).

## 1. Layout

- Single-column flow on mobile: top bar → content → fixed bottom nav
  (60 px + safe-area inset). Desktop ≥900 px switches to sidebar + topbar + wide grid.
- Analysis experience (spec §60): board → evaluation → move list → coach;
  coach/moves open as **bottom sheets** (<900 px), inline cards on desktop.
- Touch targets ≥44 px (nav, buttons, palette items); board squares are ~46 px at 375 px.
- `viewport-fit=cover` + `env(safe-area-inset-bottom)` for notched devices.

## 2. Rendering & motion

- Board = one CSS grid of 8×8 buttons; pieces are text glyphs (zero image requests,
  no sprite decode cost). Highlighting uses pseudo-elements only.
- CSS custom properties for themes — no JS style recalculation on navigation.
- `prefers-reduced-motion` and a manual **Reduce motion** toggle kill animations.
- No layout thrash: eval bar and coach use fixed/known sizes with transitions.

## 3. Work off the main thread

- **Stockfish in a Web Worker** — UI never blocks; UCI parsing happens off-thread.
- Single-threaded engine build (`lite-single`) → **no SharedArrayBuffer, no
  COOP/COEP headers**, works on every mobile browser; 1.7 MB wasm (embedded NNUE).
- Engine pool sized by device class: ultra-low/low = 1 worker, balanced ≤2,
  high/desktop ≤3 (`classifyDevice()` from cores/memory/WebGPU/touch).

## 4. Analysis budgets (CPU/heat)

- Four strength tiers with hard depth **and** time caps (fast 400 ms → maximum 15 s);
  nothing long-running starts implicitly on mobile.
- Two-stage design (spec §15): Phase 2 runs a cheap sweep first and spends deep
  analysis only on critical positions.
- Auto-analyze on the board uses `fast` only, cached per FEN — no re-analysis of
  seen positions.
- Page hidden → in-flight searches stopped and requeued, new work suspended
  (`EngineScheduler` + visibilitychange). Background analysis can be disabled
  entirely in Settings (`backgroundAnalysis`).

## 5. Battery & thermal (spec §66–67)

- `backgroundPermitted()` gate for priority-4 background jobs — off when the user
  disables background analysis (battery-aware hook point for `navigator.getBattery`).
- Engine ↔ coach suspension reasons (`hidden | user | battery | coach`) prevent
  Stockfish and Gemma both burning CPU on weak devices (spec §92).
- Model unload API (`LocalCoachEngine.unload()`) frees memory when coaching idles;
  scheduler `dispose()` terminates workers.

## 6. Payload budget (spec §64)

Production build (measured):

| asset | raw | gzip |
|---|---|---|
| index.js (app) | 185 kB | 60 kB |
| vendor (react) | 219 kB | 68 kB |
| chess.js | 35 kB | 12 kB |
| css | 16 kB | 4.4 kB |
| engine wasm (lazy asset) | 1.79 MB | served from cache |
| engine js loader | 21 kB | — |

- Rolldown/Vite code splitting: `vendor` / `chess` / app chunks.
- Engine wasm, model weights (Phase 4), piece textures and training datasets are
  **on-demand** assets — never in the first paint path.
- Service worker precaches shell + engine so subsequent launches are instant and
  fully offline.

## 7. First-launch experience (spec §8)

Device probe (cores, memory, WebGPU, WASM, pointer) → device class → recommended
profile, user-overridable in Settings; diagnostics screen exposes the live numbers.

## 8. Measurement (spec §89)

Hidden `#/diagnostics` screen reports: engine status/queue/pool/completed/failed,
model state, device class, cores/memory/WebGPU, database usage vs quota, cache
names. Build sizes are printed by every `npm run build`.
