import type { GamePhase, KeyMoment, MoveAssessment } from "@/lib/chess/review";

/**
 * Player analytics (brief §59).
 *
 * Pure aggregation over the local game database. Nothing here needs the
 * engine: it works from whatever has been analysed and degrades honestly
 * (counts of `unknown` results, null accuracies) rather than inventing data.
 */

export type PlayerGame = {
  gameId: number;
  /** The player's colour, when it can be determined. */
  color: "w" | "b" | null;
  result: string;
  date?: string;
  opening?: string;
  eco?: string;
  variation?: string;
  timeControl?: string;
  /** PGN `Termination` header, when present. */
  termination?: string;
  /** The player's own rating for this game, when the PGN carried one. */
  elo?: number;
  importedAt?: number;
  accuracy?: number;
  acpl?: number;
  counts?: Record<string, number>;
  moves?: MoveAssessment[];
  moments?: KeyMoment[];
};

export type Outcome = "win" | "loss" | "draw" | "unknown";

export function outcomeOf(result: string, color: "w" | "b" | null): Outcome {
  if (!color) return "unknown";
  if (result === "1-0") return color === "w" ? "win" : "loss";
  if (result === "0-1") return color === "b" ? "win" : "loss";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

export type ColourRecord = {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Score as a percentage (win = 1, draw = 0.5). */
  score: number;
  accuracy: number | null;
  acpl: number | null;
};

export type OpeningRecord = {
  key: string;
  name: string;
  eco?: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  accuracy: number | null;
  acpl: number | null;
  asWhite: number;
  asBlack: number;
  lastPlayedGameId: number;
};

export type RatingPoint = {
  gameId: number;
  date?: string;
  elo: number;
  outcome: Outcome;
  opponentElo?: number;
  opening?: string;
  accuracy?: number;
  result: string;
};

export type TimeBucket = {
  bucket: "bullet" | "blitz" | "rapid" | "classical" | "unknown";
  games: number;
  score: number;
  accuracy: number | null;
};

export type PlayerStats = {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  unknown: number;
  /** Overall score percentage. */
  scorePct: number;
  byColour: { w: ColourRecord; b: ColourRecord };
  openings: OpeningRecord[];
  rating: RatingPoint[];
  accuracySeries: Array<{ gameId: number; date?: string; accuracy: number }>;
  timeBuckets: TimeBucket[];
  phaseAcpl: Record<GamePhase, number | null>;
  errorFrequency: {
    blundersPerGame: number;
    mistakesPerGame: number;
    inaccuraciesPerGame: number;
    gamesWithAnalysis: number;
  };
  recentForm: { wins: number; draws: number; losses: number; games: number };
  streak: { kind: Outcome; length: number };
  accuracyTrend: number | null;
  ratingTrend: number | null;
  bests: {
    accuracy: { value: number; gameId: number } | null;
    rating: number | null;
  };
  /** The one sentence the dashboard leads with. */
  headline: string;
};

function emptyColour(): ColourRecord {
  return { games: 0, wins: 0, draws: 0, losses: 0, score: 0, accuracy: null, acpl: null };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function scorePct(wins: number, draws: number, games: number): number {
  if (games === 0) return 0;
  return Math.round(((wins + draws / 2) / games) * 1000) / 10;
}

/** "600+5" → base seconds; anything unparsable returns null. */
export function parseTimeControl(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+)(?:\+(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function timeBucketOf(value: string | undefined): TimeBucket["bucket"] {
  const seconds = parseTimeControl(value);
  if (seconds === null) return "unknown";
  if (seconds < 180) return "bullet";
  if (seconds < 600) return "blitz";
  if (seconds < 1800) return "rapid";
  return "classical";
}

const TIME_BUCKET_ORDER: TimeBucket["bucket"][] = [
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "unknown",
];

export function computePlayerStats(games: PlayerGame[]): PlayerStats {
  const byColour = { w: emptyColour(), b: emptyColour() };
  const openings = new Map<string, OpeningRecord>();
  const rating: RatingPoint[] = [];
  const accuracySeries: Array<{ gameId: number; date?: string; accuracy: number }> = [];
  const buckets = new Map<TimeBucket["bucket"], { games: number; score: number; acc: number[] }>();
  const phaseTotals: Record<GamePhase, number[]> = { opening: [], middlegame: [], endgame: [] };
  const accuraciesByHalf: number[][] = [[], []];
  const eloByHalf: number[][] = [[], []];

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let unknown = 0;
  let blunders = 0;
  let mistakes = 0;
  let inaccuracies = 0;
  let gamesWithAnalysis = 0;
  let bestAccuracy: { value: number; gameId: number } | null = null;
  const analysed: PlayerGame[] = [];

  for (const game of games) {
    const outcome = outcomeOf(game.result, game.color);
    if (outcome === "win") wins += 1;
    else if (outcome === "loss") losses += 1;
    else if (outcome === "draw") draws += 1;
    else unknown += 1;

    if (game.color) {
      const record = byColour[game.color];
      record.games += 1;
      if (outcome === "win") record.wins += 1;
      else if (outcome === "loss") record.losses += 1;
      else if (outcome === "draw") record.draws += 1;
    }

    if (game.accuracy !== undefined) {
      accuracySeries.push({
        gameId: game.gameId,
        ...(game.date ? { date: game.date } : {}),
        accuracy: game.accuracy,
      });
      if (!bestAccuracy || game.accuracy > bestAccuracy.value) {
        bestAccuracy = { value: game.accuracy, gameId: game.gameId };
      }
    }

    if (game.elo !== undefined && Number.isFinite(game.elo)) {
      rating.push({
        gameId: game.gameId,
        ...(game.date ? { date: game.date } : {}),
        elo: game.elo,
        outcome,
        ...(game.opening ? { opening: game.opening } : {}),
        ...(game.accuracy !== undefined ? { accuracy: game.accuracy } : {}),
        result: game.result,
      });
    }

    if (game.opening) {
      const key = `${game.eco ?? "?"}·${game.opening}`;
      const hasEco = game.eco !== undefined;
      const record: OpeningRecord =
        openings.get(key) ??
        ({
          key,
          name: game.opening,
          ...(hasEco ? { eco: game.eco } : {}),
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          score: 0,
          accuracy: null,
          acpl: null,
          asWhite: 0,
          asBlack: 0,
          lastPlayedGameId: game.gameId,
        });
      record.games += 1;
      if (outcome === "win") record.wins += 1;
      else if (outcome === "loss") record.losses += 1;
      else if (outcome === "draw") record.draws += 1;
      if (game.color === "w") record.asWhite += 1;
      if (game.color === "b") record.asBlack += 1;
      record.lastPlayedGameId = Math.max(record.lastPlayedGameId, game.gameId);
      record.score = scorePct(record.wins, record.draws, record.games);
      openings.set(key, record);
    }

    const bucket = buckets.get(timeBucketOf(game.timeControl)) ?? { games: 0, score: 0, acc: [] };
    bucket.games += 1;
    bucket.score += outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
    if (game.accuracy !== undefined) bucket.acc.push(game.accuracy);
    buckets.set(timeBucketOf(game.timeControl), bucket);

    if (game.moves && game.moves.length > 0) {
      gamesWithAnalysis += 1;
      analysed.push(game);
      for (const move of game.moves) {
        // Only the player's own moves count towards their error rate and their
        // per-phase ACPL: the opponent's blunders are not their mistakes.
        if (game.color && move.mover !== game.color) continue;
        if (move.classification === "blunder") blunders += 1;
        if (move.classification === "mistake") mistakes += 1;
        if (move.classification === "inaccuracy") inaccuracies += 1;
        phaseTotals[move.phase].push(move.cpLoss);
      }
    }
  }

  // Accuracy / ACPL per colour, and the two-half trend.
  const orderedAnalysed = [...analysed].sort((a, b) => a.gameId - b.gameId);
  const perColourAcc: Record<"w" | "b", number[]> = { w: [], b: [] };
  const perColourAcpl: Record<"w" | "b", number[]> = { w: [], b: [] };
  for (const game of analysed) {
    if (game.accuracy !== undefined && game.color) perColourAcc[game.color].push(game.accuracy);
    if (game.acpl !== undefined && game.color) perColourAcpl[game.color].push(game.acpl);
  }
  byColour.w.accuracy = average(perColourAcc.w);
  byColour.b.accuracy = average(perColourAcc.b);
  byColour.w.acpl = average(perColourAcpl.w);
  byColour.b.acpl = average(perColourAcpl.b);
  byColour.w.score = scorePct(byColour.w.wins, byColour.w.draws, byColour.w.games);
  byColour.b.score = scorePct(byColour.b.wins, byColour.b.draws, byColour.b.games);

  // Opening accuracy, from the analysed subset only.
  const openingAccuracy = new Map<string, number[]>();
  for (const game of analysed) {
    if (!game.opening || game.accuracy === undefined) continue;
    const key = `${game.eco ?? "?"}·${game.opening}`;
    const list = openingAccuracy.get(key) ?? [];
    list.push(game.accuracy);
    openingAccuracy.set(key, list);
  }
  for (const record of openings.values()) {
    record.accuracy = average(openingAccuracy.get(record.key) ?? []);
  }

  // Trend: second half of analysed games vs first half.
  if (orderedAnalysed.length >= 4) {
    const half = Math.floor(orderedAnalysed.length / 2);
    orderedAnalysed.forEach((game, index) => {
      const bucket = index < half ? 0 : 1;
      if (game.accuracy !== undefined) accuraciesByHalf[bucket]!.push(game.accuracy);
      if (game.elo !== undefined) eloByHalf[bucket]!.push(game.elo);
    });
  }
  const firstAcc = average(accuraciesByHalf[0]!);
  const lastAcc = average(accuraciesByHalf[1]!);
  const accuracyTrend =
    firstAcc !== null && lastAcc !== null ? Math.round((lastAcc - firstAcc) * 10) / 10 : null;
  const firstElo = average(eloByHalf[0]!);
  const lastElo = average(eloByHalf[1]!);
  const ratingTrend =
    firstElo !== null && lastElo !== null ? Math.round(lastElo - firstElo) : null;

  // Recent form + streak over the last 10 games that have a known outcome.
  const withOutcome = games.filter((game) => outcomeOf(game.result, game.color) !== "unknown");
  const recent = withOutcome.slice(0, 10);
  const recentForm = {
    wins: recent.filter((g) => outcomeOf(g.result, g.color) === "win").length,
    draws: recent.filter((g) => outcomeOf(g.result, g.color) === "draw").length,
    losses: recent.filter((g) => outcomeOf(g.result, g.color) === "loss").length,
    games: recent.length,
  };

  let streakKind: Outcome = "unknown";
  let streakLength = 0;
  for (const game of withOutcome) {
    const outcome = outcomeOf(game.result, game.color);
    if (streakLength === 0) {
      streakKind = outcome;
      streakLength = 1;
    } else if (outcome === streakKind) {
      streakLength += 1;
    } else break;
  }

  const maxRating = rating.length > 0 ? Math.max(...rating.map((point) => point.elo)) : null;

  const stats: PlayerStats = {
    total: games.length,
    wins,
    draws,
    losses,
    unknown,
    scorePct: scorePct(wins, draws, wins + draws + losses),
    byColour,
    openings: [...openings.values()].sort(
      (a, b) => b.games - a.games || b.score - a.score,
    ),
    rating: [...rating].sort((a, b) => a.gameId - b.gameId),
    accuracySeries,
    timeBuckets: TIME_BUCKET_ORDER.map((bucket) => {
      const entry = buckets.get(bucket);
      return {
        bucket,
        games: entry?.games ?? 0,
        score: entry && entry.games > 0 ? Math.round((entry.score / entry.games) * 1000) / 10 : 0,
        accuracy: entry ? average(entry.acc) : null,
      };
    }).filter((entry) => entry.games > 0),
    phaseAcpl: {
      opening: average(phaseTotals.opening),
      middlegame: average(phaseTotals.middlegame),
      endgame: average(phaseTotals.endgame),
    },
    errorFrequency: {
      blundersPerGame: gamesWithAnalysis > 0 ? Math.round((blunders / gamesWithAnalysis) * 10) / 10 : 0,
      mistakesPerGame: gamesWithAnalysis > 0 ? Math.round((mistakes / gamesWithAnalysis) * 10) / 10 : 0,
      inaccuraciesPerGame:
        gamesWithAnalysis > 0 ? Math.round((inaccuracies / gamesWithAnalysis) * 10) / 10 : 0,
      gamesWithAnalysis,
    },
    recentForm,
    streak: { kind: streakKind, length: streakLength },
    accuracyTrend,
    ratingTrend,
    bests: {
      accuracy: bestAccuracy,
      rating: maxRating,
    },
    headline: "",
  };

  stats.headline = buildHeadline(stats);
  return stats;
}

function buildHeadline(stats: PlayerStats): string {
  if (stats.total === 0) return "Import your games and we'll build your chess profile.";
  if (stats.recentForm.games === 0) {
    return `${stats.total} game${stats.total === 1 ? "" : "s"} imported — results and ratings are not recorded in the headers.`;
  }
  const form = `${stats.recentForm.wins}W · ${stats.recentForm.draws}D · ${stats.recentForm.losses}L in your last ${stats.recentForm.games}`;
  if (stats.accuracyTrend !== null && stats.accuracyTrend >= 2) {
    return `${form}. Accuracy is up ${stats.accuracyTrend.toFixed(1)} points over the second half of your analysed games.`;
  }
  if (stats.accuracyTrend !== null && stats.accuracyTrend <= -2) {
    return `${form}. Accuracy has slipped ${Math.abs(stats.accuracyTrend).toFixed(1)} points recently.`;
  }
  if (stats.ratingTrend !== null && stats.ratingTrend !== 0) {
    return `${form}. Rating ${stats.ratingTrend > 0 ? "up" : "down"} ${Math.abs(stats.ratingTrend)} between halves.`;
  }
  return form;
}
