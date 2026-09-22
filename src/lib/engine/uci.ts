/**
 * UCI protocol line parsing.
 *
 * Stockfish emits lines like:
 *   info depth 16 seldepth 20 multipv 1 score cp 13 nodes 123456 nps 500000 pv e2e4 e7e5 ...
 *   info depth 12 score mate 3 pv ...
 *   bestmove e2e4 ponder e7e5
 */

export type ParsedInfo = {
  depth: number;
  seldepth: number;
  multipv: number;
  scoreCp: number | null;
  mateIn: number | null;
  nodes: number;
  timeMs: number;
  nps: number;
  pv: string[];
};

export type ParsedBestMove = {
  bestMove: string | null;
  ponder: string | null;
};

function readNumber(tokens: string[], keyword: string): number | null {
  const i = tokens.indexOf(keyword);
  if (i === -1 || i + 1 >= tokens.length) return null;
  const n = Number(tokens[i + 1]);
  return Number.isFinite(n) ? n : null;
}

function readString(tokens: string[], keyword: string): string | null {
  const i = tokens.indexOf(keyword);
  if (i === -1 || i + 1 >= tokens.length) return null;
  return tokens[i + 1] ?? null;
}

/** Parse an `info ...` line. Returns null for lines without a score (e.g. string/currmove info). */
export function parseInfoLine(line: string): ParsedInfo | null {
  if (!line.startsWith("info ")) return null;
  const tokens = line.split(/\s+/);

  const scoreIdx = tokens.indexOf("score");
  if (scoreIdx === -1) return null;

  const scoreType = tokens[scoreIdx + 1];
  const scoreValue = Number(tokens[scoreIdx + 2]);
  if ((scoreType !== "cp" && scoreType !== "mate") || !Number.isFinite(scoreValue)) {
    return null;
  }

  const pvIdx = tokens.indexOf("pv");
  const pv = pvIdx === -1 ? [] : tokens.slice(pvIdx + 1).filter(isUciMove);

  return {
    depth: readNumber(tokens, "depth") ?? 0,
    seldepth: readNumber(tokens, "seldepth") ?? 0,
    multipv: readNumber(tokens, "multipv") ?? 1,
    scoreCp: scoreType === "cp" ? scoreValue : null,
    mateIn: scoreType === "mate" ? scoreValue : null,
    nodes: readNumber(tokens, "nodes") ?? 0,
    timeMs: readNumber(tokens, "time") ?? 0,
    nps: readNumber(tokens, "nps") ?? 0,
    pv,
  };
}

const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function isUciMove(token: string): boolean {
  return UCI_MOVE_RE.test(token);
}

/** Parse a `bestmove ...` line. */
export function parseBestMoveLine(line: string): ParsedBestMove | null {
  if (!line.startsWith("bestmove")) return null;
  const tokens = line.split(/\s+/);
  const raw = tokens[1];
  const bestMove = raw && raw !== "(none)" && isUciMove(raw) ? raw : null;
  const ponder = readString(tokens, "ponder");
  return { bestMove, ponder: ponder && isUciMove(ponder) ? ponder : null };
}

/**
 * Normalize an evaluation to White's perspective.
 * Stockfish reports scores relative to the side to move.
 */
export function normalizeToWhite(
  scoreCp: number,
  mateIn: number | null,
  sideToMove: "w" | "b",
): { scoreCp: number; mateIn: number | null } {
  if (sideToMove === "w") return { scoreCp, mateIn };
  const mate = mateIn === null || mateIn === 0 ? mateIn : -mateIn;
  const flipped = -scoreCp;
  return { scoreCp: flipped === 0 ? 0 : flipped, mateIn: mate };
}

/** Extract side-to-move from a FEN. Defaults to white on malformed input. */
export function sideToMoveFromFen(fen: string): "w" | "b" {
  const parts = fen.trim().split(/\s+/);
  return parts[1] === "b" ? "b" : "w";
}
