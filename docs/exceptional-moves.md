# Exceptional Move Engine (Phase 2.5)

`src/lib/chess/exceptional.ts`

## The rule this engine exists to enforce

**A best move is not a brilliant move.**

Most chess apps reward the engine's top choice with a star. That makes the
highlight meaningless — in a well-played game almost every move is the top
choice. `brilliant` and `exceptional` here are *evidence classes*: a move earns
one only when this module can name the facts that justify it, and the bar is
high enough that a normal game produces a handful at most, usually none.

## Taxonomy

| Class | Requires |
|---|---|
| `brilliant` | Engine's first choice **and** a sound material sacrifice (≥ 2 pawns) **and** ≤ 2 viable alternatives **and** difficulty ≥ 0.45 **and** confidence ≥ 0.6 |
| `exceptional` | Engine's first choice **and** (a swing ≥ 1.5 pawns **or** the only searched move that held the evaluation from a bad position) **and** difficulty ≥ 0.35 **and** confidence ≥ 0.5 |
| everything else | `brilliant`/`exceptional` are never awarded |

`moveFacts()` is the arbiter for what a move *is*: `brilliant` and `exceptional`
are reported as `null` for a book move, a forced move, any move more than 20cp
off the engine's best, and — deliberately — **any mate-in-one that is not also a
sacrifice**. Finding mate-in-one is not the skill these classes reward.

## The evidence

Every verdict carries an `ExceptionalEvidence` object so the UI and the coach
can show their work rather than assert a label.

| Evidence | Source |
|---|---|
| `isBest` | played UCI vs the engine's `bestMove` |
| `sacrifice.materialGiven` | max of (a) static exchange on the destination square and (b) the deepest material deficit along the engine's own PV |
| `sacrifice.sound` | the mover's evaluation after the opponent's best reply stays ≥ −0.5 pawns |
| `onlyMove` | **no** MultiPV line held the evaluation within 50cp |
| `viableAlternatives` | MultiPV lines that stayed inside the viable band |
| `alternativesAvailable` | whether the search was actually multi-PV, so `onlyMove` is never claimed without data |
| `difficulty` | quiet vs forcing, capture vs check, scarcity, quiet-sacrifice bonus, breadth of legal options |
| `stability` | shallow vs deep agreement on both evaluation and best move |
| `confidence` | how complete the supporting evidence is |
| `reasons` | human-readable sentences built from the fields above; never empty |

### Why two sacrifice signals

`staticExchange` alone misses sacrifices whose point arrives several moves
later, and the PV alone misses the classic "piece stands en prise right now"
case. Taking the maximum of the two is the only version that caught both in
testing.

`staticExchange` (`src/lib/chess/position.ts`) is a bounded, legality-checked
static exchange evaluation: it simulates the capture sequence with real moves
through chess.js, so pins and king safety are respected, and applies the
standard `max(0, captured − recapture)` recurrence so the result is a sound
lower bound. Kings are excluded from the exchange as they cannot be recaptured.

### Why difficulty and confidence are separate

They answer different questions. Difficulty is "how hard is this to find";
confidence is "how much do we actually know". A spectacular sacrifice in a
game analysed only at depth 10 has high difficulty and low confidence, and the
confidence gate stops it being labelled brilliant on thin evidence.

## Where it runs

The deep pass of `analyzeGame`, after the critical-moment plies. That is the
only point in the pipeline where MultiPV lines and both search strengths exist
at once.

Brilliant moves are never *errors*, so the error-oriented `momentKind()` can
never surface them. A separate bounded stage ("brilliant hunt") pre-filters
without the engine — the move must be the best move **and** leave material the
opponent can win on the destination square — then deep-analyses at most
`BRILLIANT_HUNT_MAX` (3) survivors. On mobile that extra cost is two searches
per candidate, bounded.

Confirmed highlights join the same ranked `moments` list as errors, so
**The Moment** can feature a highlight and not only a mistake.

## Downstream

- **Timeline** — `!!` for brilliant, `!` for exceptional, drawn in the single
  analytical accent (`--accent`) rather than a new colour, keeping the palette
  restrained.
- **Training** — `brilliantItemsFromGame()` turns your own brilliant/exceptional
  moves into replay drills, under a bounded budget (default 4 items) so they can
  never crowd out the mistake positions you actually need to repair.
- **Profile** — brilliant plies count toward `bestPlies`, and the counts appear
  in `ClassificationCounts`.
- **Story** — `momentRole()` returns "Brilliant sacrifice" / "Exceptional find".

## Testing

`src/lib/chess/exceptional.test.ts` — 19 tests. The rarity guarantees are
asserted directly: a plain engine-best move, a mate-in-one, a book move and a
forced move all produce `null`; a sound sacrifice produces `brilliant`; the
same sacrifice with an unendorsed evaluation does not.

`src/lib/chess/position.test.ts` — 15 tests covering real legal move counts, the
exchange evaluation (free capture, unprofitable recapture, en prise) and attack
queries.

## Known limitations

- **Material values are the classic 1/3/3/5/9.** Long-term positional
  compensation is not modelled; the engine's evaluation is the only judge of
  whether a sacrifice works.
- **`onlyMove` is "engine-observed".** With MultiPV capped at 2–4 lines, a
  quiet move that also holds the evaluation may not appear. The evidence object
  exposes `alternativesAvailable` so this is visible rather than hidden.
- **The brilliant hunt pre-filter only inspects the destination square.** A
  sacrifice that hangs a piece elsewhere is missed. Raising the numerator is
  easy (`BRILLIANT_HUNT_MAX`) at a linear cost in searches.
- **Difficulty is a heuristic, not a rating.** It is a documented combination of
  forcing-ness and scarcity, not a measured human solve rate.
