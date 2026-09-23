# UI Audit — Phase 1 interface (Stage 1 of Phase 2)

Audited commit: `3cb305b` ("Phase 0-1: browser-first chess intelligence platform").
Scope: every user-visible surface in `src/` plus the shared stylesheet
`src/styles/app.css`. This audit is deliberately adversarial — it exists to
justify the redesign, not to flatter the previous work.

---

## 1. Inventory — what exists today

### Shell (`src/App.tsx`, `src/styles/app.css`)

| Element | Implementation | Notes |
|---|---|---|
| Sidebar (≥900px) | fixed 220px, text+glyph links | `◧ ♞ ▤ ◎ ⚙` |
| Topbar | sticky, brand + "⌕ Search" button | duplicated brand in sidebar |
| Bottom nav (<900px) | 5 fixed tabs | Dashboard / Board / Games / Training / Settings |
| Route switching | `useMemo` returning a page element | no transition of any kind |
| Toast | single string, 2.6s | fire-and-forget |
| Command palette | Ctrl/Cmd+K, substring filter | commands are a hardcoded list |

### Pages

| Page | Purpose | Structure |
|---|---|---|
| `DashboardPage` | home | greeting, 3 `StatCard`s, one card, recent games list, placeholder card |
| `BoardPage` | free analysis | board, 4 nav buttons, PGN/FEN loaders, engine card, move table, coach card |
| `GamesPage` | import + library | buttons, dropzone, paste panel, import report, flat list of `GameCard` |
| `GamePage` | stored game | board, nav buttons, eval card, move table, coach card |
| `TrainingPage` | stub | empty state only |
| `SettingsPage` | preferences | segmented rows |
| `DiagnosticsPage` | hidden `#/diagnostics` | raw counters |

### Components

`ChessBoard`, `MoveList`, `EvaluationGraph`, `EnginePanel`, `CoachPanel`,
`BottomSheet`, `CommandPalette`, `cards.tsx` (`StatCard`, `GameCard`, `EmptyState`).

### Design tokens today

Dark `#0e0f13`, surfaces `#14161c`/`#1a1d25`/`#222633`, border `#262b38`,
text `#e8eaf0`, accent gold `#c9a45c`, secondary blue `#7fa8ff`, danger
`#e5645c`, warning `#e0a53f`, success `#5fbf7a`. 4 app themes
(dark/light/oled/contrast), 5 board themes, 3 piece sets. `Inter`/`JetBrains
Mono` referenced but **never loaded** (silent fallback to system fonts).

---

## 2. Visual problems

1. **It reads as a dashboard, not an instrument.** The product's subject —
   the chessboard and the player's chess data — is never the focal point.
   On the home screen the board does not appear at all; the first thing a
   user sees is a greeting and three grey statistic tiles.
2. **Everything is a rounded card of the same weight.** `.card` (14px
   padding, 12px radius, 1px border) is applied to almost every surface:
   stats, engine, moves, coach, import, placeholder notices. There is no
   hierarchy between "the point of this screen" and "a footnote".
3. **No typographic hierarchy.** `h1` is `1.35rem`, `h2` `1.1rem`, `h3`
   `0.95rem` and `body` `15px` — the whole product sits inside a 1.5×
   range, so nothing can be emphatic. Headings are system-font at weight
   650 with no display face, no tracking, no editorial scale.
4. **The only loaded-face assumption is false.** `--font` names `Inter`
   and `--mono` names `JetBrains Mono`, neither is bundled or linked, so
   every platform silently renders a different font. Typography is
   therefore *not* part of the identity at all.
5. **Accent is decorative, not semantic.** Gold is used for the brand
   mark, chips, active nav, move highlights, sheet affordances and
   progress bars simultaneously, while blue is used for links, the eval
   curve, the selected square and the "Local Gemma" badge. Neither colour
   reliably means anything.
6. **The board is a flat rectangle.** 8px radius, 1px border, one shadow,
   no depth, no bevel, no coordinate furniture beyond two tiny corner
   labels, `background: #b9c0cf / #5c6478` for the default theme.
7. **Pieces are Unicode glyphs** (`♔♕♖♗♘♙` + `-webkit-text-stroke`). Their
   shape, weight, baseline and internal metrics vary by platform; the
   "piece sets" are three stroke/colour variations of the same system
   font, not designs. A capture cannot be animated because the piece
   simply disappears.
8. **The evaluation graph is decoration.** One 1.2px polyline, a flat
   12%-opacity fill, red dots, a hairline cursor. No axes, no labels, no
   hover readout, no zones, no scale, no click target beyond a whole-SVG
   handler. It cannot answer "what happened here?".
9. **Placeholder copy is load-bearing.** Two cards on the home screen and
   an entire page (`TrainingPage`) exist only to say that a future phase
   will implement them.
10. **No empty-state art, no loading choreography.** Loading is a grey
    `shimmer` block; the engine shows `—`; nothing narrates what the
    product is doing or why.
11. **No texture, no atmosphere.** Pure flat colour fields — no grain, no
    vignette, no grid, no depth cue. The "chest laboratory" concept in the
    CSS header comment is not visible in a single pixel.

## 3. Interaction problems

12. **Navigation has no state model.** `page` is a `useMemo` on the hash;
    there is no transition, no scroll restoration, no focus management on
    route change, and no sense of "arriving somewhere".
13. **No motion language.** The entire stylesheet contains exactly three
    keyframes (`sheet-up`, `fade-in`, `shimmer`) and two transitions
    (`0.06s` button scale, `0.35s` eval bar). Moves appear instantly; a
    capture is indistinguishable from a quiet move; check and mate have no
    visual event at all.
14. **No feedback for significant events.** Import completion, analysis
    completion, new personal best and weakness detection all render as the
    same neutral pill toast.
15. **The engine panel leads with parameters.** Depth, node count and PV
    are always visible; the human sentence ("White is clearly better") is
    absent. Numbers are shown before meaning.
16. **Nothing is explorable.** There are no hover readouts on the eval
    graph, no way to scrub a game, no critical-moment list, no "why"
    affordance on a move, no pattern cards, no timeline.
17. **The coach is a button rack plus a textarea.** Seven identical
    buttons plus a free-text field; the response is a paragraph in a grey
    box. This is the generic-chatbot shape the brief forbids.
18. **The command palette understands a hardcoded list**, not the user's
    chess ("show my last loss", "games where I blundered after move 30"
    are impossible).
19. **Cursor is the OS default.** Over the board there is no coordinate or
    grab affordance beyond `cursor: grab`; over data there is nothing.

## 4. Mobile problems

20. **The board is capped at `min(92vw, 560px)`** with `font-size:
    clamp(24px, 9.5vw, 52px)` glyphs — the single most important control
    on a phone is a viewport-width guess, not a measured layout.
21. **Everything below the board is a vertical stack of cards**, so a
    phone user scrolls past the engine card, the move table and the coach
    to reach anything; there is no progressive disclosure, no sticky
    context, no sheet-based workflow except the coach.
22. **Two competing navigation systems** on tablet widths (bottom nav plus
    sidebar swap at exactly 900px) with no intermediate treatment.
23. **Touch targets are inconsistent**: nav links `min-height: 44px`,
    `.btn.small` `34px`, `.seg button` `36px`, palette rows `44px`. Several
    interactive controls miss the 44px guideline.
24. **The move table is a scroll box** (`max-height: 320px`,
    `overflow-y: auto`, `td { white-space: nowrap }`) with no swipe, no
    auto-scroll to the active ply and no markers on important moves.

## 5. Inconsistencies

25. Two brand lockups (sidebar and topbar) with different glyph sizes.
26. `.grid.cols-3` is 2 columns below 900px, so "Recent form / Games /
    Rating" wraps awkwardly on a phone.
27. Result colouring depends on `myColor`, which `DashboardPage` never
    passes to `GameCard` — the same game can read as "W" on the dashboard
    and "L" in the library.
28. `SettingsPage` writes `document.documentElement.dataset.theme`
    directly in one code path (command palette) and through
    `SettingsProvider.update()` in another; they can disagree.
29. Mixed emoji/glyph/icon vocabulary: `⚙ ⌕ ⟲ ⏮ ◀ ▶ ⏭ ✕ ◎ ▤ ◧ ♞ ⌘ ★ ✓ · → ?! † ∞ ✦`.
30. `EnginePanel` accepts both `autoAnalyze` and an `externalEval`
    override, so two independent analyses of the same FEN can both exist
    and disagree on screen.

## 6. Accessibility issues

31. **Route changes are silent to assistive technology** — no `aria-live`
    region, no focus move, and the document `<title>` never changes.
32. **The board is a 64-button grid with no arrow-key navigation.**
    `role="grid"` is declared but no `gridcell`/`row` roles or roving
    tabindex exist, so the semantics are wrong *and* the pattern is only
    partially keyboard-operable (tab through 64 buttons).
33. **Drag-and-drop has no keyboard equivalent** beyond tap-tap; there is
    no announced confirmation of a played move.
34. **Contrast**: `--text-faint: #6b7186` on `--surface: #14161c` is
    ≈4.0:1 — under AA for body text. `.cls-warn` (`#e0a53f`) on the light
    theme's `#ffffff` is ≈2.2:1.
35. **`prefers-reduced-motion` is respected only by a global
    `animation-duration: 0.001s` override**, which also suppresses the
    legitimate sheet/evalbar transitions rather than replacing them with
    an intentional reduced experience.
36. **Honest-engine semantics are inconsistently exposed**: the "unsupported
    claim removed" note is plain text, and `badge-source` colours carry
    meaning with no text alternative for the colour difference.
37. **Toasts are not announced** (`role="status"`/`aria-live` missing),
    and nothing is focusable inside them.
38. **Charts have no accessible equivalent.** `EvaluationGraph` sets
    `role="img"` with the label "Evaluation graph" and nothing else; the
    data is unavailable to a screen reader.

## 7. Performance observations

39. `BoardPage`/`GamePage` re-run analysis whenever the `evals` object
    identity changes (it is in the effect's dependency list) — a cache
    write can re-trigger the effect that produced it.
40. The eval-graph click handler recomputes `findIndex` twice per render
    and the whole SVG re-renders on every ply change with no memoisation.
41. `DashboardPage` calls `detectOpening` for **every** game on every
    render, and `listGames()` loads whole PGN bodies for the dashboard.
42. No `content-visibility`, no virtualisation and no list windowing
    anywhere; a 5 000-game library renders 5 000 `GameCard` buttons.
43. No image, no font and no worker asset is preloaded; the Stockfish
    worker only begins booting after `EngineProvider` mounts.

---

## 8. What must survive the redesign (non-negotiable)

Per Phase 2 §68, the redesign may not regress:
PGN import (file/paste/drag-drop/bulk + caps + dedupe), FEN load, Stockfish
via the scheduler, IndexedDB persistence, the PWA/offline shell, the worker
architecture, the engine scheduler's priority/suspension model, backup and
restore, the diagnostics route, keyboard access, reduced-motion support, and
the honesty rules for coach sourcing.

## 9. Redesign targets

| # | Target | Section of the brief |
|---|---|---|
| T1 | The board becomes the hero on every screen that owns one | §3, §8, §56 |
| T2 | Editorial typography scale with a real display face | §5 |
| T3 | One semantic accent + one tactical warning colour | §4 |
| T4 | Six intentional board themes, six real piece sets (SVG) | §10, §11 |
| T5 | Motion language for move/capture/promotion/check/mate | §9 |
| T6 | Instrument-grade evaluation graph and move timeline | §17, §21 |
| T7 | "The Moment" as the signature interaction | §18, §56 |
| T8 | Deterministic answers before any language model | §22, §63 |
| T9 | Profile as identity, not a statistic grid | §26–§31 |
| T10 | Training that plays back the player's own mistakes | §25, §32, §33 |
| T11 | Honest, choreographed loading and empty states | §42, §43 |
| T12 | Performance and accessibility preserved at every breakpoint | §45, §47, §48, §66 |
