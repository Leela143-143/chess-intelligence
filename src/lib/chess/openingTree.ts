import { OPENING_INDEX } from "./openings";

/**
 * Personal opening map (brief §31).
 *
 * The tree is built from the player's *own* games: each node is a move that
 * actually occurred in their games, carrying games/score/accuracy. Lines from
 * the built-in index that the player has never tried are appended as
 * `unplayed` hints, so the map shows both the repertoire and the gaps.
 */

export type OpeningTreeNode = {
  /** SAN of the move that leads to this node. */
  san: string;
  /** Ply this move is played on (1-based). */
  ply: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Score percentage (win = 1, draw = 0.5). */
  score: number;
  accuracy: number | null;
  /** Whose move this node belongs to. */
  mover: "w" | "b";
  /** strong = you score well, weak = you leak points, unplayed = never tried. */
  band: "strong" | "neutral" | "weak" | "unplayed";
  children: OpeningTreeNode[];
};

export type OpeningTreeInput = {
  sans: string[];
  /** The player's colour in this game. */
  color: "w" | "b" | null;
  result: string;
  accuracy?: number;
};

function outcomeFor(result: string, color: "w" | "b"): "win" | "loss" | "draw" | "unknown" {
  if (result === "1-0") return color === "w" ? "win" : "loss";
  if (result === "0-1") return color === "b" ? "win" : "loss";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

function bandFor(games: number, score: number): OpeningTreeNode["band"] {
  if (games === 0) return "unplayed";
  if (games >= 2 && score >= 60) return "strong";
  if (score <= 38) return "weak";
  return "neutral";
}

export function buildOpeningTree(
  games: OpeningTreeInput[],
  color: "w" | "b",
  maxPly = 10,
): OpeningTreeNode[] {
  const roots: OpeningTreeNode[] = [];

  const findOrCreate = (
    siblings: OpeningTreeNode[],
    san: string,
    ply: number,
  ): OpeningTreeNode => {
    const existing = siblings.find((node) => node.san === san);
    if (existing) return existing;
    const node: OpeningTreeNode = {
      san,
      ply,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      score: 0,
      accuracy: null,
      mover: ply % 2 === 1 ? "w" : "b",
      band: "unplayed",
      children: [],
    };
    siblings.push(node);
    return node;
  };

  const accuracyTotals = new Map<string, { sum: number; n: number }>();

  for (const game of games) {
    if (game.color !== color) continue;
    const outcome = outcomeFor(game.result, color);
    let siblings = roots;
    const limit = Math.min(maxPly, game.sans.length);
    for (let index = 0; index < limit; index++) {
      const san = game.sans[index]!;
      const ply = index + 1;
      const node = findOrCreate(siblings, san, ply);
      node.games += 1;
      if (outcome === "win") node.wins += 1;
      else if (outcome === "loss") node.losses += 1;
      else if (outcome === "draw") node.draws += 1;
      if (game.accuracy !== undefined) {
        const key = `${ply}:${san}`;
        const entry = accuracyTotals.get(key) ?? { sum: 0, n: 0 };
        entry.sum += game.accuracy;
        entry.n += 1;
        accuracyTotals.set(key, entry);
      }
      siblings = node.children;
    }
  }

  const finalise = (nodes: OpeningTreeNode[]): void => {
    for (const node of nodes) {
      node.score =
        node.games === 0
          ? 0
          : Math.round(((node.wins + node.draws / 2) / node.games) * 1000) / 10;
      const accuracy = accuracyTotals.get(`${node.ply}:${node.san}`);
      node.accuracy = accuracy ? Math.round((accuracy.sum / accuracy.n) * 10) / 10 : null;
      node.band = bandFor(node.games, node.score);
      nodes.sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));
      finalise(node.children);
    }
  };
  finalise(roots);

  // Add index lines the player has never tried, one ply deep, as hints.
  const forColor = OPENING_INDEX.filter((entry) => entry.moves.length > 0);
  for (const entry of forColor) {
    const firstSan = entry.moves[0]!;
    const mover: "w" | "b" = entry.moves.length % 2 === 1 ? "w" : "b";
    if (mover !== color) continue;
    const exists = roots.some((node) => node.san === firstSan);
    if (exists) continue;
    roots.push({
      san: firstSan,
      ply: color === "w" ? 1 : 2,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      score: 0,
      accuracy: null,
      mover: color,
      band: "unplayed",
      children: [],
    });
  }

  // Annotate each played root with untried continuations from the index.
  for (const node of roots) {
    if (node.games === 0) continue;
    const tried = new Set(node.children.map((child) => child.san));
    for (const entry of OPENING_INDEX) {
      if (entry.moves[0] !== node.san) continue;
      const suggestion = entry.moves[1];
      if (!suggestion || tried.has(suggestion)) continue;
      tried.add(suggestion);
      node.children.push({
        san: suggestion,
        ply: 2,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        score: 0,
        accuracy: null,
        mover: color === "w" ? "b" : "w",
        band: "unplayed",
        children: [],
      });
    }
    node.children.sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));
  }

  return roots;
}

/** Summary line for the map header. */
export function openingTreeSummary(nodes: OpeningTreeNode[]): {
  lines: number;
  weak: number;
  unplayed: number;
} {
  let lines = 0;
  let weak = 0;
  let unplayed = 0;
  const walk = (list: OpeningTreeNode[]) => {
    for (const node of list) {
      if (node.games > 0) lines += 1;
      if (node.band === "weak") weak += 1;
      if (node.band === "unplayed") unplayed += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return { lines, weak, unplayed };
}
