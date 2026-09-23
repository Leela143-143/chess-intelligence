import { Chess, type PieceSymbol, type Square } from "chess.js";
import { detectTacticsAfterMove, type TacticTheme } from "./tactics";
import { legalMoveCountOf, materialFor, staticExchange } from "./position";
import { applyUci } from "./replay";

/**
 * Exceptional / Brilliant Move Engine (Phase 2.5).
 *
 * DESIGN CONTRACT
 * ---------------
 * `brilliant` and `exceptional` are *evidence classes*, not sentiment. Every
 * one of them must be backed by facts this module can name:
 *
 *   - Stockfish evidence — the move is the engine's own first choice, and
 *     every alternative the engine searched was materially worse.
 *   - Sacrifice evidence — the mover gives up real material on purpose.
 *   - Only-move evidence — no searched alternative held the evaluation.
 *   - Alternative comparison — MultiPV lines that stayed inside a viable band.
 *   - Difficulty estimate — how much work the move takes to find.
 *   - Engine stability — shallow and deep searches agreeing.
 *   - Confidence — how complete the supporting evidence actually is.
 *
 * WHY BRILLIANT IS RARE
 * ---------------------
 * A plain "best move" is NOT brilliant. `brilliant` additionally requires a
 * *sound material sacrifice* (>= 2 pawns) that the engine still endorses, a
 * scarce set of alternatives, high difficulty and high confidence. A simple
 * mate-in-one never qualifies. In practice this fires on a small handful of
 * moves per game at most, and often zero — which is the intent.
 *
 * All evaluations arriving here are already in the MOVER's perspective, in
 * centipawns. This module never re-derives perspective; it trusts the caller
 * so a single perspective bug cannot hide in two places.
 */

export const EXCEPTIONAL_THRESHOLDS = {
  /** CP loss allowed and still count as "engine-best quality". */
  qualityCp: 20,
  /** Material (pawns) the mover must give up for `brilliant`. */
  brilliantMaterial: 2,
  /** Mover-perspective eval (pawns) that keeps a sacrifice "sound". */
  brilliantCompensation: -0.5,
  /** Minimum difficulty for `brilliant`. */
  brilliantDifficulty: 0.45,
  /** Minimum confidence for `brilliant`. */
  brilliantConfidence: 0.6,
  /** Alternatives within this cp band of the best move count as "viable". */
  viableBandCp: 50,
  /** `brilliant` tolerates at most this many viable alternatives. */
  brilliantMaxAlternatives: 2,
  /** Minimum mover-perspective swing (pawns) for `exceptional`. */
  exceptionalSwing: 1.5,
  /** Minimum difficulty for `exceptional`. */
  exceptionalDifficulty: 0.35,
  /** Minimum confidence for `exceptional`. */
  exceptionalConfidence: 0.5,
} as const;

export type SacrificeEvidence = {
  /** Net material in pawns the mover commits to giving up (0 = nothing given). */
  materialGiven: number;
  /** The opponent can win material on the destination square by force. */
  immediatelyCapturable: boolean;
  /** Square where the material is offered. */
  square: Square | null;
  /** Worst material deficit reached along the engine's own main line. */
  pvMaterialGiven: number;
  /** Mover-perspective eval (pawns) *after* the opponent's best reply. */
  compensationPawns: number;
  /** The engine still likes the position for the sacrificer. */
  sound: boolean;
};

export type ExceptionalEvidence = {
  /** Played move equals the engine's own first choice. */
  isBest: boolean;
  /** Legal moves in the position before the move (real count, never assumed). */
  legalMoves: number;
  /** MultiPV lines (other than the played move) that stayed viable. */
  viableAlternatives: number | null;
  /** The engine was searched multi-PV, so `viableAlternatives` is meaningful. */
  alternativesAvailable: boolean;
  /** 0–1: how hard this move is to find. */
  difficulty: number;
  /** 0–1: shallow/deep agreement on eval and best move. */
  stability: number;
  /** 0–1: how well-evidenced the verdict is. */
  confidence: number;
  sacrifice: SacrificeEvidence | null;
  /** No searched alternative preserved the evaluation. */
  onlyMove: boolean;
  /** Mover-perspective swing in pawns (positive = gained). */
  swingPawns: number;
  /** Mover-perspective eval before the move, in pawns. */
  beforePawns: number;
  afterPawns: number;
  /** Tactics the played move created. */
  motifs: TacticTheme[];
  /** Human-readable facts behind the verdict. Never empty. */
  reasons: string[];
};

export type ExceptionalResult = {
  /** `null` means "an ordinary move of some other class". */
  classification: "brilliant" | "exceptional" | null;
  evidence: ExceptionalEvidence;
};

export type ExceptionalInput = {
  playedUci: string;
  fenBefore: string;
  fenAfter: string;
  mover: "w" | "b";
  /** Mover-perspective centipawns BEFORE the move. */
  beforeCp: number;
  /** Mover-perspective centipawns AFTER the move (opponent to move). */
  afterCp: number;
  bestUci: string | null;
  /** MultiPV lines excluding the played move, already mover-perspective. */
  alternatives?: Array<{ uci: string; cp: number }>;
  /** Principal variation in UCI from the played move's position. */
  pv?: string[];
  /** Earlier (shallow) search of the same position, for stability evidence. */
  shallowBeforeCp?: number;
  shallowBestUci?: string | null;
  /** Real legal move count; taken from the position when omitted. */
  legalMoves?: number;
  isBook?: boolean;
  forced?: boolean;
  /** Motifs created by the played move; computed when omitted. */
  motifs?: TacticTheme[];
  thresholds?: Partial<typeof EXCEPTIONAL_THRESHOLDS>;
};

const PAWN = 100;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Is this classification one of the exceptional classes? */
export function isExceptionalClass(
  classification: string,
): classification is "brilliant" | "exceptional" {
  return classification === "brilliant" || classification === "exceptional";
}

type MoveFacts = {
  san: string;
  isCapture: boolean;
  givesCheck: boolean;
  isMate: boolean;
  ok: boolean;
};

/**
 * Facts about the played move, read from the position rather than from SAN
 * suffixes — so en-passant captures and promotion checks are handled correctly.
 */
export function moveFacts(fenBefore: string, uci: string): MoveFacts {
  const empty: MoveFacts = { san: "", isCapture: false, givesCheck: false, isMate: false, ok: false };
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined,
    });
    if (!move) return empty;
    return {
      san: move.san,
      isCapture: Boolean(move.captured),
      givesCheck: chess.isCheck(),
      isMate: chess.isCheckmate(),
      ok: true,
    };
  } catch {
    return empty;
  }
}

/**
 * Did the mover give up material on purpose, and does the position still hold?
 *
 * Two independent signals, because either alone produces false positives:
 *
 *  1. `staticExchange` on the destination square — the opponent can win
 *     material there by force (the classic piece-en-prise sacrifice).
 *  2. The engine's own main line — walk the PV and record the deepest material
 *     deficit the mover reaches. This catches sacrifices whose point is several
 *     moves away, where the immediate capture is not yet available.
 */
function detectSacrifice(input: ExceptionalInput, afterPawns: number): SacrificeEvidence | null {
  const mover = input.mover;
  const opponent = mover === "w" ? "b" : "w";

  // Signal 1 — immediately capturable material on the destination square.
  let immediate = 0;
  let square: Square | null = null;
  const to = input.playedUci.slice(2, 4);
  if (to.length === 2) {
    square = to as Square;
    immediate = staticExchange(input.fenAfter, square, opponent);
  }

  // Signal 2 — material deficit along the engine's main line.
  let pvMaterialGiven = 0;
  if (input.pv && input.pv.length > 0) {
    const start = materialFor(input.fenBefore, mover);
    let fen = input.fenBefore;
    let worst = start;
    for (const uci of input.pv.slice(0, 12)) {
      const next = applyUci(fen, uci);
      if (!next) break;
      fen = next;
      worst = Math.min(worst, materialFor(fen, mover));
    }
    pvMaterialGiven = Math.max(0, start - worst);
  }

  const materialGiven = Math.max(immediate, pvMaterialGiven);
  if (materialGiven <= 0) return null;

  const sound = afterPawns >= EXCEPTIONAL_THRESHOLDS.brilliantCompensation;
  return {
    materialGiven,
    immediatelyCapturable: immediate >= EXCEPTIONAL_THRESHOLDS.brilliantMaterial,
    square,
    pvMaterialGiven,
    compensationPawns: afterPawns,
    sound,
  };
}

/** 0–1 estimate of how much work finding this move takes. */
function estimateDifficulty(input: {
  isCapture: boolean;
  givesCheck: boolean;
  onlyMove: boolean;
  viableAlternatives: number | null;
  hasSacrifice: boolean;
  legalMoves: number;
}): number {
  let difficulty = 0.2;
  // Quiet moves are harder to spot than forcing ones.
  if (!input.isCapture) difficulty += 0.18;
  if (!input.givesCheck) difficulty += 0.08;
  // A lone saving/winning move demands seeing why everything else fails.
  if (input.onlyMove) difficulty += 0.3;
  if (input.viableAlternatives !== null && input.viableAlternatives <= 1) difficulty += 0.14;
  // A quiet sacrifice is the hardest pattern in chess to find.
  if (input.hasSacrifice && !input.isCapture) difficulty += 0.16;
  // More legal options means more candidates to reject.
  if (input.legalMoves >= 30) difficulty += 0.06;
  return clamp01(difficulty);
}

/** 0–1 agreement between the shallow and deep searches on this position. */
function estimateStability(input: ExceptionalInput): number {
  if (input.shallowBeforeCp === undefined) return 0.7;
  const bestAgrees = (input.shallowBestUci ?? null) === (input.bestUci ?? null);
  const driftPawns = Math.abs(input.shallowBeforeCp - input.beforeCp) / PAWN;
  const evalStable = 1 - Math.min(1, driftPawns / 1.5);
  return clamp01((bestAgrees ? 0.6 : 0.2) + 0.4 * evalStable);
}

/** 0–1 confidence: how complete the evidence behind the verdict is. */
function estimateConfidence(input: {
  isBest: boolean;
  alternativesAvailable: boolean;
  hasShallow: boolean;
  stability: number;
  sacrifice: SacrificeEvidence | null;
  onlyMove: boolean;
}): number {
  let confidence = 0.35;
  if (input.isBest) confidence += 0.2;
  if (input.alternativesAvailable) confidence += 0.15;
  if (input.hasShallow) confidence += 0.1;
  if (input.stability >= 0.7) confidence += 0.1;
  if (input.sacrifice?.immediatelyCapturable) confidence += 0.1;
  if (input.onlyMove) confidence += 0.05;
  return clamp01(confidence);
}

/**
 * Classify a move as `brilliant`, `exceptional` or neither.
 *
 * Called from the deep pass of the review pipeline, where MultiPV lines and
 * both search strengths are available. Deliberately pure: same input, same
 * verdict, no engine calls.
 */
export function classifyExceptional(input: ExceptionalInput): ExceptionalResult {
  const t = { ...EXCEPTIONAL_THRESHOLDS, ...(input.thresholds ?? {}) };

  const motifs =
    input.motifs ?? detectTacticsAfterMove(input.fenBefore, input.playedUci).map((x) => x.theme);

  const facts = moveFacts(input.fenBefore, input.playedUci);

  const beforePawns = input.beforeCp / PAWN;
  const afterPawns = input.afterCp / PAWN;
  const cpLoss = Math.max(0, input.beforeCp - input.afterCp);
  const swingPawns = afterPawns - beforePawns;

  const legalMoves = input.legalMoves ?? legalMoveCountOf(input.fenBefore) ?? 20;
  const isBest = input.bestUci !== null && input.playedUci === input.bestUci;

  const alternatives = input.alternatives ?? [];
  const alternativesAvailable = alternatives.length > 0;
  const viableAlternatives = alternativesAvailable
    ? alternatives.filter(
        (line) => line.uci !== input.playedUci && line.cp >= input.beforeCp - t.viableBandCp,
      ).length
    : null;

  const onlyMove =
    alternativesAvailable &&
    viableAlternatives === 0 &&
    legalMoves > 2 &&
    input.beforeCp >= -t.viableBandCp;

  const sacrifice = detectSacrifice(input, afterPawns);

  const difficulty = estimateDifficulty({
    isCapture: facts.isCapture,
    givesCheck: facts.givesCheck,
    onlyMove,
    viableAlternatives,
    hasSacrifice: Boolean(sacrifice),
    legalMoves,
  });
  const stability = estimateStability(input);
  const confidence = estimateConfidence({
    isBest,
    alternativesAvailable,
    hasShallow: input.shallowBeforeCp !== undefined,
    stability,
    sacrifice,
    onlyMove,
  });

  const reasons: string[] = [];
  if (isBest) reasons.push("Engine's own first choice.");
  if (sacrifice) {
    reasons.push(
      `Gives up ${sacrifice.materialGiven.toFixed(0)} point${sacrifice.materialGiven === 1 ? "" : "s"} of material with ${sacrifice.compensationPawns >= 0 ? "the better of it" : "compensation"}.`,
    );
  }
  if (onlyMove) reasons.push("No searched alternative held the evaluation.");
  if (alternativesAvailable && viableAlternatives !== null && viableAlternatives > 0) {
    reasons.push(
      `${viableAlternatives} other move${viableAlternatives === 1 ? "" : "s"} stayed within ${(t.viableBandCp / PAWN).toFixed(1)} pawn.`,
    );
  }
  reasons.push(
    `Difficulty ${(difficulty * 100).toFixed(0)}% · confidence ${(confidence * 100).toFixed(0)}%.`,
  );

  const evidence: ExceptionalEvidence = {
    isBest,
    legalMoves,
    viableAlternatives,
    alternativesAvailable,
    difficulty,
    stability,
    confidence,
    sacrifice,
    onlyMove,
    swingPawns,
    beforePawns,
    afterPawns,
    motifs,
    reasons,
  };

  // A move that is simply mate-in-one is never brilliant or exceptional: the
  // whole point of the classes is to reward moves that are hard to find.
  const trivialMate = facts.isMate && !sacrifice;

  if (input.isBook || input.forced || !isBest || cpLoss > t.qualityCp || trivialMate) {
    return { classification: null, evidence };
  }

  const brilliantAlternatives = viableAlternatives ?? 1;
  const brilliant =
    sacrifice !== null &&
    sacrifice.sound &&
    sacrifice.materialGiven >= t.brilliantMaterial &&
    brilliantAlternatives <= t.brilliantMaxAlternatives &&
    difficulty >= t.brilliantDifficulty &&
    confidence >= t.brilliantConfidence;

  if (brilliant) return { classification: "brilliant", evidence };

  const savesTheDay = onlyMove && input.beforeCp <= 0;
  const exceptional =
    (swingPawns >= t.exceptionalSwing || savesTheDay) &&
    difficulty >= t.exceptionalDifficulty &&
    confidence >= t.exceptionalConfidence;

  if (exceptional) return { classification: "exceptional", evidence };

  return { classification: null, evidence };
}
