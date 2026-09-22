import { Chess, type Square } from "chess.js";

/**
 * Deterministic tactical recognition (spec §32).
 *
 * Original implementation. Runs on positions (and candidate moves) — the
 * language model only EXPLAINS these results, it never discovers them.
 *
 * Covered themes (implemented set, extensible):
 *   fork, double-attack, pin, skewer, discovered-check, double-check,
 *   hanging-piece, mate-in-one, back-rank-mate
 */

export type TacticTheme =
  | "fork"
  | "double-attack"
  | "pin"
  | "skewer"
  | "discovered-check"
  | "double-check"
  | "hanging-piece"
  | "mate-in-one"
  | "back-rank-mate";

export type DetectedTactic = {
  theme: TacticTheme;
  squares: Square[];
  description: string;
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const valueOf = (type: string): number => VALUE[type] ?? 0;
const VALUABLE_LABEL: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

type Coord = { file: number; rank: number }; // 0..7

const FILES = "abcdefgh";

function toCoord(square: Square): Coord {
  return { file: FILES.indexOf(square[0]!), rank: Number(square[1]) - 1 };
}

function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

/**
 * Squares attacked by the piece standing on `square` (pseudo-legal geometry,
 * does not account for pin legality of the attacker itself).
 */
export function attacksFrom(chess: Chess, square: Square): Square[] {
  const piece = chess.get(square);
  if (!piece) return [];
  const { file, rank } = toCoord(square);
  const out: Square[] = [];

  const push = (f: number, r: number) => {
    const s = toSquare(f, r);
    if (s) out.push(s);
  };

  if (piece.type === "n") {
    const jumps: Array<[number, number]> = [
      [1, 2], [2, 1], [2, -1], [1, -2],
      [-1, -2], [-2, -1], [-2, 1], [-1, 2],
    ];
    for (const [df, dr] of jumps) push(file + df, rank + dr);
    return out;
  }

  if (piece.type === "k") {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df || dr) push(file + df, rank + dr);
      }
    }
    return out;
  }

  if (piece.type === "p") {
    const dir = piece.color === "w" ? 1 : -1;
    push(file - 1, rank + dir);
    push(file + 1, rank + dir);
    return out;
  }

  const rays: Array<[number, number]> = [];
  if (piece.type === "b" || piece.type === "q") {
    rays.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  }
  if (piece.type === "r" || piece.type === "q") {
    rays.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  }
  for (const [df, dr] of rays) {
    let step = 1;
    while (true) {
      const f = file + df * step;
      const r = rank + dr * step;
      const s = toSquare(f, r);
      if (!s) break;
      out.push(s);
      if (chess.get(s)) break;
      step++;
    }
  }
  return out;
}

/** Union of squares attacked by `color`. */
function attackedBy(chess: Chess, color: "w" | "b"): Map<Square, Square[]> {
  const map = new Map<Square, Square[]>();
  for (const sq of chess.board().flat()) {
    if (!sq || sq.color !== color) continue;
    for (const target of attacksFrom(chess, sq.square)) {
      const list = map.get(target) ?? [];
      list.push(sq.square);
      map.set(target, list);
    }
  }
  return map;
}

function kingSquare(chess: Chess, color: "w" | "b"): Square | null {
  for (const sq of chess.board().flat()) {
    if (sq && sq.type === "k" && sq.color === color) return sq.square;
  }
  return null;
}

type RawDetection = { theme: TacticTheme; squares: Square[]; description: string };

/** Detect tactics in the position AFTER `moveUci` was played. */
export function detectTacticsAfterMove(fenBefore: string, moveUci: string): DetectedTactic[] {
  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return [];
  }

  let move;
  try {
    move = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      promotion: moveUci.length > 4 ? moveUci.slice(4, 5) : undefined,
    });
  } catch {
    return [];
  }
  if (!move) return [];

  const mover = move.color; // 'w' | 'b'
  const opponent: "w" | "b" = mover === "w" ? "b" : "w";
  const results: RawDetection[] = [];

  const oppKing = kingSquare(chess, opponent);
  const inCheck = chess.inCheck();

  // ---- Mate & check family -------------------------------------------
  if (inCheck && oppKing) {
    const anyLegal = chess.moves().length > 0;
    if (!anyLegal) {
      const backRank =
        (opponent === "w" && oppKing[1] === "8") ||
        (opponent === "b" && oppKing[1] === "1");
      const byRookOrQueen = results_hasSlider(chess, mover, oppKing);
      if (backRank && byRookOrQueen) {
        results.push({
          theme: "back-rank-mate",
          squares: [move.to as Square, oppKing],
          description: `Checkmate on the back rank with ${move.san}.`,
        });
      } else {
        results.push({
          theme: "mate-in-one",
          squares: [move.to as Square, oppKing],
          description: `${move.san} delivers checkmate.`,
        });
      }
      return dedupe(results);
    }

    // Double check: king attacked by two pieces.
    const attackers = (attackedBy(chess, mover).get(oppKing) ?? []).filter(
      (sq) => chess.get(sq)?.type !== undefined,
    );
    if (attackers.length >= 2) {
      results.push({
        theme: "double-check",
        squares: [oppKing, ...(attackers as Square[])],
        description: `Double check to the king after ${move.san}.`,
      });
    } else if (attackers[0] !== (move.to as Square)) {
      results.push({
        theme: "discovered-check",
        squares: [attackers[0] ?? oppKing, move.to as Square],
        description: `${move.san} unleashes a discovered check.`,
      });
    }
  }

  // ---- Fork / double attack by the moved piece ------------------------
  const movedSq = move.to as Square;
  const hits: Array<{ sq: Square; type: string }> = [];
  for (const sq of attacksFrom(chess, movedSq)) {
    if (sq === oppKing) {
      hits.push({ sq, type: "k" });
      continue;
    }
    const target = chess.get(sq);
    if (target && target.color === opponent && valueOf(target.type) >= 3) {
      hits.push({ sq, type: target.type });
    }
  }
  if (hits.length >= 2) {
    const labels = hits.slice(0, 3).map((h) => VALUABLE_LABEL[h.type] ?? "piece");
    const pieceType = chess.get(movedSq)?.type;
    const theme: TacticTheme = pieceType === "n" || pieceType === "p" || pieceType === "k"
      ? "fork"
      : "double-attack";
    results.push({
      theme,
      squares: [movedSq, ...hits.map((h) => h.sq)],
      description:
        theme === "fork"
          ? `Knight/piece fork attacking ${labels.join(" and ")}.`
          : `Double attack on ${labels.join(" and ")}.`,
    });
  }

  // ---- Pin / skewer (our slider constraining an enemy piece) ----------
  const pinSkewer = detectPinSkewer(chess, mover, oppKing);
  results.push(...pinSkewer);

  // ---- Hanging pieces (opponent to move, undefended) ------------------
  const ourAttacks = attackedBy(chess, mover);
  const theirDefenses = attackedBy(chess, opponent);
  for (const sq of ourAttacks.keys()) {
    const piece = chess.get(sq);
    if (!piece || piece.color !== opponent) continue;
    if (piece.type === "k") continue;
    const defenders = theirDefenses.get(sq) ?? [];
    const attackersList = ourAttacks.get(sq) ?? [];
    if (attackersList.length > 0 && defenders.length === 0 && valueOf(piece.type) >= 2) {
      results.push({
        theme: "hanging-piece",
        squares: [sq],
        description: `${VALUABLE_LABEL[piece.type]} on ${sq} is hanging — attacked and undefended.`,
      });
    }
  }

  return dedupe(results);
}

/** Is `victim` checked by a rook/queen through the square it sits on? helper for back-rank. */
function results_hasSlider(chess: Chess, color: "w" | "b", victim: Square): boolean {
  const attackers = attackedBy(chess, color).get(victim) ?? [];
  return attackers.some((sq) => {
    const p = chess.get(sq);
    return p && (p.type === "r" || p.type === "q");
  });
}

function detectPinSkewer(chess: Chess, mover: "w" | "b", _oppKing: Square | null): RawDetection[] {
  const out: RawDetection[] = [];
  const opponent: "w" | "b" = mover === "w" ? "b" : "w";
  const directions: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  for (const row of chess.board()) {
    for (const entry of row) {
      if (!entry || entry.color !== mover) continue;
      if (entry.type !== "b" && entry.type !== "r" && entry.type !== "q") continue;
      const { file, rank } = toCoord(entry.square);

      for (const [df, dr] of directions) {
        // Sliding pieces only move along their legal rays.
        const diag = df !== 0 && dr !== 0;
        const straight = df === 0 || dr === 0;
        if (entry.type === "b" && !diag) continue;
        if (entry.type === "r" && !straight) continue;

        const seen: Square[] = [];
        let step = 1;
        let first: Square | null = null;
        while (true) {
          const s = toSquare(file + df * step, rank + dr * step);
          if (!s) break;
          const occupant = chess.get(s);
          if (occupant) {
            if (!first) {
              first = s;
              seen.push(s);
            } else {
              const front = chess.get(first)!;
              if (front.color === opponent) {
                const frontValue = valueOf(front.type);
                const backValue = valueOf(occupant.type);
                if (occupant.type === "k" && first) {
                  out.push({
                    theme: "pin",
                    squares: [entry.square, first, s],
                    description: `Pin: the ${VALUABLE_LABEL[front.type]} on ${first} cannot move without exposing the king.`,
                  });
                } else if (
                  occupant.color === opponent &&
                  frontValue < backValue &&
                  front.type !== "k"
                ) {
                  out.push({
                    theme: "skewer",
                    squares: [entry.square, first, s],
                    description: `Skewer: the ${VALUABLE_LABEL[front.type]} on ${first} is attacked in front of the ${VALUABLE_LABEL[occupant.type]}.`,
                  });
                }
              }
              break;
            }
          }
          step++;
        }
        void seen;
      }
    }
  }
  return out;
}

function dedupe(list: RawDetection[]): DetectedTactic[] {
  const seen = new Set<string>();
  const out: DetectedTactic[] = [];
  for (const item of list) {
    const key = `${item.theme}:${[...item.squares].sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** All themes supported by this detector (for UI filters/tests). */
export const SUPPORTED_THEMES: TacticTheme[] = [
  "fork",
  "double-attack",
  "pin",
  "skewer",
  "discovered-check",
  "double-check",
  "hanging-piece",
  "mate-in-one",
  "back-rank-mate",
];
