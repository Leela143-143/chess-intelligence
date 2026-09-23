import type { GamePhase, KeyMoment, MoveAssessment } from "./review";
import type { TacticTheme } from "./tactics";

/**
 * Chess DNA + recurring patterns (brief §27, §29).
 *
 * Ten axes, each computed from a *different* measurement of the player's own
 * moves so the radar is not one number drawn ten ways. Every axis carries its
 * evidence count and a plain-language evidence string, and axes with too
 * little data say so instead of inventing a score (brief §70, §71).
 */

export type DnaDimensionId =
  | "tactics"
  | "calculation"
  | "position"
  | "opening"
  | "endgame"
  | "defense"
  | "kingSafety"
  | "initiative"
  | "timeManagement"
  | "conversion";

export type DnaDimension = {
  id: DnaDimensionId;
  label: string;
  /** 0–100, higher is better. */
  score: number;
  /** Plain-language evidence, always with a count. */
  evidence: string;
  /** Number of moves or positions the score is based on. */
  sample: number;
  /** Change vs the earlier half of the imported games, when available. */
  delta?: number;
  /** True when the axis had too little data to be meaningful. */
  provisional: boolean;
};

export type ChessDna = {
  dimensions: DnaDimension[];
  gamesUsed: number;
  movesUsed: number;
  generatedAt: number;
  /** The single sentence the profile leads with. */
  headline: string;
  strengths: DnaDimensionId[];
  weaknesses: DnaDimensionId[];
};

/** One reviewed game, reduced to what Chess DNA needs. */
export type DnaGame = {
  gameId: number;
  color: "w" | "b" | null;
  result: string;
  opening?: string;
  timeControl?: string;
  /** PGN `Termination` header — the only reliable time-forfeit signal. */
  termination?: string;
  importedAt?: number;
  moves: MoveAssessment[];
  moments: KeyMoment[];
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** The player's own moves in one game (empty when the colour is unknown). */
function ownMoves(game: DnaGame): MoveAssessment[] {
  if (!game.color) return [];
  return game.moves.filter((move) => move.mover === game.color);
}

function resultFor(result: string, color: "w" | "b"): "win" | "loss" | "draw" | "unknown" {
  if (result === "1-0") return color === "w" ? "win" : "loss";
  if (result === "0-1") return color === "b" ? "win" : "loss";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

function fromPerspective(cp: number, color: "w" | "b"): number {
  return color === "w" ? cp : -cp;
}

/* ------------------------------------------------------------ raw measures */

export type DnaMeasures = {
  gamesUsed: number;
  movesUsed: number;
  middlegameAcpl: number;
  sharpAcpl: number;
  sharpCount: number;
  quietErrorAcpl: number;
  quietErrorCount: number;
  openingAcpl: number;
  openingPlies: number;
  bookRate: number;
  endgameAcpl: number;
  endgamePlies: number;
  worseAcpl: number;
  worseCount: number;
  allowedCheckRate: number;
  checkCount: number;
  avgGainPawns: number;
  timeControlGames: number;
  timeoutLosses: number;
  /** Phase 2.5: your moves that carried a real clock reading. */
  clockPlies: number;
  /** Errors per 100 timed moves. */
  clockErrorRate: number | null;
  /** Timed moves played with 30s or less on the clock. */
  lowTimeMoves: number;
  lowTimeErrors: number;
  /** Errors per 100 moves played short of time. */
  lowTimeErrorRate: number | null;
  /** Errors per 100 timed moves played with time in hand. */
  comfortableErrorRate: number | null;
  /** Average seconds per move, across timed moves. */
  avgThinkSeconds: number | null;
  winningPositions: number;
  winningConverted: number;
  blunderRate: number;
  bestRate: number;
  moves: number;
};

export function computeMeasures(games: DnaGame[]): DnaMeasures {
  const middlegame: number[] = [];
  const sharp: number[] = [];
  const quietErrors: number[] = [];
  const opening: number[] = [];
  const endgame: number[] = [];
  const worse: number[] = [];
  const gains: number[] = [];
  let book = 0;
  let total = 0;
  let checks = 0;
  let checkConsidered = 0;
  let blunders = 0;
  let bests = 0;
  let timeControlGames = 0;
  let timeoutLosses = 0;
  let winningPositions = 0;
  let winningConverted = 0;
  // Phase 2.5 clock evidence — only counted for moves we can attribute to the
  // player and that actually carry a clock reading.
  let clockPlies = 0;
  let clockErrors = 0;
  let lowTimeMoves = 0;
  let lowTimeErrors = 0;
  let comfortableMoves = 0;
  let comfortableErrors = 0;
  let thinkSecondsTotal = 0;
  const LOW_TIME_SECONDS = 30;
  const COMFORTABLE_SECONDS = 60;

  for (const game of games) {
    const own = ownMoves(game);
    if (own.length === 0) continue;
    for (const move of own) {
      total += 1;
      if (move.phase === "middlegame") middlegame.push(move.cpLoss);
      if (move.phase === "opening") opening.push(move.cpLoss);
      if (move.phase === "endgame") endgame.push(move.cpLoss);
      if (move.cpOpportunity >= 120) sharp.push(move.cpLoss);
      if (
        (move.classification === "inaccuracy" || move.classification === "mistake") &&
        move.motifs.length === 0 &&
        move.cpLoss >= 60
      ) {
        quietErrors.push(move.cpLoss);
      }
      if (fromPerspective(move.evalBeforeCp, move.mover) < -50) worse.push(move.cpLoss);
      if (move.classification === "book") book += 1;
      if (move.classification === "blunder") blunders += 1;
      if (move.classification === "best" || move.classification === "only-move") bests += 1;
      if (game.color) {
        checkConsidered += 1;
        if (move.allowedCheck) checks += 1;
      }
      gains.push(
        fromPerspective(move.evalAfterCp - move.evalBeforeCp, move.mover) / 100,
      );

      // Clock evidence. `thinkSeconds` is only ever set from a real `%clk`
      // annotation, so nothing here is inferred.
      if (typeof move.thinkSeconds === "number") {
        clockPlies += 1;
        thinkSecondsTotal += move.thinkSeconds;
        const isError =
          move.classification === "inaccuracy" ||
          move.classification === "mistake" ||
          move.classification === "blunder" ||
          move.classification === "missed-opportunity";
        if (isError) clockErrors += 1;
        const remaining = move.clockSeconds;
        if (typeof remaining === "number") {
          if (remaining <= LOW_TIME_SECONDS) {
            lowTimeMoves += 1;
            if (isError) lowTimeErrors += 1;
          } else if (remaining >= COMFORTABLE_SECONDS) {
            comfortableMoves += 1;
            if (isError) comfortableErrors += 1;
          }
        }
      }
    }

    if (game.color) {
      if (game.timeControl) timeControlGames += 1;
      if (
        game.termination &&
        /time/i.test(game.termination) &&
        resultFor(game.result, game.color) === "loss"
      ) {
        timeoutLosses += 1;
      }
      const peak = Math.max(
        ...own.map((move) => fromPerspective(move.evalAfterCp, game.color as "w" | "b")),
      );
      if (peak >= 150) {
        winningPositions += 1;
        if (resultFor(game.result, game.color) === "win") winningConverted += 1;
      }
    }
  }

  return {
    gamesUsed: games.filter((game) => ownMoves(game).length > 0).length,
    movesUsed: total,
    middlegameAcpl: mean(middlegame),
    sharpAcpl: mean(sharp),
    sharpCount: sharp.length,
    quietErrorAcpl: mean(quietErrors),
    quietErrorCount: quietErrors.length,
    openingAcpl: mean(opening),
    openingPlies: opening.length,
    bookRate: total === 0 ? 0 : book / total,
    endgameAcpl: mean(endgame),
    endgamePlies: endgame.length,
    worseAcpl: mean(worse),
    worseCount: worse.length,
    allowedCheckRate: checkConsidered === 0 ? 0 : checks / checkConsidered,
    checkCount: checks,
    avgGainPawns: mean(gains),
    timeControlGames,
    timeoutLosses,
    clockPlies,
    clockErrorRate: clockPlies > 0 ? (clockErrors / clockPlies) * 100 : null,
    lowTimeMoves,
    lowTimeErrors,
    lowTimeErrorRate: lowTimeMoves > 0 ? (lowTimeErrors / lowTimeMoves) * 100 : null,
    comfortableErrorRate: comfortableMoves > 0 ? (comfortableErrors / comfortableMoves) * 100 : null,
    avgThinkSeconds: clockPlies > 0 ? thinkSecondsTotal / clockPlies : null,
    winningPositions,
    winningConverted,
    blunderRate: total === 0 ? 0 : blunders / total,
    bestRate: total === 0 ? 0 : bests / total,
    moves: total,
  };
}

/* ---------------------------------------------------------------- scoring */

const MIN_SAMPLE = 20;

/**
 * Time-management score from real clock evidence (Phase 2.5).
 *
 * When any game carries clock annotations the score is driven by measured
 * error rates under and away from time pressure. Only when no clock exists at
 * all do we fall back to the time-forfeit signal — and the detail string says
 * plainly that the dimension is unmeasured, so the number is never presented
 * as if it were observed.
 */
function timeScore(m: DnaMeasures): number {
  if (m.clockPlies === 0) {
    return m.timeControlGames === 0 ? 50 : clamp(100 - 25 * m.timeoutLosses);
  }
  let score = 80;
  // 12% is the reference error rate; drift either way moves the score.
  if (m.lowTimeErrorRate !== null) score -= 1.2 * (m.lowTimeErrorRate - 12);
  if (m.clockErrorRate !== null) score -= 0.4 * (m.clockErrorRate - 10);
  if (m.lowTimeMoves >= 8 && m.lowTimeErrors === 0) score += 10;
  if (
    m.comfortableErrorRate !== null &&
    m.lowTimeErrorRate !== null &&
    m.comfortableErrorRate > 0
  ) {
    const sensitivity = m.lowTimeErrorRate / m.comfortableErrorRate;
    if (sensitivity > 2) score -= 10;
    else if (sensitivity < 0.8) score += 5;
  }
  return clamp(score);
}

/** Human explanation for the Time dimension, always stating its sample. */
function timeDetail(m: DnaMeasures): string {
  if (m.clockPlies === 0) {
    return m.timeControlGames === 0
      ? "no per-move clock in your PGN — time management unmeasured"
      : `${m.timeoutLosses} loss${m.timeoutLosses === 1 ? "" : "es"} on time across ${m.timeControlGames} timed games — no per-move clock, so unmeasured`;
  }
  const parts = [`${m.clockPlies} timed move${m.clockPlies === 1 ? "" : "s"} measured`];
  if (m.avgThinkSeconds !== null) parts.push(`${m.avgThinkSeconds.toFixed(1)}s average per move`);
  if (m.lowTimeMoves > 0) {
    parts.push(`${m.lowTimeErrors}/${m.lowTimeMoves} errors with under 30s left`);
  }
  return parts.join(" · ");
}

function dimension(
  id: DnaDimensionId,
  label: string,
  score: number,
  evidence: string,
  sample: number,
): DnaDimension {
  return {
    id,
    label,
    score: Math.round(clamp(score)),
    evidence,
    sample,
    provisional: sample < MIN_SAMPLE,
  };
}

export function computeChessDna(games: DnaGame[]): ChessDna {
  const m = computeMeasures(games);

  const dims: DnaDimension[] = [
    dimension(
      "tactics",
      "Tactics",
      100 - 2.4 * m.middlegameAcpl,
      `${m.movesUsed} of your moves; ${m.blunderRate > 0 ? `${(m.blunderRate * 100).toFixed(1)}% blunder rate` : "no blunders recorded"}`,
      m.movesUsed,
    ),
    dimension(
      "calculation",
      "Calculation",
      100 - 2.6 * m.sharpAcpl,
      m.sharpCount === 0
        ? "no sharp positions recorded yet"
        : `${m.sharpCount} positions where a strong move was available`,
      m.sharpCount,
    ),
    dimension(
      "position",
      "Position",
      100 - 2.9 * m.quietErrorAcpl,
      m.quietErrorCount === 0
        ? "no quiet-move errors recorded"
        : `${m.quietErrorCount} quiet-move errors (no tactic involved)`,
      m.quietErrorCount,
    ),
    dimension(
      "opening",
      "Opening",
      0.55 * (100 - 3.0 * m.openingAcpl) + 45 * m.bookRate,
      `${(m.bookRate * 100).toFixed(0)}% of your moves stayed in theory (${m.openingPlies} opening plies)`,
      m.openingPlies,
    ),
    dimension(
      "endgame",
      "Endgame",
      m.endgamePlies >= 6 ? 100 - 3.0 * m.endgameAcpl : 52,
      m.endgamePlies >= 6
        ? `${m.endgamePlies} endgame plies assessed`
        : "fewer than 6 endgame plies — provisional",
      m.endgamePlies,
    ),
    dimension(
      "defense",
      "Defence",
      100 - 2.6 * m.worseAcpl,
      m.worseCount === 0
        ? "you were rarely worse"
        : `${m.worseCount} moves played from a worse position`,
      m.worseCount,
    ),
    dimension(
      "kingSafety",
      "King safety",
      100 - 210 * m.allowedCheckRate,
      `${m.checkCount} of your moves left a check available`,
      m.movesUsed,
    ),
    dimension(
      "initiative",
      "Initiative",
      50 + 18 * m.avgGainPawns,
      `average evaluation change of ${m.avgGainPawns >= 0 ? "+" : ""}${m.avgGainPawns.toFixed(2)} pawns per move`,
      m.movesUsed,
    ),
    dimension(
      "timeManagement",
      "Time",
      timeScore(m),
      timeDetail(m),
      // Sample size is the number of *timed moves*, not games: the claim is
      // about how you spend time, and 400 clock readings is the real evidence.
      m.clockPlies > 0 ? m.clockPlies : m.timeControlGames,
    ),
    dimension(
      "conversion",
      "Conversion",
      m.winningPositions === 0 ? 50 : 100 * (m.winningConverted / m.winningPositions),
      m.winningPositions === 0
        ? "you never reached a clearly winning position"
        : `converted ${m.winningConverted} of ${m.winningPositions} winning positions`,
      m.winningPositions,
    ),
  ];

  /* ------------------------------------------------- delta vs earlier half */
  if (games.length >= 6) {
    const sorted = [...games].sort((a, b) => a.gameId - b.gameId);
    const half = Math.floor(sorted.length / 2);
    const early = computeMeasures(sorted.slice(0, half));
    const late = computeMeasures(sorted.slice(half));
    const earlyDims = rawScores(early);
    const lateDims = rawScores(late);
    for (const dim of dims) {
      const a = earlyDims[dim.id];
      const b = lateDims[dim.id];
      if (a !== undefined && b !== undefined && dim.sample >= MIN_SAMPLE) {
        dim.delta = Math.round(b - a);
      }
    }
  }

  const ranked = [...dims].filter((d) => !d.provisional).sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 2).map((d) => d.id);
  const weaknesses = ranked.slice(-2).reverse().map((d) => d.id);

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const headline =
    m.gamesUsed === 0
      ? "Analyse a game to start building your Chess DNA."
      : best && worst && best.id !== worst.id
        ? `${best.label} is your strongest axis at ${best.score}; ${worst.label.toLowerCase()} is holding you back at ${worst.score}.`
        : `Your profile is unusually flat across all ten axes.`;

  return {
    dimensions: dims,
    gamesUsed: m.gamesUsed,
    movesUsed: m.movesUsed,
    generatedAt: Date.now(),
    headline,
    strengths,
    weaknesses,
  };
}

function rawScores(m: DnaMeasures): Partial<Record<DnaDimensionId, number>> {
  return {
    tactics: clamp(100 - 2.4 * m.middlegameAcpl),
    calculation: clamp(100 - 2.6 * m.sharpAcpl),
    position: clamp(100 - 2.9 * m.quietErrorAcpl),
    opening: clamp(0.55 * (100 - 3.0 * m.openingAcpl) + 45 * m.bookRate),
    endgame: m.endgamePlies >= 6 ? clamp(100 - 3.0 * m.endgameAcpl) : 52,
    defense: clamp(100 - 2.6 * m.worseAcpl),
    kingSafety: clamp(100 - 210 * m.allowedCheckRate),
    initiative: clamp(50 + 18 * m.avgGainPawns),
    timeManagement: timeScore(m),
    conversion:
      m.winningPositions === 0 ? 50 : clamp(100 * (m.winningConverted / m.winningPositions)),
  };
}

/* --------------------------------------------------------------- patterns */

export type PatternExample = { gameId: number; ply: number; san: string };

export type PatternCard = {
  id: string;
  title: string;
  detail: string;
  /** How many times the pattern occurred across the analysed games. */
  occurrences: number;
  /** How many distinct games it appears in. */
  games: number;
  lastGameId?: number;
  /** Average centipawn swing caused by the pattern. */
  avgSwingCp: number;
  severity: "high" | "medium" | "low";
  /** How many training positions this pattern can generate. */
  training: number;
  evidence: string;
  examples: PatternExample[];
  motif?: TacticTheme;
};

const MOTIF_TITLE: Partial<Record<TacticTheme, string>> = {
  fork: "Forks allowed",
  "double-attack": "Double attacks allowed",
  pin: "Pins allowed",
  skewer: "Skewers allowed",
  "hanging-piece": "Loose pieces",
  "mate-in-one": "Mate threats missed",
  "back-rank-mate": "Back-rank weakness",
  "discovered-check": "Discovered checks allowed",
  "double-check": "Double checks allowed",
};

const MOTIF_TRAINING: Partial<Record<TacticTheme, string>> = {
  fork: "Scan for forks before every quiet move.",
  "double-attack": "Count how many of your pieces sit on one line.",
  "hanging-piece": "Ask what is undefended after the move you are considering.",
  pin: "Notice your own pinned pieces before moving them.",
  skewer: "Look for enemy pieces aligned behind more valuable ones.",
  "mate-in-one": "Check for mate threats on every move.",
  "back-rank-mate": "Give your king luft before the endgame.",
};

export function detectPatterns(games: DnaGame[]): PatternCard[] {
  const cards: PatternCard[] = [];
  const usable = games.filter((game) => ownMoves(game).length > 0);

  /* ------------------------------------------ 1. allowed-tactic patterns */
  type Tally = {
    occurrences: number;
    games: Set<number>;
    swing: number;
    last: number;
    examples: PatternExample[];
  };
  const byMotif = new Map<TacticTheme, Tally>();
  for (const game of usable) {
    for (const move of ownMoves(game)) {
      if (move.cpLoss < 100) continue;
      for (const motif of move.allowedMotifs) {
        const tally = byMotif.get(motif) ?? {
          occurrences: 0,
          games: new Set<number>(),
          swing: 0,
          last: 0,
          examples: [],
        };
        tally.occurrences += 1;
        tally.games.add(game.gameId);
        tally.swing += move.cpLoss;
        tally.last = Math.max(tally.last, game.gameId);
        if (tally.examples.length < 6) {
          tally.examples.push({ gameId: game.gameId, ply: move.ply, san: move.san });
        }
        byMotif.set(motif, tally);
      }
    }
  }
  for (const [motif, tally] of byMotif) {
    if (tally.occurrences < 3 || tally.games.size < 2) continue;
    const avgSwing = tally.swing / tally.occurrences;
    cards.push({
      id: `motif-${motif}`,
      title: MOTIF_TITLE[motif] ?? motif.replace(/-/g, " "),
      detail:
        MOTIF_TRAINING[motif] ??
        "Review the positions where this pattern appears and find the move you missed.",
      occurrences: tally.occurrences,
      games: tally.games.size,
      lastGameId: tally.last,
      avgSwingCp: Math.round(avgSwing),
      severity: avgSwing >= 400 ? "high" : avgSwing >= 200 ? "medium" : "low",
      training: Math.min(tally.occurrences, 12),
      evidence: `${tally.occurrences} occurrences across ${tally.games.size} games · −${(avgSwing / 100).toFixed(1)} average evaluation swing`,
      examples: tally.examples,
      motif,
    });
  }

  /* ------------------------------------------------ 2. endgame drift */
  const measures = computeMeasures(usable);
  if (
    measures.endgamePlies >= 10 &&
    measures.middlegameAcpl > 0 &&
    measures.endgameAcpl > measures.middlegameAcpl * 1.35
  ) {
    cards.push({
      id: "endgame-drift",
      title: "Endgame drift",
      detail:
        "Your accuracy drops in simplified positions. Practise exact pawn-race and king-activity calculation.",
      occurrences: Math.round(measures.endgameAcpl),
      games: usable.length,
      avgSwingCp: Math.round(measures.endgameAcpl),
      severity: measures.endgameAcpl >= 120 ? "high" : "medium",
      training: 8,
      evidence: `endgame ACPL ${measures.endgameAcpl} vs middlegame ACPL ${measures.middlegameAcpl} over ${measures.endgamePlies} endgame plies`,
      examples: [],
    });
  }

  /* --------------------------------------------- 3. opening trouble */
  const openings = new Map<string, { games: number; score: number; wins: number }>();
  for (const game of usable) {
    if (!game.color || !game.opening) continue;
    const entry = openings.get(game.opening) ?? { games: 0, score: 0, wins: 0 };
    entry.games += 1;
    const outcome = resultFor(game.result, game.color);
    entry.score += outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
    if (outcome === "win") entry.wins += 1;
    openings.set(game.opening, entry);
  }
  for (const [name, entry] of openings) {
    if (entry.games < 3) continue;
    const pct = (entry.score / entry.games) * 100;
    if (pct > 45) continue;
    cards.push({
      id: `opening-${name}`,
      title: `Trouble in the ${name}`,
      detail: `You score ${pct.toFixed(0)}% in this line. Prepare a concrete plan before move 12.`,
      occurrences: entry.games,
      games: entry.games,
      avgSwingCp: 0,
      severity: pct <= 25 ? "high" : "medium",
      training: 6,
      evidence: `${entry.wins}/${entry.games} wins (${pct.toFixed(0)}% score)`,
      examples: [],
    });
  }

  /* -------------------------------------------- 4. colour imbalance */
  for (const colour of ["w", "b"] as const) {
    const subset = usable.filter((game) => game.color === colour);
    if (subset.length < 4) continue;
    const wins = subset.filter((game) => game.color && resultFor(game.result, game.color) === "win").length;
    const pct = (wins / subset.length) * 100;
    if (pct > 30) continue;
    cards.push({
      id: `colour-${colour}`,
      title: colour === "w" ? "White results lag" : "Black results lag",
      detail: `You have scored poorly as ${colour === "w" ? "White" : "Black"}. A small, repeatable opening repertoire will help more than tactics here.`,
      occurrences: subset.length,
      games: subset.length,
      avgSwingCp: 0,
      severity: pct <= 15 ? "high" : "medium",
      training: 5,
      evidence: `${wins}/${subset.length} wins (${pct.toFixed(0)}%) as ${colour === "w" ? "White" : "Black"}`,
      examples: [],
    });
  }

  /* ------------------------------------------ 5. king safety exposure */
  if (measures.movesUsed >= MIN_SAMPLE && measures.allowedCheckRate > 0.24) {
    cards.push({
      id: "king-exposure",
      title: "King exposure",
      detail:
        "A quarter of your moves leave a check available. Slow down when the centre opens.",
      occurrences: measures.checkCount,
      games: usable.length,
      avgSwingCp: 0,
      severity: measures.allowedCheckRate > 0.34 ? "high" : "medium",
      training: 6,
      evidence: `${measures.checkCount} of ${measures.movesUsed} moves left a check available`,
      examples: [],
    });
  }

  return cards.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity] || b.avgSwingCp - a.avgSwingCp;
  });
}

/** Convenience: the phase with the worst ACPL, or null with thin data. */
export function weakestPhase(games: DnaGame[]): { phase: GamePhase; acpl: number } | null {
  const m = computeMeasures(games);
  const phases: Array<{ phase: GamePhase; acpl: number; n: number }> = [
    { phase: "opening", acpl: m.openingAcpl, n: m.openingPlies },
    { phase: "middlegame", acpl: m.middlegameAcpl, n: m.movesUsed },
    { phase: "endgame", acpl: m.endgameAcpl, n: m.endgamePlies },
  ];
  const candidates = phases.filter((p) => p.n >= 8).sort((a, b) => b.acpl - a.acpl);
  return candidates[0] ? { phase: candidates[0].phase, acpl: Math.round(candidates[0].acpl) } : null;
}
