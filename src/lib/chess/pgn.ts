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
