import { Chess } from "chess.js";

/**
 * PGN / FEN import (spec §26–27, §83).
 *
 * Security: bounded file sizes, bounded game counts, bounded headers and
 * plies, control-character stripping, no HTML ever rendered from metadata
 * (React escapes everything; we additionally sanitize header values).
 */

export const MAX_PGN_BYTES = 5_000_000; // 5 MB per import
export const MAX_GAMES_PER_IMPORT = 500;
export const MAX_HEADER_LENGTH = 300;
export const MAX_PLIES_PER_GAME = 1_000;

export type PgnHeaders = {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  timeControl?: string;
  whiteElo?: string;
  blackElo?: string;
  termination?: string;
  eco?: string;
 fen?: string;
};

export type ImportedMove = {
  san: string;
  uci: string;
  fenAfter: string;
};

export type ImportedGame = {
  headers: PgnHeaders;
  sanList: string[];
  uciList: string[];
  moves: ImportedMove[];
  finalFen: string | null;
  result: string;
  pgn: string;
  /**
   * Seconds remaining on the mover's clock after each ply, from `[%clk ...]`
   * annotations. `null` where the source PGN carries no clock for that ply.
   * This is the only genuine source of time-management evidence — without it
   * the profile must stay provisional rather than invent numbers.
   */
  clocks: Array<number | null>;
};

export type PgnImportError = {
  index: number;
  message: string;
};

export type PgnImportResult = {
  games: ImportedGame[];
  errors: PgnImportError[];
  truncated: boolean;
};

/** Strip control characters (except tab/newline) and cap length. */
function sanitizeText(value: string, max = MAX_HEADER_LENGTH): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, max);
}

function normalize(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/\uFEFF/g, "");
}

const CLOCK_RE = /\[%clk\s+(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)\s*\]/;

/**
 * Extract per-ply clock annotations (`{[%clk 0:04:12]}`) from a game chunk.
 *
 * Walks the movetext token by token so comments are attached to the move they
 * actually follow. Variations in parentheses and `;` line comments are
 * skipped, because clocks inside them describe alternative lines and would
 * otherwise shift every subsequent ply.
 *
 * Returns an array aligned to ply index (0 = White's first move) with `null`
 * for plies the PGN does not annotate, so a partially-annotated game is still
 * usable.
 */
export function extractClocks(gameChunk: string): Array<number | null> {
  const text = normalize(gameChunk);
  const clocks: Array<number | null> = [];
  let ply = 0;
  let variationDepth = 0;

  // Strip header lines; only the movetext carries clock annotations.
  const body = text.replace(/^\s*\[[^\]]*\]\s*$/gm, " ");

  // Parentheses and braces must always become their own tokens: a greedy
  // `\S+` would swallow `d5)` whole and the variation would never be seen to
  // close, silently dropping every clock after it.
  const tokenRe = /\{[^}]*\}|[()]|;[^\n]*|[^\s(){};]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(body)) !== null) {
    const token = match[0];

    if (token === "(") {
      variationDepth += 1;
      continue;
    }
    if (token === ")") {
      variationDepth = Math.max(0, variationDepth - 1);
      continue;
    }
    if (token.startsWith(";")) continue;

    if (token.startsWith("{")) {
      // A comment belongs to the move just played — ignore it inside a variation.
      if (variationDepth > 0) continue;
      const clock = CLOCK_RE.exec(token);
      if (clock && ply > 0) {
        const seconds =
          Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
        clocks[ply - 1] = seconds;
      }
      continue;
    }

    if (variationDepth > 0) continue;
    // Move numbers ("12.", "12..."), NAGs ("$14") and results carry no ply.
    if (/^\d+\.+$/.test(token)) continue;
    if (/^\$\d+$/.test(token)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) continue;

    ply += 1;
    if (clocks.length < ply) clocks.push(null);
  }

  return clocks;
}

/**
 * Split a multi-game PGN document into individual game chunks.
 * Games start at an `[Event ` tag when preceded by a blank line (or doc start).
 */
export function splitPgnGames(pgn: string): string[] {
  const text = normalize(pgn);
  const chunks: string[] = [];
  let lastIndex = 0;

  // Split before every `[Event ` that starts a line. The match consumes the
  // preceding newline, so matches are always ≥1 char (no zero-length loop).
  const re = /\n(?=\[Event )/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const splitAt = match.index + match[0].length;
    if (splitAt > lastIndex) {
      chunks.push(text.slice(lastIndex, splitAt));
      lastIndex = splitAt;
    }
    re.lastIndex = splitAt; // guarantee forward progress
  }
  chunks.push(text.slice(lastIndex));
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

function readHeader(
  headers: Record<string, string | null>,
  tag: string,
): string | undefined {
  const value = headers[tag];
  return value ? sanitizeText(value) : undefined;
}

/** Parse one game chunk. Returns null when the chunk is not a valid game. */
export function parseSinglePgn(chunk: string): ImportedGame | null {
  if (chunk.length > MAX_PGN_BYTES) return null;
  try {
    const chess = new Chess();
    chess.loadPgn(normalize(chunk));
    const history = chess.history({ verbose: true });
    const allHeaders: Record<string, string | null> = chess.header();
    if (history.length === 0 && !allHeaders["FEN"]) return null;
    if (history.length > MAX_PLIES_PER_GAME) return null;

    const headers: PgnHeaders = {};
    const pairs: Array<[keyof PgnHeaders, string]> = [
      ["event", "Event"],
      ["site", "Site"],
      ["date", "Date"],
      ["round", "Round"],
      ["white", "White"],
      ["black", "Black"],
      ["result", "Result"],
      ["timeControl", "TimeControl"],
      ["whiteElo", "WhiteElo"],
      ["blackElo", "BlackElo"],
      ["termination", "Termination"],
      ["eco", "ECO"],
      ["fen", "FEN"],
    ];
    for (const [key, tag] of pairs) {
      const value = readHeader(allHeaders, tag);
      if (value) headers[key] = value;
    }

    const uciList = history.map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
    const sanList = history.map((m) => m.san);
    const result = headers.result ?? "*";

    return {
      headers,
      sanList,
      uciList,
      moves: [],
      finalFen: null,
      result,
      pgn: sanitizeText(normalize(chunk), MAX_PGN_BYTES),
      clocks: extractClocks(chunk).slice(0, history.length),
    };
  } catch {
    return null;
  }
}

/**
 * Import a PGN document (file text or pasted text).
 * Collects per-game errors instead of failing the whole import.
 */
export function importPgn(raw: string): PgnImportResult {
  if (raw.length > MAX_PGN_BYTES) {
    return {
      games: [],
      errors: [{ index: -1, message: `PGN exceeds ${MAX_PGN_BYTES} bytes.` }],
      truncated: false,
    };
  }

  const chunks = splitPgnGames(raw);
  const games: ImportedGame[] = [];
  const errors: PgnImportError[] = [];
  let truncated = false;

  chunks.forEach((chunk, index) => {
    if (games.length >= MAX_GAMES_PER_IMPORT) {
      truncated = true;
      return;
    }
    const game = parseSinglePgn(chunk);
    if (game) {
      games.push(game);
    } else {
      errors.push({ index, message: "Could not parse game (invalid or empty PGN)." });
    }
  });

  return { games, errors, truncated };
}

/** Validate a FEN string by attempting to load it. */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen.trim());
    return true;
  } catch {
    return false;
  }
}
