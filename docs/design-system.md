# Chess Intelligence — Design System (Stage 2 of Phase 2)

**Identity name: “Obsidian Instrument.”**

An elite chess laboratory crossed with a cinematic digital chess studio: a
precision analytical instrument you look *through*, not at. The chessboard is
the hero; the player's chess data is the story; restraint is the luxury.

This document is the source of truth for the tokens in
`src/styles/tokens.css` and the components in `src/styles/`. Where a value
here disagrees with the stylesheet, the stylesheet wins and this file is
updated.

---

## 0. Research basis (principles only — nothing copied)

Before designing, published work from high-end interaction design was studied
for *principles*: Black Messiah, Possibles, Hollow, Finely Crafted and
Alejandro Schintu (Awwwards-calibre interactive work), plus Awwwards'
collective writing on typography-led and scroll-driven sites.

What was **extracted** (principles):

1. **One idea per viewport.** Award-level work composes a full screen around a
   single protagonist; everything else is subordinate.
2. **Type is the layout.** Display type set large enough to *be* the grid —
   generous negative space instead of boxes.
3. **Restraint in colour.** Two or three colours doing semantic jobs beat a
   palette. Contrast does the decorative work.
4. **Scroll as narrative**, not as pagination: each section is a beat with a
   transition, so the page argues rather than lists.
5. **Motion is physics, not garnish.** Easing communicates mass, distance and
   intent. Fewer, better-tuned transitions beat many.
6. **Tactility everywhere.** Micro-feedback on every meaningful action —
   press, hover, arrival, completion.
7. **Depth from layering and light**, not from drop shadows on every surface.
8. **Data as instrument**: axes, scale, readouts and zones so a chart is
   readable at a glance, like a medical or financial instrument.

What was **not** taken: source code, layouts, colour values, branding, assets,
text, copy tone, or specific animation recipes. Every value in this system was
chosen against verified contrast math and the chess domain.

---

## 1. Colour

Semantic, not decorative. Accent means *the product's voice*; the tactical
warning colour is reserved for positions worth pausing over.

### Dark (default) — evaluated on `#08080a`

| Token | Value | Contrast on surface | Grade |
|---|---|---|---|
| `--bg` | `#08080a` | — | — |
| `--surface` | `#0e0e12` | — | — |
| `--surface-2` | `#14141a` | — | — |
| `--surface-3` | `#1c1d24` | — | — |
| `--text` | `#f4efe6` (warm ivory) | 17.47:1 | AAA |
| `--text-dim` | `#a8a294` | 7.58:1 | AAA |
| `--text-faint` | `#8a8477` | 5.18:1 | AA |
| `--accent` | `#5fd3bd` (verdigris jade) | 10.58:1 | AAA |
| `--accent-ink` | `#06201c` (on accent) | 9.37:1 | AAA |
| `--pos` | `#6fce93` | 10.02:1 | AAA |
| `--neg` | `#e4695f` | 5.95:1 | AA |
| `--warn` | `#e2a33d` | 8.75:1 | AAA |
| `--steel` | `#8fa8c8` (engine/neutral data) | 7.89:1 | AAA |

### Light — evaluated on `#ffffff`

| Token | Value | Contrast | Grade |
|---|---|---|---|
| `--bg` | `#f7f4ee` (warm paper) | — | — |
| `--text` | `#14140f` | 16.83:1 | AAA |
| `--text-dim` | `#4d4a41` | 8.86:1 | AAA |
| `--text-faint` | `#6b675c` | 5.65:1 | AA |
| `--accent` | `#0f6b5f` | 6.39:1 | AA |
| `--pos` | `#1f7a45` | 5.35:1 | AA |
| `--neg` | `#b3261e` | 6.54:1 | AA |
| `--warn` | `#8a5a00` | 5.93:1 | AA |

`--oled` is the dark palette with `--bg: #000` and lifted borders.
`--contrast` is a high-contrast variant: pure black, pure white text, 2px
focus rings, `--accent: #6ef0d8`.

**Semantic rules**
- `--accent` → identity, selection, the current ply, primary actions, progress.
  It is the *only* colour permitted on more than three screen elements.
- `--steel` → engine/material facts and neutral data series (multi-PV lines,
  secondary chart series).
- `--pos` / `--neg` → evaluation polarity only, never brand.
- `--warn` → tactical warning: a critical moment, a hung piece, an unresolved
  position. Never used for ordinary emphasis.

All combinations above are asserted by `npm run check:contrast`
(`scripts/check-contrast.mjs`), which fails the build if a pair drops below
its documented grade.

---

## 2. Typography

Two self-hosted faces (both SIL OFL 1.1, documented in `docs/licenses.md`),
plus the platform monospace stack. Nothing is fetched at runtime — the PWA
stays fully offline.

| Role | Family | Token |
|---|---|---|
| Display / editorial | **Instrument Serif** (400 + italic) | `--font-display` |
| Interface / body | **Inter** variable (100–900), tabular numerals | `--font-ui` |
| Numerical data | `ui-monospace`, SF Mono, Cascadia Mono, Consolas | `--font-mono` |

Fallback chain on the display face is a real serif stack
(`"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`) so the
editorial voice survives a font failure on any platform.

### Scale (fluid, `clamp()`)

| Token | Size | Face | Use |
|---|---|---|---|
| `--fs-display-xl` | `clamp(2.75rem, 11vw, 7rem)` | display, lh 0.92, ls −0.03em | hero statement |
| `--fs-display-l` | `clamp(2rem, 6.4vw, 3.75rem)` | display, lh 0.98 | section statements |
| `--fs-display-m` | `clamp(1.5rem, 4vw, 2.25rem)` | display, lh 1.05 | page titles |
| `--fs-title` | `1.0625rem` | UI 600, ls 0.005em | card/panel titles |
| `--fs-body` | `0.9375rem` | UI 400, lh 1.6 | prose |
| `--fs-small` | `0.8125rem` | UI 400 | secondary |
| `--fs-micro` | `0.6875rem` | UI 600, ls 0.14em, uppercase | eyebrows, labels |
| `--fs-num` | `0.8125rem` | mono, `tabular-nums` | coordinates, engine lines |

**Editorial rule** — headings state a proposition, never a noun:

> YOUR CHESS<br>IS A SYSTEM.

not "Dashboard". Eyebrow labels (`--fs-micro`, uppercase, tracked, `--accent`
or `--text-faint`) sit above display statements to create the editorial
hierarchy large type needs.

Numbers always use `font-variant-numeric: tabular-nums` so figures do not
jitter as they animate.

---

## 3. Space, rhythm and layout

- 4px base: `--s-1: 4px`, `--s-2: 8px`, `--s-3: 12px`, `--s-4: 16px`,
  `--s-5: 24px`, `--s-6: 32px`, `--s-7: 48px`, `--s-8: 64px`, `--s-9: 96px`,
  `--s-10: 144px`.
- Vertical rhythm between narrative sections is `--s-9` desktop / `--s-7`
  mobile — the whitespace *is* the design.
- Desktop grid: 12 columns, `--gutter: 28px`, content max `1440px`, with an
  editorial 16-column gutters-only band for wide screens.
- Mobile: single column, `--gutter: 16px`, `min-height: 44px` on all
  interactive controls (see §8).
- Analysis workspace at ≥1024px: `minmax(420px, 640px) 1fr` — board column
  first, instrument column second; below that the order becomes
  board → eval → timeline → moments → coach.

## 4. Surfaces, borders and depth

- **Radius is small and intentional:** `--r-1: 2px` (chips, ticks),
  `--r-2: 4px` (default: cards, inputs, buttons), `--r-3: 10px` (sheets,
  modals, the board frame), `--r-pill: 999px` (status pills only).
  The generic “rounded-card-everything” look is explicitly rejected: the
  default radius is 4px and most surfaces are separated by hairlines.
- **Hairlines, not shadows, do the separating:** `--line` is the primary
  border (`color-mix(in srgb, var(--text) 12%, transparent)`), `--line-strong`
  18%. A 1px `--line` plus a background step of one surface level replaces
  most card shadows.
- **Two depth tiers only:** `--shadow-1` (raised: sheets, palette, dragged
  piece) and `--shadow-2` (floating: the board frame and the palette only).
  Cards get no shadow.
- **Layered surfaces** create depth: `bg → surface → surface-2 → surface-3`,
  each a small step. The board frame sits on `--surface-2` with an inner
  bevel (`inset 0 1px 0 rgb(255 255 255 / 6%)`) and outer `--shadow-2`.
- **Atmosphere** (`AtmosphereFX`): an extremely subtle procedural layer —
  1.5% film grain (animated SVG feTurbulence-free CSS gradients), a faint
  64px coordinate grid at 2.5% opacity, and a slow radial luminance centred
  behind the board. It never exceeds 4% opacity and is disabled on
  `prefers-reduced-motion` and on ultra-low devices.

## 5. Motion

| Token | Value | Meaning |
|---|---|---|
| `--e-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | arrivals, reveals |
| `--e-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | state changes |
| `--e-precise` | `cubic-bezier(0.2, 0.9, 0.1, 1)` | pieces, data |
| `--e-heavy` | `cubic-bezier(0.34, 1.2, 0.64, 1)` | captures (slight overshoot) |
| `--d-1…--d-4` | `120 / 220 / 420 / 700ms` | micro / state / section / cinematic |

**Move grammar (board)**

| Event | Behaviour |
|---|---|
| quiet move | piece translates `--d-2` on `--e-precise`; no rotation, no bounce |
| capture | victim scales 1 → 0.82 and fades on `--d-1` while a 2px `--neg` ripple expands from the square; mover lands 6% heavier |
| promotion | the pawn cross-fades to the promoted piece with a 140ms scale-in from 0.86 and a single `--accent` ring pulse |
| check | 320ms double pulse of `--neg` on the king square, plus board-edge vignette |
| mate | 640ms desaturate of the losing side's army to 55% and a single 2px `--neg` frame pulse on the board |
| illegal attempt | 180ms 2px horizontal shake of the piece, no toast |
| critical moment | the relevant squares receive a 900ms `--warn` corner-bracket animation |

**Page transitions** are shared-element where possible (`Games → Analysis`
morphs the game card into the workspace header; `Profile → Game` keeps the
player rail mounted) and otherwise a 180ms opacity + 8px rise. No transition
is purely a cross-fade.

**Microinteractions** — every meaningful event animates: import complete
(count-up on the added-games figure), analysis complete (eval curve draws
left→right over 420ms), training complete (ring fills), new personal best
(a single `--accent` sweep behind the number), weakness detected (bracket
flash). All are ≤700ms and none blocks input.

**Reduced motion** is a first-class branch, not a shortcut: a CSS/TS flag
swaps transforms for opacity-only fades, disables the atmosphere layer,
disables parallax/cursor tracking, and replaces the piece-move transition with
an instant positional update plus a static last-move highlight.

## 6. Board themes (6)

Each theme defines light/dark squares, coordinate colours (contrast-verified
against *its own* squares), frame, last-move/selection/check tints and a
procedural surface treatment. No image textures are downloaded — every texture
is CSS (repeating-linear-gradient grain, radial vignette).

| Theme | Light square | Dark square | Character |
|---|---|---|---|
| **Obsidian** (default) | `#9fa6b4` | `#3a4050` | cold graphite instrument |
| **Ivory** | `#efe4d2` | `#9a7b52` | warm tournament wood |
| **Slate** | `#b8c2d0` | `#5b667a` | neutral analytical |
| **Walnut** | `#d8b285` | `#7d4f2c` | premium board, grain |
| **Paper** | `#f6f0e2` | `#cbbfa3` | editorial study sheet |
| **Carbon** | `#2a2d35` | `#1a1c22` | technical dark, near-monochrome |

## 7. Piece sets (6)

All six are **original geometry authored for this project** as inline SVG in a
100×100 viewBox, drawn from primitives (pedestal, collar, stem, head) so the
whole set is one component themed by CSS variables. Nothing is scraped,
downloaded or traced; nothing depends on system font glyph coverage. Each set
is expressed as fill/stroke/detail tokens, and `Technical` additionally reveals
the construction group (centre-lines and base ticks).

| Set | Treatment |
|---|---|
| **Classic** | filled, 1.5u dark outline, soft inner shade |
| **Tournament** | filled with a second inner stroke (double outline), matte |
| **Editorial** | high-contrast thin outline, unfilled body, serif proportions |
| **Minimal** | flat single fill, no stroke, reduced detail |
| **Sculptural** | radial gradient volume, no outline, cast shadow |
| **Technical** | outline-only with construction lines and base ticks visible |

Because the pieces are vector, captures, promotions and check animations can
be staged (the victim is a real element that can leave), and the same geometry
scales from a 40px timeline thumbnail to a 640px analysis board.

## 8. Components

Legend: **new** / **reworked** / **kept**.

- `AppShell` (new) — top rail + contextual nav + mobile bottom bar, single
  nav model, `aria-current`, scroll restoration, focus handoff on route change.
- `AppNav` (new) — desktop: minimal top rail with the five destinations
  (Home, Games, Analyse, Train, Profile) plus contextual secondary nav per
  route; mobile: five-item bottom bar with 44px targets.
- `CommandCenter` (reworked from `CommandPalette`) — searches *the player's
  chess*, not a hardcoded list: natural-language intents for results, colours,
  openings, blunder plies, endgames (see §39 of the brief).
- `Button`, `Chip`, `Seg`, `Field`, `StatusPill` (reworked).
- `Panel` (new) — the one surface primitive: hairline border, 4px radius,
  optional eyebrow + title + action slot. Replaces ad-hoc `.card` usage.
- `PanelRow` (new) — hairline-separated row inside a panel.
- `Board` (reworked) — SVG pieces, depth frame, eval illumination, tactical
  highlights, move trails, animated captures/checks, promotion chooser,
  reduced-motion branch, full keyboard grid.
- `EvalBar` (new) — vertical instrument bar with mate states.
- `EvaluationGraph` (reworked) — instrument-grade: axes, zero-line, zones,
  area fill, event markers, hover crosshair with position readout, click to
  navigate, keyboard scrub, accessible data table fallback.
- `MoveTimeline` (new, replaces `MoveList`) — horizontal ply timeline with
  classification markers, quality heat, keyboard nav, auto-scroll to the
  active ply, swipe on mobile.
- `CriticalMoments` (new) — horizontal carousel of ranked moments.
- `TheMoment` (new) — the signature interaction (§56).
- `WhyPanel` (new) — the “WHY?” interaction: engine evidence, concept,
  coach explanation, training recommendation (§19).
- `GameStory` (new) — deterministic narrative beats (§22).
- `ReplayMode` (new) — cinematic replay with decision-point pauses (§23).
- `RevealCard` (new) — blunder reveal: predict first, then reveal (§24).
- `ChessDNA` (new) — interactive radial/constellation visualisation with
  per-dimension evidence (§27).
- `RatingTimeline` (new) — interactive trajectory with range zoom (§28).
- `PatternCard` (new) — recurring pattern with evidence and impact (§29).
- `OpeningTree` (new) — interactive repertoire map, strong/weak/unplayed (§30, §31).
- `TrainingSession` (new) — play the position, engine scores it, coach explains (§25).
- `DailyMission` (new) — today's plan with time, difficulty, reason, benefit (§33).
- `Coach` (reworked) — contextual, not a chat: deterministic insight first,
  `SHOW ME` reveals the board variation; engine/fact/coach/training labels (§34–§36).
- `LoadingChoreography` (new) — named, honest states: “Calculating…”,
  “Preparing your explanation…”, “Reconstructing your game…”,
  “Finding the moments that mattered…”, each with a real progress source (§42).
- `EmptyState` (reworked) — a first action, never “No data.” (§43).
- `AtmosphereFX` (new) — the procedural background layer.
- `CursorLayer` (new, desktop only) — contextual cursor: precise default,
  coordinate read-out over the board, inspect affordance over data,
  text-aware over navigation (§13).
- `Sparkline`, `Radar`, `HeatStrip`, `ProgressRing` (new) — small data
  primitives used across Home, Profile and Training (§44).

## 9. Responsive rules

| Breakpoint | Layout |
|---|---|
| ≤479 | single column, 16px gutter, bottom nav, board = `100%` of the column, sheets for secondary content |
| 480–767 | same, board capped at 480px, two-up data tiles |
| 768–1023 | two-column data grids, board ≤ 560px centred, top rail appears, bottom nav persists |
| 1024–1439 | analysis workspace = board column + instrument column; nav becomes the top rail with contextual sub-nav |
| 1440–1599 | content max 1440px, editorial whitespace scale to `--s-9` |
| ≥1600 | 16-column gutters band, board column capped at 640px |

Rules: no horizontal overflow at any width; charts get a fixed logical
`viewBox` and scale with the container; the board never exceeds the shorter
viewport axis on mobile; text never clips (no `nowrap` on user content);
every touch target ≥44px.

## 10. Accessibility contract

- Keyboard: full 64-square board grid with arrow-key roving tabindex, `Enter`
  to select/commit, `Escape` to cancel; arrow-key ply navigation on analysis
  routes; every chart keyboard-operable; visible `:focus-visible` rings at
  every breakpoint.
- Screen readers: route changes announce via a polite live region and update
  `document.title`; played moves are announced; the board exposes square,
  piece and legal-move information; the evaluation graph carries a data
  summary and a table fallback; toasts are `role="status"`.
- Contrast: every app-theme pair and every board theme's coordinate pair is
  asserted by `npm run check:contrast`.
- Motion: `prefers-reduced-motion` **and** an explicit user setting, both
  honoured with a purpose-built reduced experience.
- The honest-source rule survives: coach output is labelled
  `ENGINE FACT` / `COACH INSIGHT` / `TRAINING`, and a deterministic response
  is never presented as model output.
