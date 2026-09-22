# Reference Comparison — Chess Intelligence vs stefan-kp/chess_tutor

Study reference only; no code/assets/prompts copied. See `reference-analysis.md`
(root `/docs`) for the full study.

Legend: ✅ implemented & superior · 🔶 partial/planned (phased) · ❌ absent.

| Dimension | chess_tutor (reference) | Chess Intelligence | |
|---|---|---|---|
| **Stockfish** | v10 (2019) — client worker + a fresh server worker per eval | **npm `stockfish@19`** WASM in pooled, scheduled Web Workers; budgets, priorities, cancellation | ✅ |
| **AI coach** | Cloud Gemini, BYO API key, server-rendered prompts | Local-first design: Gemma (Phase 4) + validated structured context; deterministic coach today | ✅ |
| **Local AI** | ❌ none | Profile system (4 Gemma profiles), device-driven selection, download state machine, runtime plug-in API | ✅ |
| **Offline AI** | ❌ | Deterministic coach always; Gemma after model download | ✅ |
| **Mobile** | Capacitor wrapper of a responsive site | Mobile-first PWA designed at 375–412 px; bottom sheets, touch/drag board, safe areas | ✅ |
| **Offline** | ❌ (server APIs everywhere) | Service worker + IndexedDB + local engine → full core offline after first load | ✅ |
| **Game analysis** | flat depth-15 per move | per-position evals now; two-stage shallow→critical→deep pipeline (Phase 2; metrics/critical-moment code already tested) | 🔶 |
| **Move classification** | ❌ | 10-class taxonomy with documented, configurable thresholds | ✅ |
| **Opening training** | 12,379 ECO + Wikipedia + sessions | detection via original ECO index now (✅ engine-level); full trainer in Phase 3/7 | 🔶 |
| **Tactical training** | 8 hardcoded themes (Lichess puzzles) | deterministic detector (9 themes now, 20 planned) + puzzles generated from user's own mistakes (Phase 7) | 🔶 |
| **Player intelligence** | ❌ | evidence-based model designed (score/confidence/n/trend/evidence); implementation Phase 6 | 🔶 |
| **Chess DNA** | ❌ | planned Phase 6 from real games | 🔶 |
| **Personalized training** | ❌ (static puzzles + streaks) | mistake trainer + spaced repetition + adaptive plans (Phase 7) | 🔶 |
| **Historical patterns** | ❌ | "why do I keep losing" comparisons planned Phase 6 | 🔶 |
| **Profiles** | ❌ (localStorage settings) | local profile row + avatar/name/bio + stats (✅), achievements Phase 6 | 🔶 |
| **Statistics** | move-history table only | accuracy/ACPL/critical moments implemented; dashboard aggregates (✅) with more phases | ✅ |
| **Piece sets** | default set | 3 original/typographic sets, asset-manifest policy (no scraped images) | ✅ |
| **Board themes** | CSS dark mode | 5 board themes × 3 piece sets × independent orientation/coords/highlights | ✅ |
| **PWA** | ❌ | manifest + service worker + offline fallback + icons | ✅ |
| **Privacy** | games sent to Google for coaching | **games never leave the device**; no accounts, no keys, no network calls at runtime | ✅ |
| **Performance** | server round-trips per eval | local workers, budgets, visibility/battery gating, 140 kB gz JS shell | ✅ |
| **Coach trust** | debug prompt log | structured context contract, response validation, evidence chips, confidence, honest source badges | ✅ |
| **i18n** | 5 languages | English only for now (Phase 10 candidate) | ❌ |

## Where the reference is genuinely ahead (tracked work)

1. **Opening database size** — its 12,379-entry ECO corpus dwarfs our 70-line index;
   we will ingest a properly licensed dataset instead (recorded in `docs/licenses.md`).
2. **Ready-made puzzle bank** — ours arrive with Phase 7 (generated from user games).
3. **Capacitor store builds** — intentionally out of scope (browser-first product).
4. **i18n** — 5 languages vs our 1.

## What we deliberately do differently

- No cloud LLM, no API keys, no server dependency — ever — for core coaching.
- No novelty/toxic personas; nine professional coaching styles, same data.
- Engine authority is never overridden by the model; validation strips anything
  the model cannot prove from the provided engine facts.
