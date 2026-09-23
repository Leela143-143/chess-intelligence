import { applyUci, uciToSan } from "@/lib/chess/replay";
import type { MoveAssessment } from "@/lib/chess/review";
import type { PatternCard } from "@/lib/chess/dna";
import type { PlayerStats } from "@/lib/player/stats";

/**
 * Training engine (brief §25, §32, §33, §59).
 *
 * Positions are generated from the player's *own* mistakes: the FEN before the
 * error, the engine's best continuation as the solution, and the deterministic
 * lesson from the review. Scheduling is a documented SM-2-lite variant.
 */

export type TrainingSource = {
  gameId: number;
  color: "w" | "b" | null;
  moves: MoveAssessment[];
};

export type GeneratedItem = {
  /** Position to solve. */
  fen: string;
  solutionUci: string[];
  solutionSan: string[];
  /** Human theme, e.g. "loose pieces" or "calculation". */
  theme: string;
  /** 1 (easy) – 5 (hard). */
  difficulty: number;
  source: string;
  sourceGameId: number;
  ply: number;
  /** What the player actually played — used by the reveal step. */
  playedSan: string;
  bestSan: string | null;
  explanation: string;
  lesson: string;
};

const MIN_CP_LOSS = 120;

function difficultyFor(move: MoveAssessment): number {
  const base = move.cpLoss >= 800 ? 5 : move.cpLoss >= 400 ? 4 : move.cpLoss >= 250 ? 3 : move.cpLoss >= 150 ? 2 : 1;
  // A tactic in the position makes a puzzle harder than a quiet blunder.
  const motifBonus = move.allowedMotifs.length > 0 ? 1 : 0;
  return Math.min(5, base + motifBonus);
}

/** Build training positions from one game's review, for `color` (or both). */
export function itemsFromGame(source: TrainingSource, limit = 6): GeneratedItem[] {
  const items: GeneratedItem[] = [];
  const candidates = source.moves
    .filter((move) => move.cpLoss >= MIN_CP_LOSS)
    .filter((move) => !source.color || move.mover === source.color)
    .filter((move) => Boolean(move.bestUci))
    .sort((a, b) => b.cpLoss - a.cpLoss);

  for (const move of candidates.slice(0, limit)) {
    const bestUci = move.bestUci;
    if (!bestUci) continue;
    const line = move.pv && move.pv.length > 0 ? move.pv.slice(0, 3) : [bestUci];
    const solutionSan: string[] = [];
    let fen = move.fenBefore;
    for (const uci of line) {
      const san = uciToSan(fen, uci);
      if (!san) break;
      solutionSan.push(san);
      const next = applyUci(fen, uci);
      if (!next) break;
      fen = next;
    }
    const theme = move.allowedMotifs[0]
      ? move.allowedMotifs[0].replace(/-/g, " ")
      : move.phase === "endgame"
        ? "endgame technique"
        : move.classification === "missed-opportunity"
          ? "finding the win"
          : "calculation";

    items.push({
      fen: move.fenBefore,
      solutionUci: line,
      solutionSan,
      theme,
      difficulty: difficultyFor(move),
      source: `game ${source.gameId} · move ${Math.ceil(move.ply / 2)}`,
      sourceGameId: source.gameId,
      ply: move.ply,
      playedSan: move.san,
      bestSan: move.bestSan,
      explanation: `${move.bestSan ?? bestUci} was the move. You played ${move.san}, which cost ${(move.cpLoss / 100).toFixed(2)} pawns.`,
      lesson: move.allowedMotifs[0]
        ? `Watch for ${theme} before committing to a quiet move.`
        : "Compare two or three candidate moves before playing.",
    });
  }
  return items;
}

/** Aggregate generator across games, ranked by size of error. */
export function generateTrainingItems(
  sources: TrainingSource[],
  limit = 20,
): GeneratedItem[] {
  const all: GeneratedItem[] = [];
  for (const source of sources) {
    all.push(...itemsFromGame(source, 8));
  }
  // De-duplicate by FEN, keeping the hardest instance.
  const seen = new Map<string, GeneratedItem>();
  for (const item of all) {
    const existing = seen.get(item.fen);
    if (!existing || item.difficulty > existing.difficulty) seen.set(item.fen, item);
  }
  return [...seen.values()]
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, limit);
}

/* ------------------------------------------------------------------- SRS */

export type SrsGrade = "good" | "hard" | "fail";

export type SrsState = {
  /** Days until the next review; 0 means "still learning". */
  interval: number;
  ease: number;
  /** Epoch ms. */
  due: number;
  lastResult?: SrsGrade;
  lastSeen: number;
  attempts: number;
  successes: number;
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const LEARNING_STEP_MS = 10 * 60 * 1000;

export function newSrsState(now = Date.now()): SrsState {
  return { interval: 0, ease: 2.5, due: now, lastSeen: 0, attempts: 0, successes: 0 };
}

/**
 * SM-2 lite (documented):
 *
 * | grade | interval                          | ease       | next review |
 * |-------|-----------------------------------|------------|-------------|
 * | fail  | reset to 0                        | −0.20      | +10 minutes |
 * | hard  | max(1, interval × 1.2)            | −0.15      | +interval d |
 * | good  | 0→1, 1→3, else round(i × ease)    | +0.10      | +interval d |
 *
 * Ease is clamped to [1.3, 3.0].
 */
export function scheduleNext(state: SrsState, grade: SrsGrade, now = Date.now()): SrsState {
  let { interval, ease } = state;
  const attempts = state.attempts + 1;
  const successes = state.successes + (grade === "good" ? 1 : 0);

  if (grade === "fail") {
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    return {
      interval,
      ease,
      due: now + LEARNING_STEP_MS,
      lastResult: grade,
      lastSeen: now,
      attempts,
      successes,
    };
  }

  if (grade === "hard") {
    interval = interval <= 0 ? 1 : Math.max(1, interval * 1.2);
    ease = Math.max(1.3, ease - 0.15);
  } else {
    interval = interval <= 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
    ease = Math.min(3, ease + 0.1);
  }

  return {
    interval,
    ease,
    due: now + interval * DAY_MS,
    lastResult: grade,
    lastSeen: now,
    attempts,
    successes,
  };
}

export function isDue(state: Pick<SrsState, "due">, now = Date.now()): boolean {
  return state.due <= now;
}

/* --------------------------------------------------------- daily mission */

export type MissionBlock = {
  id: string;
  title: string;
  detail: string;
  minutes: number;
  kind: "due" | "weakness" | "endgame" | "review" | "repertoire";
  count: number;
  reason: string;
  benefit: string;
};

export type DailyMission = {
  blocks: MissionBlock[];
  totalMinutes: number;
  difficulty: "light" | "focused" | "deep";
  headline: string;
  /** Why this plan, in one deterministic sentence. */
  reason: string;
};

export function buildDailyMission(args: {
  dueCount: number;
  patterns: PatternCard[];
  stats: PlayerStats;
  repertoireGaps?: number;
}): DailyMission {
  const { dueCount, patterns, stats } = args;
  const blocks: MissionBlock[] = [];

  if (dueCount > 0) {
    blocks.push({
      id: "due",
      title: "Spaced repetition",
      detail: `${dueCount} position${dueCount === 1 ? "" : "s"} from previous sessions`,
      minutes: Math.min(14, Math.max(4, Math.ceil(dueCount * 0.9))),
      kind: "due",
      count: dueCount,
      reason: "These are scheduled to come back today so the pattern sticks.",
      benefit: "Retention — the cheapest accuracy you can buy.",
    });
  }

  const topPattern = patterns[0];
  if (topPattern) {
    blocks.push({
      id: `pattern-${topPattern.id}`,
      title: topPattern.title,
      detail: topPattern.detail,
      minutes: topPattern.severity === "high" ? 12 : 8,
      kind: "weakness",
      count: topPattern.training,
      reason: topPattern.evidence,
      benefit: topPattern.severity === "high" ? "Your single largest source of lost points." : "A recurring leak worth closing.",
    });
  }

  const endgameAcpl = stats.phaseAcpl.endgame;
  if (endgameAcpl !== null && endgameAcpl >= 80) {
    blocks.push({
      id: "endgame",
      title: "Endgame conversion",
      detail: "King activity and pawn-race calculation",
      minutes: 10,
      kind: "endgame",
      count: 6,
      reason: `Your endgame ACPL is ${endgameAcpl} — higher than your other phases.`,
      benefit: "Converts winning positions you currently let slip.",
    });
  }

  if (stats.errorFrequency.gamesWithAnalysis > 0 && blocks.length < 4) {
    blocks.push({
      id: "review",
      title: "Review yesterday's mistake",
      detail: `${stats.errorFrequency.blundersPerGame} blunders per game on average`,
      minutes: 6,
      kind: "review",
      count: 3,
      reason: "Replaying your own errors converts insight into recognition.",
      benefit: "Recognition speed in real games.",
    });
  }

  const totalMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const difficulty: DailyMission["difficulty"] =
    totalMinutes >= 26 ? "deep" : totalMinutes >= 14 ? "focused" : "light";

  return {
    blocks,
    totalMinutes,
    difficulty,
    headline:
      blocks.length === 0
        ? "Analyse a game and your training plan writes itself"
        : `${totalMinutes} minutes of training built from your own games`,
    reason:
      blocks.length === 0
        ? "There is not enough analysed evidence yet."
        : topPattern
          ? `Prioritised because ${topPattern.title.toLowerCase()} appears in ${topPattern.games} of your games.`
          : "Built from the games you have analysed so far.",
  };
}
