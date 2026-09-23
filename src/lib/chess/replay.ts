import { Chess, type PieceSymbol } from "chess.js";

/**
 * Deterministic move-list replay helpers.
 *
 * Shared by the analysis board, the game review pipeline and the training
 * engine so that "what is the position after ply n" has exactly one
 * implementation.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type ReplayResult = {
  /** fens[0] is the start position; fens[n] is after ply n. */
  fens: string[];
  /** SAN for each played move (may be shorter than the input on a broken list). */
  sans: string[];
  /** UCI actually applied (truncated to the legal prefix). */
  uci: string[];
  /** How many input moves could not be applied. */
  rejected: number;
};

/** Replay a list of UCI moves from a start position. Never throws. */
export function replayLine(startFen: string, uciMoves: string[]): ReplayResult {
  const fens: string[] = [startFen];
  const sans: string[] = [];
  const uci: string[] = [];
  let rejected = 0;

  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return { fens, sans, uci, rejected: uciMoves.length };
  }

  for (const move of uciMoves) {
    try {
      const played = chess.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.length > 4 ? (move.slice(4, 5) as PieceSymbol) : undefined,
      });
      if (!played) {
        rejected += 1;
        continue;
      }
      sans.push(played.san);
      uci.push(move);
      fens.push(chess.fen());
    } catch {
      rejected += 1;
    }
  }

  return { fens, sans, uci, rejected };
}

/** Apply a single UCI move, returning the resulting FEN or null. */
export function applyUci(fen: string, uciMove: string): string | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length > 4 ? (uciMove.slice(4, 5) as PieceSymbol) : undefined,
    });
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

/** Translate a UCI move into SAN for the position it is played from. */
export function uciToSan(fen: string, uciMove: string): string | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length > 4 ? (uciMove.slice(4, 5) as PieceSymbol) : undefined,
    });
    return played ? played.san : null;
  } catch {
    return null;
  }
}

/**
 * Convert a SAN line into UCI moves. Used for the built-in demo game, where
 * authoring SAN by hand is far safer than authoring coordinates.
 */
export function sanLineToUci(startFen: string, sans: string[]): string[] {
  const uci: string[] = [];
  try {
    const chess = new Chess(startFen);
    for (const san of sans) {
      const played = chess.move(san);
      if (!played) break;
      uci.push(`${played.from}${played.to}${played.promotion ?? ""}`);
    }
  } catch {
    /* stop at the first illegal move */
  }
  return uci;
}

/** Full move number for a 1-based ply. */
export function plyToMoveNumber(ply: number): number {
  return Math.ceil(ply / 2);
}

/** "23…Nxd4" style label for a ply, from the moving side's point of view. */
export function plyLabel(ply: number, san: string): string {
  const number = plyToMoveNumber(ply);
  return ply % 2 === 1 ? `${number}. ${san}` : `${number}… ${san}`;
}
