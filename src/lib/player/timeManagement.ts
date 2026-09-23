import type { MoveAssessment } from "@/lib/chess/review";

/**
 * Time-management evidence (Phase 2.5).
 *
 * This module exists because the previous Time dimension was a placeholder: it
 * scored 50 and said "no per-move clock in your PGN". Now that PGN `%clk`
 * annotations are parsed, thinking time is *measured* and every claim here is
 * backed by a count of real moves.
 *
 * EVIDENCE RULES (non-negotiable)
 * ------------------------------
 *  - No clock data means no score. We return `score: null` and
 *    `confidence: "none"` rather than inventing a number.
 *  - Small samples stay labelled provisional: the caller must be able to tell
 *    12 measured moves from 400.
 *  - Every finding carries the sample it came from.
 */

export type TimeFinding = {
  text: string;
  tone: "pos" | "neg" | "neutral";
  /** How many measured moves stand behind this sentence. */
  sample: number;
};

export type TimeManagementProfile = {
  /** Mover plies that carried a usable clock reading. */
  measuredPlies: number;
  /** Mover plies with no clock at all (unannotated PGN). */
  unmeasuredPlies: number;
  /** Average seconds per move, or null without data. */
  avgThinkSeconds: number | null;
  /** Average seconds spent on moves the engine graded as errors. */
  avgThinkOnErrors: number | null;
  /** Average seconds spent on moves the engine graded as sound. */
  avgThinkOnSound: number | null;
  /** Errors committed below the low-time threshold. */
  lowTimeErrors: number;
  /** Moves played below the low-time threshold. */
  lowTimeMoves: number;
  /** Errors per 100 moves while short of time. */
  lowTimeErrorRate: number | null;
  /** Errors per 100 moves with time in hand. */
  comfortableErrorRate: number | null;
  /**
   * lowTimeErrorRate / comfortableErrorRate. Above 1 means time pressure makes
   * you measurably worse; null when either bucket is empty.
   */
  pressureSensitivity: number | null;
  /** Longest single think, in seconds. */
  longestThinkSeconds: number | null;
  findings: TimeFinding[];
  /** 0–100, or null when there is not enough evidence to score. */
  score: number | null;
  confidence: "none" | "provisional" | "medium" | "high";
};

export type TimeManagementOptions = {
  /** At or below this many seconds remaining counts as "short of time". */
  lowTimeSeconds?: number;
  /** At or above this many seconds counts as comfortable. */
  comfortableSeconds?: number;
  /** Plies the review identified as critical (The Moment candidates). */
  criticalPlies?: number[];
};

const ERROR_CLASSES = new Set(["inaccuracy", "mistake", "blunder", "missed-opportunity"]);

/** Sample-size bands. Deliberately conservative. */
function confidenceFor(measuredPlies: number): TimeManagementProfile["confidence"] {
  if (measuredPlies === 0) return "none";
  if (measuredPlies < 30) return "provisional";
  if (measuredPlies < 100) return "medium";
  return "high";
}

function per100(count: number, total: number): number | null {
  return total > 0 ? (count / total) * 100 : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Analyse one side's thinking time across a reviewed game (or any set of
 * assessments). Pure and deterministic: no engine, no clock, no randomness.
 */
export function analyseTimeManagement(
  moves: MoveAssessment[],
  color: "w" | "b" | null = null,
  options: TimeManagementOptions = {},
): TimeManagementProfile {
  const lowTimeSeconds = options.lowTimeSeconds ?? 30;
  const comfortableSeconds = options.comfortableSeconds ?? 60;

  const own = color ? moves.filter((move) => move.mover === color) : moves;

  const measured = own.filter((move) => typeof move.thinkSeconds === "number");
  const measuredPlies = measured.length;
  const unmeasuredPlies = own.length - measuredPlies;

  const thinkTimes = measured.map((move) => move.thinkSeconds as number);
  const avgThinkSeconds = mean(thinkTimes);

  const errorThinks = measured
    .filter((move) => ERROR_CLASSES.has(move.classification))
    .map((move) => move.thinkSeconds as number);
  const soundThinks = measured
    .filter((move) => !ERROR_CLASSES.has(move.classification))
    .map((move) => move.thinkSeconds as number);

  const avgThinkOnErrors = mean(errorThinks);
  const avgThinkOnSound = mean(soundThinks);

  const lowTimeMoves = measured.filter(
    (move) => (move.clockSeconds ?? Number.POSITIVE_INFINITY) <= lowTimeSeconds,
  );
  const comfortableMoves = measured.filter(
    (move) => (move.clockSeconds ?? Number.NEGATIVE_INFINITY) >= comfortableSeconds,
  );

  const lowTimeErrors = lowTimeMoves.filter((move) => ERROR_CLASSES.has(move.classification)).length;
  const comfortableErrors = comfortableMoves.filter((move) =>
    ERROR_CLASSES.has(move.classification),
  ).length;

  const lowTimeErrorRate = per100(lowTimeErrors, lowTimeMoves.length);
  const comfortableErrorRate = per100(comfortableErrors, comfortableMoves.length);

  let pressureSensitivity: number | null = null;
  if (lowTimeErrorRate !== null && comfortableErrorRate !== null) {
    if (comfortableErrorRate === 0) {
      // Never errs with time in hand: any low-time error is pure pressure.
      pressureSensitivity = lowTimeErrorRate === 0 ? 1 : 3;
    } else {
      pressureSensitivity = lowTimeErrorRate / comfortableErrorRate;
    }
  }

  const findings: TimeFinding[] = [];
  const confidence = confidenceFor(measuredPlies);

  if (measuredPlies === 0) {
    findings.push({
      text: "This game's PGN carries no per-move clock, so thinking time cannot be measured.",
      tone: "neutral",
      sample: 0,
    });
  } else {
    findings.push({
      text: `Measured ${measuredPlies} clock reading${measuredPlies === 1 ? "" : "s"} across your moves${
        avgThinkSeconds !== null ? `, averaging ${avgThinkSeconds.toFixed(1)}s per move` : ""
      }.`,
      tone: "neutral",
      sample: measuredPlies,
    });
  }

  if (avgThinkOnErrors !== null && avgThinkOnSound !== null && avgThinkOnSound > 0) {
    const ratio = avgThinkOnErrors / avgThinkOnSound;
    if (ratio < 0.5) {
      findings.push({
        text: `You spent ${avgThinkOnErrors.toFixed(1)}s on your errors but ${avgThinkOnSound.toFixed(1)}s on your good moves — you rush the moves that matter most.`,
        tone: "neg",
        sample: measuredPlies,
      });
    } else if (ratio > 1.3) {
      findings.push({
        text: `You spent ${avgThinkOnErrors.toFixed(1)}s on your errors against ${avgThinkOnSound.toFixed(1)}s when sound — the extra time did not convert into better moves here.`,
        tone: "neg",
        sample: measuredPlies,
      });
    } else {
      findings.push({
        text: `Your time allocation was even: ${avgThinkOnErrors.toFixed(1)}s on errors against ${avgThinkOnSound.toFixed(1)}s on sound moves.`,
        tone: "pos",
        sample: measuredPlies,
      });
    }
  }

  if (pressureSensitivity !== null && lowTimeMoves.length > 0 && comfortableMoves.length > 0) {
    if (pressureSensitivity > 2) {
      findings.push({
        text: `Short of time you err ${pressureSensitivity.toFixed(1)}× more often (${lowTimeErrors}/${lowTimeMoves.length} moves under ${lowTimeSeconds}s).`,
        tone: "neg",
        sample: lowTimeMoves.length,
      });
    } else if (pressureSensitivity < 0.8) {
      findings.push({
        text: `You hold up under pressure: ${lowTimeErrors}/${lowTimeMoves.length} errors under ${lowTimeSeconds}s.`,
        tone: "pos",
        sample: lowTimeMoves.length,
      });
    } else {
      findings.push({
        text: `Time pressure costs you ${pressureSensitivity.toFixed(1)}× your normal error rate (${lowTimeErrors}/${lowTimeMoves.length} moves short of time).`,
        tone: "neutral",
        sample: lowTimeMoves.length,
      });
    }
  }

  if (options.criticalPlies && options.criticalPlies.length > 0 && measuredPlies > 0) {
    const criticalSet = new Set(options.criticalPlies);
    const criticalMoves = measured.filter((move) => criticalSet.has(move.ply));
    const criticalAvg = mean(criticalMoves.map((move) => move.thinkSeconds as number));
    const otherAvg = mean(
      measured
        .filter((move) => !criticalSet.has(move.ply))
        .map((move) => move.thinkSeconds as number),
    );
    if (criticalAvg !== null && otherAvg !== null && criticalMoves.length > 0) {
      findings.push({
        text: `On the ${criticalMoves.length} turning point${criticalMoves.length === 1 ? "" : "s"} you averaged ${criticalAvg.toFixed(1)}s against ${otherAvg.toFixed(1)}s elsewhere.`,
        tone: criticalAvg >= otherAvg ? "pos" : "neg",
        sample: criticalMoves.length,
      });
    }
  }

  const longestThinkSeconds = thinkTimes.length > 0 ? Math.max(...thinkTimes) : null;

  // ---------------------------------------------------------------- scoring
  // No data means no score. Anything else would be an invented number.
  let score: number | null = null;
  if (measuredPlies > 0) {
    score = 70;
    if (avgThinkOnErrors !== null && avgThinkOnSound !== null && avgThinkOnSound > 0) {
      const ratio = avgThinkOnErrors / avgThinkOnSound;
      if (ratio < 0.5) score -= 15;
      else if (ratio < 0.8) score -= 7;
      else if (ratio > 1.3) score -= 5;
    }
    if (pressureSensitivity !== null) {
      if (pressureSensitivity > 2) score -= 20;
      else if (pressureSensitivity > 1.2) score -= 10;
      else if (pressureSensitivity < 0.8) score += 10;
    }
    if (lowTimeMoves.length >= 5 && lowTimeErrors === 0) score += 10;
    score = clamp(score);
  }

  return {
    measuredPlies,
    unmeasuredPlies,
    avgThinkSeconds,
    avgThinkOnErrors,
    avgThinkOnSound,
    lowTimeErrors,
    lowTimeMoves: lowTimeMoves.length,
    lowTimeErrorRate,
    comfortableErrorRate,
    pressureSensitivity,
    longestThinkSeconds,
    findings,
    score,
    confidence,
  };
}

/** Aggregate several games' profiles into one, weighting by measured plies. */
export function mergeTimeProfiles(profiles: TimeManagementProfile[]): TimeManagementProfile {
  const usable = profiles.filter((profile) => profile.measuredPlies > 0);
  const measuredPlies = usable.reduce((sum, profile) => sum + profile.measuredPlies, 0);
  const unmeasuredPlies = profiles.reduce((sum, profile) => sum + profile.unmeasuredPlies, 0);

  if (measuredPlies === 0) {
    return {
      measuredPlies: 0,
      unmeasuredPlies,
      avgThinkSeconds: null,
      avgThinkOnErrors: null,
      avgThinkOnSound: null,
      lowTimeErrors: 0,
      lowTimeMoves: 0,
      lowTimeErrorRate: null,
      comfortableErrorRate: null,
      pressureSensitivity: null,
      longestThinkSeconds: null,
      findings: [
        {
          text: "None of your imported games carry clock annotations, so time management stays unmeasured.",
          tone: "neutral",
          sample: 0,
        },
      ],
      score: null,
      confidence: "none",
    };
  }

  // Weighted means keep long games from being drowned out by short ones.
  const weighted = (pick: (profile: TimeManagementProfile) => number | null): number | null => {
    let total = 0;
    let weight = 0;
    for (const profile of usable) {
      const value = pick(profile);
      if (value === null) continue;
      total += value * profile.measuredPlies;
      weight += profile.measuredPlies;
    }
    return weight > 0 ? total / weight : null;
  };

  const lowTimeErrors = usable.reduce((sum, profile) => sum + profile.lowTimeErrors, 0);
  const lowTimeMoves = usable.reduce((sum, profile) => sum + profile.lowTimeMoves, 0);
  const lowTimeErrorRate = per100(lowTimeErrors, lowTimeMoves);

  const scores = usable.map((profile) => profile.score).filter((value): value is number => value !== null);
  const score = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const findings: TimeFinding[] = [];
  findings.push({
    text: `Measured across ${usable.length} game${usable.length === 1 ? "" : "s"} (${measuredPlies} clock readings).`,
    tone: "neutral",
    sample: measuredPlies,
  });
  if (lowTimeMoves > 0) {
    findings.push({
      text: `${lowTimeErrors} of ${lowTimeMoves} moves played short of time were errors.`,
      tone: lowTimeErrorRate !== null && lowTimeErrorRate < 15 ? "pos" : "neg",
      sample: lowTimeMoves,
    });
  }

  return {
    measuredPlies,
    unmeasuredPlies,
    avgThinkSeconds: weighted((profile) => profile.avgThinkSeconds),
    avgThinkOnErrors: weighted((profile) => profile.avgThinkOnErrors),
    avgThinkOnSound: weighted((profile) => profile.avgThinkOnSound),
    lowTimeErrors,
    lowTimeMoves,
    lowTimeErrorRate,
    comfortableErrorRate: weighted((profile) => profile.comfortableErrorRate),
    pressureSensitivity: weighted((profile) => profile.pressureSensitivity),
    longestThinkSeconds:
      usable.length > 0
        ? Math.max(...usable.map((profile) => profile.longestThinkSeconds ?? 0)) || null
        : null,
    findings,
    score,
    confidence: confidenceFor(measuredPlies),
  };
}
