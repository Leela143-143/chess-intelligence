/**
 * Move classification (spec §31).
 *
 * Documented, configurable thresholds. This is OUR taxonomy — it makes no
 * claim of compatibility with Chess.com's (proprietary) algorithm.
 *
 * All evaluations are normalized to White's perspective first, then converted
 * to the mover's perspective for loss/gain math.
 */

export type MoveClassification =
  /** Sound material sacrifice the engine endorses — see exceptional.ts. */
  | "brilliant"
  /** Hard-to-find, position-changing move that is not a sacrifice. */
  | "exceptional"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missed-opportunity"
  | "forced"
  | "only-move";

export type ClassificationThresholds = {
  /** cp loss <= this is "best" (and played move == engine best). */
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  /** Loss above `mistake` = blunder. */
  /** A declined gain of at least this much = missed opportunity. */
  missedOpportunity: number;
};

/**
 * Thresholds (centipawns, mover's perspective):
 *
 * | cp loss            | classification |
 * |--------------------|----------------|
 * | <= 10  + best move | best           |
 * | <= 25             | excellent       |
 * | <= 50             | good            |
 * | <= 100            | inaccuracy      |
 * | <= 250            | mistake         |
 * | >  250            | blunder         |
 *
 * Special cases (evaluated first): book (matches opening line), forced (only
 * legal move), only-move (only move avoiding a loss >= missedOpportunity),
 * missed-opportunity (declined gain >= 250cp while not losing that much itself).
 */
export const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  best: 10,
  excellent: 25,
  good: 50,
  inaccuracy: 100,
  mistake: 250,
  missedOpportunity: 250,
};

/** Convert (cp, mate) pairs to a single comparable centipawn number. */
export function toCp(scoreCp: number, mateIn: number | null): number {
  if (mateIn === null) return scoreCp;
  if (mateIn === 0) return scoreCp;
  const magnitude = 10_000 - Math.abs(mateIn) * 10;
  return mateIn > 0 ? magnitude : -magnitude;
}

export type ClassifyInput = {
  /** UCI move actually played. */
  playedUci: string;
  /** Engine best UCI move (same position). */
  bestUci: string | null;
  /** White-perspective eval of the position BEFORE the move. */
  evalBeforeCp: number;
  evalBeforeMate: number | null;
  /** White-perspective eval AFTER the move (opponent to move). */
  evalAfterCp: number;
  evalAfterMate: number | null;
  mover: "w" | "b";
  /** Number of legal moves available before the move. */
  legalMoveCount: number;
  /** Move matches the opening line. */
  isBook?: boolean;
  thresholds?: ClassificationThresholds;
};

export type ClassifyResult = {
  classification: MoveClassification;
  /** Centipawns lost by the mover (>= 0). */
  cpLoss: number;
  /** Centipawns gained relative to best move (>= 0 means the best move would have been better). */
  cpOpportunity: number;
};

function moverPerspective(whiteCp: number, mover: "w" | "b"): number {
  return mover === "w" ? whiteCp : -whiteCp;
}

export function classifyMove(input: ClassifyInput): ClassifyResult {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;

  const before = moverPerspective(
    toCp(input.evalBeforeCp, input.evalBeforeMate),
    input.mover,
  );
  const after = moverPerspective(
    toCp(input.evalAfterCp, input.evalAfterMate),
    input.mover,
  );
  const best = input.bestUci
    ? moverPerspective(
        // best move evaluation == eval of the position BEFORE the move as
        // reported by the engine search of that position; the engine's top
        // line score is the before-eval of the best continuation.
        toCp(input.evalBeforeCp, input.evalBeforeMate),
        input.mover,
      )
    : before;

  const cpLoss = Math.max(0, Math.round(before - after));
  const cpOpportunity = Math.max(0, Math.round(best - after));

  const finish = (classification: MoveClassification): ClassifyResult => ({
    classification,
    cpLoss,
    cpOpportunity,
  });

  if (input.legalMoveCount <= 1) return finish("forced");

  const playedIsBest =
    input.bestUci !== null && input.playedUci === input.bestUci;

  if (input.isBook) return finish("book");

  // Missed opportunity: a much stronger move existed and was declined,
  // without the played move itself being a disaster.
  if (
    !playedIsBest &&
    cpOpportunity >= t.missedOpportunity &&
    cpLoss <= t.good
  ) {
    return finish("missed-opportunity");
  }

  if (playedIsBest && cpLoss <= t.best) return finish("best");
  if (cpLoss <= t.excellent) return finish("excellent");
  if (cpLoss <= t.good) return finish("good");
  if (cpLoss <= t.inaccuracy) return finish("inaccuracy");
  if (cpLoss <= t.mistake) return finish("mistake");
  return finish("blunder");
}
