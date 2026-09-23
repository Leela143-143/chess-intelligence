import { Chess, type Square } from "chess.js";

/**
 * Position facts (spec §31–§32, Phase 2.5).
 *
 * Pure chess-rules queries used by classification, the exceptional-move
 * engine, the tactic detector and the coach context. Kept out of the React
 * layer and out of `analysis.ts` so every caller agrees on the same numbers.
 *
 * Everything here is deterministic and derives only from the position itself.
 */

/** Piece values in pawns. Kings are excluded from all material math. */
export const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Number of legal moves in a position.
 *
 * Replaces the previous hardcoded `20` fallback that silently mislabelled
 * positions as "forced" or "not forced". The fallback is only used when the
 * FEN itself is unparseable, and callers can detect that case by passing an
 * explicit `fallback: null`.
 */
export function legalMoveCountOf(fen: string, fallback: number | null = 20): number | null {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves();
    // A parsed position always has at least a king, so 0 means checkmate or
    // stalemate — a genuinely forced situation, not a parse failure.
    return moves.length;
  } catch {
    return fallback;
  }
}

/** True when the position is checkmate or stalemate (no legal move). */
export function isTerminal(fen: string): boolean {
  try {
    return new Chess(fen).moves().length === 0;
  } catch {
    return false;
  }
}

/** Material total for one side, in pawns. */
export function materialFor(fen: string, side: "w" | "b"): number {
  try {
    const chess = new Chess(fen);
    let sum = 0;
    for (const row of chess.board()) {
      for (const square of row) {
        if (square && square.color === side) sum += PIECE_VALUE[square.type] ?? 0;
      }
    }
    return sum;
  } catch {
    return 0;
  }
}

/** Signed material balance in pawns, from White's perspective. */
export function materialBalance(fen: string): number {
  return materialFor(fen, "w") - materialFor(fen, "b");
}

type Attacker = { from: Square; promotion?: "q" | "r" | "b" | "n" };

/**
 * Cheapest *legal* attacker of `square` for `side`.
 *
 * Uses chess.js `attackers()`, then filters by legality — a pinned piece that
 * cannot legally capture is rejected, which a purely geometric attack map
 * would get wrong.
 */
function cheapestAttacker(chess: Chess, square: Square, side: "w" | "b"): Attacker | null {
  let best: Attacker | null = null;
  let bestValue = Number.POSITIVE_INFINITY;

  for (const from of chess.attackers(square, side)) {
    const piece = chess.get(from);
    // Kings are excluded: SEE models piece *exchanges*, and a king can never
    // be recaptured, so including it would distort the sequence.
    if (!piece || piece.type === "k") continue;
    const promotion: Attacker["promotion"] =
      piece.type === "p" && (square[1] === "8" || square[1] === "1") ? "q" : undefined;
    try {
      const probe = new Chess(chess.fen());
      probe.move({ from, to: square, promotion });
    } catch {
      continue; // illegal: pinned, or exposes the king
    }
    const value = PIECE_VALUE[piece.type] ?? 0;
    if (value < bestValue) {
      bestValue = value;
      best = { from, promotion };
    }
  }
  return best;
}

/**
 * Bounded static exchange evaluation.
 *
 * Returns the material gain (pawns) `bySide` nets if *it* starts the exchange
 * on `square`, assuming both sides always recapture with the cheapest legal
 * attacker. Uses the standard SEE recurrence `max(0, captured - recapture)`,
 * so the result is a sound lower bound and a capture that cannot be profitably
 * followed up reports 0.
 *
 * The sequence is simulated with legal moves rather than pure geometry, so
 * pins and king safety are respected.
 */
export function staticExchange(fen: string, square: Square, bySide: "w" | "b"): number {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return 0;
  }
  if (!chess.get(square)) return 0;
  return seeRec(chess, square, bySide, 0);
}

function seeRec(chess: Chess, square: Square, side: "w" | "b", depth: number): number {
  if (depth >= 8) return 0;
  const victim = chess.get(square);
  if (!victim || victim.type === "k") return 0;

  const attacker = cheapestAttacker(chess, square, side);
  if (!attacker) return 0;

  const captured = PIECE_VALUE[victim.type] ?? 0;
  const next = new Chess(chess.fen());
  try {
    next.move({ from: attacker.from, to: square, promotion: attacker.promotion });
  } catch {
    return 0;
  }

  const other = side === "w" ? "b" : "w";
  const recapture = seeRec(next, square, other, depth + 1);
  return Math.max(0, captured - recapture);
}

/** Is `square` attacked by `bySide` in this position? */
export function isAttackedBy(fen: string, square: Square, bySide: "w" | "b"): boolean {
  try {
    return new Chess(fen).isAttacked(square, bySide);
  } catch {
    return false;
  }
}
