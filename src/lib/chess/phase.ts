import { Chess } from "chess.js";

/**
 * Game phase detection + material balance (deterministic, shared by coach,
 * analytics and classification).
 */

const NON_PAWN_MATERIAL: Record<string, number> = {
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const BOARD_SQUARES = [
  "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
  "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
  "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
  "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
  "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
  "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
  "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
  "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
] as const;

const PIECE_POINTS: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Material balance in pawns from White's perspective (kings = 0). */
export function materialBalance(fen: string): number {
  const chess = new Chess(fen);
  let balance = 0;
  for (const square of BOARD_SQUARES) {
    const piece = chess.get(square);
    if (!piece) continue;
    const points = PIECE_POINTS[piece.type] ?? 0;
    balance += piece.color === "w" ? points : -points;
  }
  return balance;
}

/**
 * Phase rules (documented):
 * - opening: first 16 plies (unless most pieces already traded)
 * - endgame: non-pawn material <= 13 (i.e. roughly rook + minor vs rook + minor or less)
 * - otherwise middlegame
 */
export function detectPhase(fen: string, ply: number): "opening" | "middlegame" | "endgame" {
  try {
    const chess = new Chess(fen);
    let nonPawn = 0;
    for (const square of BOARD_SQUARES) {
      const piece = chess.get(square);
      if (!piece || piece.type === "p" || piece.type === "k") continue;
      nonPawn += NON_PAWN_MATERIAL[piece.type] ?? 0;
    }
    if (nonPawn <= 13) return "endgame";
    if (ply <= 16) return "opening";
    return "middlegame";
  } catch {
    return "middlegame";
  }
}
