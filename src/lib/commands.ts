import type { PlayerGame } from "./player/stats";
import { outcomeOf } from "./player/stats";

/**
 * Command centre (brief §39) — search *your chess*, not a hardcoded list.
 *
 * Natural-language-ish intents are parsed deterministically into either a
 * navigation or a game filter. No model is involved; every result is a real
 * query against the local database.
 */

export type GameFilter = {
  /** Human label, e.g. "Losses". */
  label: string;
  /** Serialised form used in the hash query string. */
  token: string;
  test: (game: PlayerGame, index: number) => boolean;
};

export type CommandResult = {
  id: string;
  label: string;
  kind: "navigate" | "filter" | "action";
  detail?: string;
  run: () => void;
};

const RESULT_WORDS: Record<string, "win" | "loss" | "draw"> = {
  win: "win",
  wins: "win",
  won: "win",
  victory: "win",
  victories: "win",
  loss: "loss",
  losses: "loss",
  lost: "loss",
  defeat: "loss",
  defeats: "loss",
  draw: "draw",
  draws: "draw",
  drawn: "draw",
};

/** Parse a free-text query into zero or more filters. */
export function parseFilters(query: string): GameFilter[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  const filters: GameFilter[] = [];
  const words = text.split(/[^a-z0-9+#]+/).filter(Boolean);

  for (const word of words) {
    const outcome = RESULT_WORDS[word];
    if (outcome) {
      filters.push(makeOutcomeFilter(outcome));
      break;
    }
  }

  if (/\bwhite\b/.test(text)) filters.push(colourFilter("w"));
  if (/\bblack\b/.test(text)) filters.push(colourFilter("b"));

  // "blundered after move 30" / "mistakes after move 25"
  const moveMatch = /after\s+move\s+(\d+)/.exec(text);
  if (moveMatch) {
    const fromMove = Number(moveMatch[1]);
    filters.push(blunderAfterFilter(fromMove));
  } else if (/blunder/.test(text)) {
    filters.push(blunderFilter());
  }

  if (/\bendgame/.test(text)) filters.push(endgameFilter());
  if (/\bopening\b/.test(text) && !/worse|worst|best/.test(text)) filters.push(taggedFilter("Opening phase leaks"));

  const accuracyBelow = /accuracy\s*(?:under|below|<)\s*(\d+)/.exec(text);
  if (accuracyBelow) {
    const value = Number(accuracyBelow[1]);
    filters.push({
      label: `Accuracy under ${value}%`,
      token: `acc<${value}`,
      test: (game) => game.accuracy !== undefined && game.accuracy < value,
    });
  }

  // Opening names: match any multi-word chunk against the stored opening.
  if (/sicilian|french|caro|ruy|italian|london|queen|king|english|dutch|nimzo|catalan|grunfeld|grünfeld|scotch|petrov|vienna|gambit/.test(text)) {
    const term = words.find((word) =>
      /^(sicilian|french|caro|ruy|italian|london|queen|king|english|dutch|nimzo|catalan|grunfeld|grünfeld|scotch|petrov|vienna|gambit|indian|slav)$/.test(word),
    );
    if (term) {
      filters.push({
        label: `Opening: ${term}`,
        token: `opening:${term}`,
        test: (game) => (game.opening ?? "").toLowerCase().includes(term),
      });
    }
  }

  if (/worst|biggest/.test(text) && /\bendgame\b/.test(text)) {
    filters.push(endgameFilter());
  }

  return dedupe(filters);
}

function dedupe(filters: GameFilter[]): GameFilter[] {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    if (seen.has(filter.token)) return false;
    seen.add(filter.token);
    return true;
  });
}

function makeOutcomeFilter(outcome: "win" | "loss" | "draw"): GameFilter {
  return {
    label: `${outcome[0]!.toUpperCase()}${outcome.slice(1)}es`,
    token: `result:${outcome}`,
    test: (game) => outcomeOf(game.result, game.color) === outcome,
  };
}

function colourFilter(color: "w" | "b"): GameFilter {
  return {
    label: color === "w" ? "As White" : "As Black",
    token: `colour:${color}`,
    test: (game) => game.color === color,
  };
}

function blunderFilter(): GameFilter {
  return {
    label: "Games with a blunder",
    token: "blunder:any",
    test: (game) => (game.moves ?? []).some((move) => move.classification === "blunder"),
  };
}

function blunderAfterFilter(fromMove: number): GameFilter {
  return {
    label: `Blunders after move ${fromMove}`,
    token: `blunder:after:${fromMove}`,
    test: (game) =>
      (game.moves ?? []).some(
        (move) => move.classification === "blunder" && Math.ceil(move.ply / 2) > fromMove,
      ),
  };
}

function endgameFilter(): GameFilter {
  return {
    label: "Games with endgame errors",
    token: "phase:endgame",
    test: (game) =>
      (game.moves ?? []).some(
        (move) =>
          move.phase === "endgame" &&
          (move.classification === "blunder" || move.classification === "mistake"),
      ),
  };
}

function taggedFilter(label: string): GameFilter {
  return { label, token: "phase:opening", test: (game) => (game.moves ?? []).length > 0 };
}

/** Serialise filters into the hash query, and back again. */
export function serialiseFilters(filters: GameFilter[]): string {
  if (filters.length === 0) return "";
  return filters.map((filter) => filter.token).join(",");
}

export function filtersFromToken(token: string | null): GameFilter[] {
  if (!token) return [];
  return dedupe(token.split(",").flatMap((piece) => filterFromOne(piece)));
}

function filterFromOne(token: string): GameFilter[] {
  const [head, ...rest] = token.split(":");
  if (head === "result") {
    const outcome = rest[0];
    if (outcome === "win" || outcome === "loss" || outcome === "draw") {
      return [makeOutcomeFilter(outcome)];
    }
  }
  if (head === "colour") {
    const color = rest[0];
    if (color === "w" || color === "b") return [colourFilter(color)];
  }
  if (head === "blunder") {
    if (rest[0] === "any") return [blunderFilter()];
    if (rest[0] === "after" && rest[1]) return [blunderAfterFilter(Number(rest[1]))];
  }
  if (head === "phase") {
    if (rest[0] === "endgame") return [endgameFilter()];
    if (rest[0] === "opening") return [taggedFilter("Opening phase leaks")];
  }
  if (head === "acc" && rest[0]?.startsWith("<")) {
    const value = Number(rest[0].slice(1));
    if (Number.isFinite(value)) {
      return [
        {
          label: `Accuracy under ${value}%`,
          token,
          test: (game) => game.accuracy !== undefined && game.accuracy < value,
        },
      ];
    }
  }
  if (head === "opening" && rest[0]) {
    const term = rest.join(":");
    return [
      {
        label: `Opening: ${term}`,
        token,
        test: (game) => (game.opening ?? "").toLowerCase().includes(term),
      },
    ];
  }
  return [];
}

export function applyFilters(games: PlayerGame[], filters: GameFilter[]): PlayerGame[] {
  if (filters.length === 0) return games;
  return games.filter((game, index) =>
    filters.every((filter) => filter.test(game, index)),
  );
}

/** Result commands for the palette, given the current query and data. */
export function buildGameCommands(
  query: string,
  games: PlayerGame[],
  navigateTo: (hash: string) => void,
): CommandResult[] {
  const text = query.trim().toLowerCase();
  if (text.length < 3) return [];

  const filters = parseFilters(text);
  const results: CommandResult[] = [];

  if (filters.length > 0) {
    const matched = applyFilters(games, filters);
    results.push({
      id: "filter-apply",
      label: `Show ${filters.map((filter) => filter.label.toLowerCase()).join(" + ")}`,
      kind: "filter",
      detail: `${matched.length} of ${games.length} games`,
      run: () => navigateTo(`#/games?f=${encodeURIComponent(serialiseFilters(filters))}`),
    });
  }

  // Direct game matches by player or opening name.
  const nameMatches = games
    .filter((game) => (game.opening ?? "").toLowerCase().includes(text))
    .slice(0, 4);
  for (const game of nameMatches) {
    results.push({
      id: `game-${game.gameId}`,
      label: game.opening ?? `Game ${game.gameId}`,
      kind: "navigate",
      detail: `${game.result}${game.date ? ` · ${game.date}` : ""}`,
      run: () => navigateTo(`#/game/${game.gameId}`),
    });
  }

  if (/training|practice|puzzle|today/.test(text)) {
    results.push({
      id: "intent-training",
      label: "Start today's training",
      kind: "action",
      detail: "Built from your own mistakes",
      run: () => navigateTo("#/training"),
    });
  }
  if (/analys|position|board/.test(text)) {
    results.push({
      id: "intent-analyse",
      label: "Open the analysis board",
      kind: "action",
      run: () => navigateTo("#/board"),
    });
  }
  if (/profile|dna|weakness|progress/.test(text)) {
    results.push({
      id: "intent-profile",
      label: "Open your chess profile",
      kind: "action",
      run: () => navigateTo("#/profile"),
    });
  }
  if (/import|pgn/.test(text)) {
    results.push({
      id: "intent-import",
      label: "Import games",
      kind: "action",
      run: () => navigateTo("#/games"),
    });
  }

  return results;
}

/** Ready-made questions shown as a hint row in the palette. */
export const SUGGESTED_QUERIES = [
  "Show my last loss",
  "Find my Sicilian games",
  "Show games where I blundered after move 30",
  "Open my worst endgame",
  "Start today's training",
];
