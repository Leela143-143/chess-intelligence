import { Chess, type PieceSymbol, type Square } from "chess.js";
import { classifyMove, toCp, type MoveClassification } from "./classification";
import { classifyExceptional } from "./exceptional";
import { CRITICAL_MOMENT_CP_THRESHOLD, accuracyFromLosses, acplFromLosses } from "./metrics";
import { detectPhase } from "./phase";
import { detectTacticsAfterMove, type TacticTheme } from "./tactics";
import { detectOpening, type OpeningMatch } from "./openings";
import { legalMoveCountOf, staticExchange } from "./position";
import { START_FEN, applyUci, replayLine, uciToSan, plyLabel } from "./replay";
import {
  INTENSITY_SETTINGS,
  type AnalysisIntensity,
  type ClassificationCounts,
  type GamePhase,
  type KeyMoment,
  type KeyMomentKind,
  type MoveAssessment,
  type ReviewedGame,
  type ReviewProgress,
  type SideSummary,
} from "./review";
import type { AnalysisStrength, EngineEvaluation } from "@/lib/engine/types";
import { AnalysisAbortedError } from "@/lib/engine/types";

/**
 * Two-stage full-game review (brief §59–§63).
 *
 *   stage 1  shallow pass — evaluate every position after each ply
 *            ↓
 *   stage 2  critical-moment detection from the shallow data
 *            ↓
 *            deep pass — re-search only the moment plies and the engine's own
 *            best continuation for those plies
 *
 * The expensive search is therefore proportional to *interest*, not to game
 * length, which is what makes a full review viable on a phone (brief §60, §61).
 *
 * The pipeline is pure apart from the injected `analyze` function, so the
 * tests exercise the whole thing against a stub engine with no Stockfish.
 */

export type AnalyzeFn = (fen: string, strength: AnalysisStrength) => Promise<EngineEvaluation>;

export type AnalyzeGameArgs = {
  uciMoves: string[];
  analyze: AnalyzeFn;
  startFen?: string;
  signals?: AbortSignal;
  intensity?: AnalysisIntensity;
  /** Override the per-stage strengths (used by tests and the deep review). */
  shallowStrength?: AnalysisStrength;
  deepStrength?: AnalysisStrength;
  onProgress?: (progress: ReviewProgress) => void;
  /** Skip tactic detection for very long games (performance guard). */
  detectMotifs?: boolean;
  engineBuild?: string;
  /** Hard cap on plies to review; longer games are truncated honestly. */
  maxPlies?: number;
  /**
   * Per-ply seconds remaining on the clock (from PGN `%clk`). Supplying this
   * turns the time-management dimension from a guess into measured evidence.
   */
  clocks?: Array<number | null>;
};

const MOTIF_PLY_CAP = 240;

/**
 * Upper bound on extra deep searches spent hunting for brilliant moves
 * (Phase 2.5). Each candidate costs two searches, so this is the main control
 * on the added mobile cost of the hunt.
 */
const BRILLIANT_HUNT_MAX = 3;

function emptyCounts(): ClassificationCounts {
  return {
    brilliant: 0,
    exceptional: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    "missed-opportunity": 0,
    forced: 0,
    "only-move": 0,
  };
}

function emptyPhase(): Record<GamePhase, number> {
  return { opening: 0, middlegame: 0, endgame: 0 };
}

function moverCp(whiteCp: number, mover: "w" | "b"): number {
  return mover === "w" ? whiteCp : -whiteCp;
}

/** Fold a mate score into a plottable centipawn number. */
export function plotCp(cp: number, mate: number | null): number {
  if (mate === null || mate === 0) return cp;
  const base = 10_000 - Math.abs(mate) * 10;
  return mate > 0 ? base : -base;
}

/** "-1.24" / "+3.05" / "M5" / "-M4" in pawns. */
export function formatEval(cp: number, mate: number | null): string {
  if (mate !== null && mate !== 0) return mate > 0 ? `M${mate}` : `M-${Math.abs(mate)}`;
  const pawns = cp / 100;
  return `${pawns >= 0 ? "+" : "−"}${Math.abs(pawns).toFixed(2)}`;
}

/** Human tier for a White-perspective evaluation (brief §20). */
export function evalTier(cp: number, mate: number | null): string {
  if (mate !== null && mate !== 0) return mate > 0 ? "White has a forced mate" : "Black has a forced mate";
  const pawns = cp / 100;
  const abs = Math.abs(pawns);
  const side = pawns >= 0 ? "White" : "Black";
  if (abs < 0.35) return "The position is balanced";
  if (abs < 0.9) return `${side} is slightly better`;
  if (abs < 1.8) return `${side} is clearly better`;
  if (abs < 3.5) return `${side} is winning`;
  return `${side} is completely winning`;
}

/* ------------------------------------------------------------------ moments */

const MOTIF_LESSON: Partial<Record<TacticTheme, string>> = {
  fork: "Before every quiet move, scan for knight forks — two enemy pieces on one colour of square.",
  "double-attack": "Check which enemy pieces share a line or diagonal before committing a piece.",
  pin: "When a piece is pinned, add pressure to it instead of capturing it straight away.",
  skewer: "Look for the more valuable piece in front: the one behind it is the real target.",
  "hanging-piece": "Count attackers and defenders after every move you consider.",
  "mate-in-one": "Scan for mate threats on every move, yours and your opponent's.",
  "back-rank-mate": "Leave your king an escape square, or block the back rank before it is needed.",
  "discovered-check": "Move the front piece only when the piece behind it has a target.",
  "double-check": "Double check cannot be blocked — only the king can move.",
};

function phaseLesson(phase: GamePhase): string {
  switch (phase) {
    case "opening":
      return "In the opening, finish development and castle before starting operations.";
    case "middlegame":
      return "In the middlegame, compare candidates by king safety, piece activity and pawn structure.";
    default:
      return "In the endgame, activate the king and calculate pawn races to the move.";
  }
}

function classificationLesson(classification: MoveClassification, phase: GamePhase): string {
  switch (classification) {
    case "blunder":
      return "Before playing a forcing move, check every reply: captures, checks and threats.";
    case "mistake":
      return "Take one extra pass over the candidate moves; the best move was close.";
    case "missed-opportunity":
      return "When you are better, look for the move that increases the advantage rather than holding it.";
    case "inaccuracy":
      return "Ask what changed in the position before choosing a natural-looking move.";
    default:
      return phaseLesson(phase);
  }
}

function describeSwing(moment: {
  mover: "w" | "b";
  evalBeforeCp: number;
  evalAfterCp: number;
  mateBefore: number | null;
  mateAfter: number | null;
}): string {
  const before = formatEval(moment.evalBeforeCp, moment.mateBefore);
  const after = formatEval(moment.evalAfterCp, moment.mateAfter);
  const side = moment.mover === "w" ? "White" : "Black";
  const beforeM = moverCp(moment.evalBeforeCp, moment.mover);
  const afterM = moverCp(moment.evalAfterCp, moment.mover);
  const lost = (beforeM - afterM) / 100;
  const direction = lost >= 0 ? "lost" : "gained";
  return `${side}'s ${Math.abs(lost).toFixed(2)} pawns ${direction} of advantage: ${before} → ${after}`;
}

export function explainMoment(args: {
  kind: KeyMomentKind;
  mover: "w" | "b";
  san: string;
  ply: number;
  cpLoss: number;
  evalBeforeCp: number;
  evalAfterCp: number;
  mateBefore: number | null;
  mateAfter: number | null;
  phase: GamePhase;
  classification: MoveClassification;
  motifs: TacticTheme[];
  bestSan: string | null;
}): { explanation: string; lesson: string } {
  const parts: string[] = [];
  const motifClause = args.motifs[0]
    ? ` The position turned on a ${args.motifs[0].replace(/-/g, " ")}.`
    : "";

  switch (args.kind) {
    case "brilliant":
      parts.push(
        `${plyLabel(args.ply, args.san)} is a sound sacrifice — the engine endorses it.`,
      );
      break;
    case "exceptional":
      parts.push(`${plyLabel(args.ply, args.san)} is the hardest move in the game to find.`);
      break;
    case "allowed-mate": {
      const n = args.mateAfter !== null ? Math.abs(args.mateAfter) : null;
      parts.push(
        `${plyLabel(args.ply, args.san)} allows a forced mate${n !== null ? ` in ${n}` : ""}.`,
      );
      break;
    }
    case "missed-mate": {
      const n = args.mateBefore !== null ? Math.abs(args.mateBefore) : null;
      parts.push(
        `There was a forced mate${n !== null ? ` in ${n}` : ""} available and ${args.san} let it go.`,
      );
      break;
    }
    case "material-loss":
      parts.push(`${plyLabel(args.ply, args.san)} loses material: ${describeSwing(args)}.`);
      break;
    case "defensive-failure":
      parts.push(
        `${plyLabel(args.ply, args.san)} does not solve the pressure: ${describeSwing(args)}.`,
      );
      break;
    default:
      parts.push(
        `This is the largest swing in the game — ${describeSwing(args)}.`,
      );
  }

  if (args.bestSan && args.bestSan !== args.san) {
    parts.push(`The engine preferred ${args.bestSan}.`);
  }
  if (motifClause) parts.push(motifClause.trim());

  const lesson = args.motifs[0]
    ? MOTIF_LESSON[args.motifs[0]] ?? phaseLesson(args.phase)
    : classificationLesson(args.classification, args.phase);

  return { explanation: parts.join(" "), lesson };
}

/* --------------------------------------------------------------- pipeline */

function summarise(
  color: "w" | "b",
  plies: MoveAssessment[],
): SideSummary {
  const own = plies.filter((move) => move.mover === color);
  const losses = own.map((move) => move.cpLoss);
  const counts = emptyCounts();
  const phaseAcpl = emptyPhase();
  const phaseCount = emptyPhase();
  const motifTally = new Map<TacticTheme, number>();

  for (const move of own) {
    counts[move.classification] += 1;
    phaseAcpl[move.phase] += move.cpLoss;
    phaseCount[move.phase] += 1;
    for (const motif of move.motifs) {
      motifTally.set(motif, (motifTally.get(motif) ?? 0) + 1);
    }
  }

  for (const phase of ["opening", "middlegame", "endgame"] as GamePhase[]) {
    phaseAcpl[phase] =
      phaseCount[phase] > 0 ? Math.round(phaseAcpl[phase] / phaseCount[phase]) : 0;
  }

  return {
    color,
    acpl: acplFromLosses(losses),
    accuracy: accuracyFromLosses(losses),
    counts,
    blunderPlies: own.filter((m) => m.classification === "blunder").map((m) => m.ply),
    mistakePlies: own.filter((m) => m.classification === "mistake").map((m) => m.ply),
    inaccuracyPlies: own.filter((m) => m.classification === "inaccuracy").map((m) => m.ply),
    bestPlies: own
      .filter(
        (m) =>
          m.classification === "best" ||
          m.classification === "only-move" ||
          m.classification === "brilliant" ||
          m.classification === "exceptional",
      )
      .map((m) => m.ply),
    phaseAcpl,
    phaseCount,
    motifs: [...motifTally.entries()]
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function momentKind(move: MoveAssessment): KeyMomentKind | null {
  const beforeM = moverCp(toCp(move.evalBeforeCp, move.evalBeforeMate), move.mover);
  const afterM = moverCp(toCp(move.evalAfterCp, move.evalAfterMate), move.mover);
  const hadMate = beforeM > 9000;
  const facedMate = beforeM < -9000;
  const allowedMate = afterM < -9000;
  const lostMate = hadMate && afterM < 9000;

  if (allowedMate && !facedMate) return "allowed-mate";
  if (lostMate) return "missed-mate";
  if (move.cpLoss >= 400) return "material-loss";
  if (move.cpLoss >= CRITICAL_MOMENT_CP_THRESHOLD) {
    return beforeM < -80 ? "defensive-failure" : "largest-swing";
  }
  return null;
}

/** Severity used to rank moments; mates always outrank material. */
function severity(kind: KeyMomentKind, cpLoss: number): number {
  const base =
    kind === "allowed-mate" || kind === "missed-mate" ? 10_000 : Math.min(cpLoss, 3_000);
  return base + cpLoss / 1000;
}

/**
 * Assess a single move from the two engine evaluations around it.
 * Extracted so the live analysis board and the full review agree exactly.
 */
export function assessMove(args: {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: EngineEvaluation;
  evalAfter: EngineEvaluation;
  /** Override the mover (defaults to the side to move in fenBefore). */
  mover?: "w" | "b";
  detectMotifs?: boolean;
  replyUci?: string | null;
}): MoveAssessment {
  const { evalBefore, evalAfter, fenBefore, fenAfter } = args;
  let mover: "w" | "b" = args.mover ?? (args.ply % 2 === 1 ? "w" : "b");
  let legalMoveCount = 20;
  try {
    const board = new Chess(fenBefore);
    mover = args.mover ?? board.turn();
    legalMoveCount = board.moves().length;
  } catch {
    /* keep defaults */
  }

  const result = classifyMove({
    playedUci: args.uci,
    bestUci: evalBefore.bestMove,
    evalBeforeCp: evalBefore.scoreCp,
    evalBeforeMate: evalBefore.mateIn,
    evalAfterCp: evalAfter.scoreCp,
    evalAfterMate: evalAfter.mateIn,
    mover,
    legalMoveCount,
  });

  const motifs =
    args.detectMotifs === false ? [] : detectTacticsAfterMove(fenBefore, args.uci).map((t) => t.theme);

  const reply = args.replyUci ?? evalAfter.bestMove;
  const allowedMotifs =
    args.detectMotifs === false || !reply
      ? []
      : detectTacticsAfterMove(fenAfter, reply).map((t) => t.theme);

  let allowedCheck = false;
  if (reply) {
    try {
      const board = new Chess(fenAfter);
      const played = board.move({
        from: reply.slice(0, 2),
        to: reply.slice(2, 4),
        promotion: reply.length > 4 ? (reply.slice(4, 5) as PieceSymbol) : undefined,
      });
      allowedCheck = Boolean(played && /[+#]/.test(played.san));
    } catch {
      allowedCheck = false;
    }
  }

  return {
    ply: args.ply,
    san: args.san,
    uci: args.uci,
    mover,
    fenBefore,
    fenAfter,
    evalBeforeCp: evalBefore.scoreCp,
    evalBeforeMate: evalBefore.mateIn,
    evalAfterCp: evalAfter.scoreCp,
    evalAfterMate: evalAfter.mateIn,
    bestUci: evalBefore.bestMove,
    bestSan: evalBefore.bestMove ? uciToSan(fenBefore, evalBefore.bestMove) : null,
    cpLoss: result.cpLoss,
    cpOpportunity: result.cpOpportunity,
    classification: result.classification,
    phase: detectPhase(fenBefore, args.ply - 1),
    motifs,
    allowedMotifs,
    allowedCheck,
    deep: false,
    pv: evalBefore.pv,
  };
}

/** Convert a White-perspective score to the mover's perspective. */
function moverCpOf(whiteCp: number, mover: "w" | "b"): number {
  return mover === "w" ? whiteCp : -whiteCp;
}

/**
 * Cheap, engine-free pre-filter for the brilliant hunt.
 *
 * Asks: does this move leave material on its destination square that the
 * opponent can win by force? Sacrifices whose point is several moves away are
 * still caught later, by the main line the exceptional engine walks.
 */
function offersMaterial(move: MoveAssessment): boolean {
  const to = move.uci.slice(2, 4);
  if (to.length !== 2) return false;
  const opponent = move.mover === "w" ? "b" : "w";
  try {
    return staticExchange(move.fenAfter, to as Square, opponent) >= 2;
  } catch {
    return false;
  }
}

/**
 * Run the exceptional-move engine on a deep-analysed ply and adopt its verdict
 * when it has one.
 *
 * Shared by the critical-moment pass and the brilliant hunt so both apply
 * exactly the same rules — a move can never be brilliant in one place and
 * ordinary in another.
 */
function applyExceptional(
  move: MoveAssessment,
  deepBefore: EngineEvaluation,
  deepAfter: EngineEvaluation,
  shallowBeforeCp: number,
  shallowBestUci: string | null,
  refinedClassification: MoveClassification,
): void {
  const alternatives = (deepBefore.alternatives ?? [])
    .filter((line) => Boolean(line.bestMove))
    .map((line) => ({ uci: line.bestMove as string, cp: moverCpOf(line.scoreCp, move.mover) }));

  const result = classifyExceptional({
    playedUci: move.uci,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    mover: move.mover,
    beforeCp: moverCpOf(deepBefore.scoreCp, move.mover),
    afterCp: moverCpOf(deepAfter.scoreCp, move.mover),
    bestUci: move.bestUci,
    alternatives,
    pv: deepBefore.pv,
    shallowBeforeCp: moverCpOf(shallowBeforeCp, move.mover),
    shallowBestUci,
    legalMoves: legalMoveCountOf(move.fenBefore) ?? 20,
    isBook: refinedClassification === "book",
    forced: refinedClassification === "forced",
    motifs: move.motifs,
  });

  move.exceptional = result.evidence;
  if (result.classification) move.classification = result.classification;
}

export async function analyzeGame(args: AnalyzeGameArgs): Promise<ReviewedGame> {
  const started = Date.now();
  const intensity = args.intensity ?? "standard";
  const preset = INTENSITY_SETTINGS[intensity];
  const shallowStrength = args.shallowStrength ?? preset.shallow;
  const deepStrength = args.deepStrength ?? preset.deep;
  const maxPlies = args.maxPlies ?? 300;
  const detectMotifs = args.detectMotifs ?? true;
  const report = args.onProgress ?? (() => undefined);

  const checkAbort = () => {
    if (args.signals?.aborted) throw new AnalysisAbortedError("Review cancelled");
  };

  report({ stage: "prepare", ratio: 0.02, text: "Reconstructing your game…" });

  const replay = replayLine(args.startFen ?? START_FEN, args.uciMoves);
  const fens = replay.fens.slice(0, maxPlies + 1);
  const sans = replay.sans.slice(0, maxPlies);
  const uci = replay.uci.slice(0, maxPlies);
  const plies = sans.length;

  if (plies === 0) {
    report({ stage: "summarise", ratio: 1, text: "Nothing to review." });
    return {
      plies: 0,
      moves: [],
      evalPoints: [{ ply: 0, cp: 0, mate: null }],
      moments: [],
      white: summarise("w", []),
      black: summarise("b", []),
      opening: null,
      strongest: null,
      engineBuild: args.engineBuild ?? "unknown",
      strength: shallowStrength,
      deepStrength,
      durationMs: Date.now() - started,
      analyzedPlies: 0,
      deepPlies: 0,
    };
  }

  /* ---------------------------------------------------- stage 1: shallow */
  const cache = new Map<string, EngineEvaluation>();
  const evals: EngineEvaluation[] = [];

  for (let i = 0; i < fens.length; i++) {
    checkAbort();
    const fen = fens[i]!;
    let evaluation = cache.get(fen);
    if (!evaluation) {
      evaluation = await args.analyze(fen, shallowStrength);
      cache.set(fen, evaluation);
    }
    evals.push(evaluation);
    report({
      stage: "shallow",
      ratio: 0.05 + 0.55 * ((i + 1) / fens.length),
      text: "Finding the moments that mattered…",
      ply: i,
      totalPlies: fens.length,
      detail: `position ${i + 1} / ${fens.length}`,
    });
  }

  /* --------------------------------- stage 1b: assessments + classification */
  const moves: MoveAssessment[] = [];
  for (let i = 0; i < plies; i++) {
    const before = evals[i]!;
    const after = evals[i + 1]!;
    const fenBefore = fens[i]!;
    const fenAfter = fens[i + 1]!;
    const uciMove = uci[i]!;
    const mover: "w" | "b" = i % 2 === 0 ? "w" : "b";

    moves.push(
      assessMove({
        ply: i + 1,
        san: sans[i]!,
        uci: uciMove,
        fenBefore,
        fenAfter,
        evalBefore: before,
        evalAfter: after,
        mover,
        detectMotifs: detectMotifs && plies <= MOTIF_PLY_CAP,
      }),
    );
  }

  // Attach clock evidence where the source PGN provided it. Thinking time is
  // the drop from the previous clock value for the same side, so the first
  // move of each side has no measurable think time and stays null.
  if (args.clocks && args.clocks.length > 0) {
    const lastSeen: Record<"w" | "b", number | null> = { w: null, b: null };
    for (const move of moves) {
      const remaining = args.clocks[move.ply - 1] ?? null;
      move.clockSeconds = remaining;
      const previous = lastSeen[move.mover];
      move.thinkSeconds =
        remaining !== null && previous !== null && previous >= remaining
          ? Math.round(previous - remaining)
          : null;
      if (remaining !== null) lastSeen[move.mover] = remaining;
    }
  }

  /* ----------------------------------------- stage 2: critical detection */
  report({ stage: "critical", ratio: 0.62, text: "Ranking the turning points…" });

  const candidates = moves
    .map((move) => ({ move, kind: momentKind(move) }))
    .filter((entry): entry is { move: MoveAssessment; kind: KeyMomentKind } => entry.kind !== null)
    .sort((a, b) => severity(b.kind, b.move.cpLoss) - severity(a.kind, a.move.cpLoss));

  const chosen = candidates.slice(0, preset.moments);

  /* --------------------------------------------------- stage 2b: deep pass */
  let deepPlies = 0;
  for (let i = 0; i < chosen.length; i++) {
    checkAbort();
    const entry = chosen[i]!;
    const move = entry.move;
    // Shallow evidence must be captured before the deep pass overwrites it —
    // it is what the stability estimate is computed from.
    const shallowBeforeCp = move.evalBeforeCp;
    const shallowBestUci = move.bestUci;
    try {
      const deepBefore = await args.analyze(move.fenBefore, deepStrength);
      cache.set(move.fenBefore, deepBefore);
      move.bestUci = deepBefore.bestMove ?? move.bestUci;
      move.bestSan = move.bestUci ? uciToSan(move.fenBefore, move.bestUci) : move.bestSan;
      move.pv = deepBefore.pv;
      // Re-evaluate the played move's resulting position so the swing is
      // measured with the deeper search on both sides of the decision.
      const deepAfter = await args.analyze(move.fenAfter, deepStrength);
      cache.set(move.fenAfter, deepAfter);

      // Real legal move count, read from the position (Phase 2.5 fix — this
      // used to be the literal 20, which silently mis-scored forced lines).
      const legalMoveCount = legalMoveCountOf(move.fenBefore) ?? 20;

      const refined = classifyMove({
        playedUci: move.uci,
        bestUci: move.bestUci,
        evalBeforeCp: deepBefore.scoreCp,
        evalBeforeMate: deepBefore.mateIn,
        evalAfterCp: deepAfter.scoreCp,
        evalAfterMate: deepAfter.mateIn,
        mover: move.mover,
        legalMoveCount,
      });
      move.evalBeforeCp = deepBefore.scoreCp;
      move.evalBeforeMate = deepBefore.mateIn;
      move.evalAfterCp = deepAfter.scoreCp;
      move.evalAfterMate = deepAfter.mateIn;
      move.cpLoss = refined.cpLoss;
      move.cpOpportunity = refined.cpOpportunity;
      move.classification = refined.classification;
      move.deep = true;
      deepPlies += 1;

      // Phase 2.5: the deep pass is the only place with both MultiPV lines and
      // both search strengths, so it is where brilliant/exceptional is decided.
      applyExceptional(move, deepBefore, deepAfter, shallowBeforeCp, shallowBestUci, refined.classification);

      // What the engine's own move would have led to.
      if (move.bestUci) {
        const bestChildFen = applyUci(move.fenBefore, move.bestUci);
        if (bestChildFen) {
          const child = await args.analyze(bestChildFen, deepStrength);
          cache.set(bestChildFen, child);
          move.bestChildCp = child.scoreCp;
        }
      }
    } catch (error) {
      if (error instanceof AnalysisAbortedError) throw error;
      // A failed deep search must not fail the review — the shallow data stands.
    }
    report({
      stage: "deep",
      ratio: 0.68 + 0.27 * ((i + 1) / chosen.length),
      text: "Verifying the critical positions…",
      ply: move.ply,
      totalPlies: chosen.length,
      detail: `moment ${i + 1} / ${chosen.length}`,
    });
  }

  /* ------------------------------------------- stage 3: brilliant hunt */
  // Brilliant moves are never errors, so momentKind() can never surface them.
  // We pre-filter without the engine (material offered, evaluation held) and
  // only pay for a deep MultiPV search on the few survivors, which keeps the
  // extra cost bounded on mobile.
  const brilliantCandidates = moves
    .filter((move) => !move.deep)
    .filter((move) => move.cpLoss <= 20 && move.classification === "best")
    .filter(offersMaterial)
    // Most promising first: the sacrifices where the mover is best placed.
    .sort((a, b) => moverCp(b.evalAfterCp, b.mover) - moverCp(a.evalAfterCp, a.mover))
    .slice(0, BRILLIANT_HUNT_MAX);

  for (const move of brilliantCandidates) {
    checkAbort();
    const shallowBeforeCp = move.evalBeforeCp;
    const shallowBestUci = move.bestUci;
    try {
      const deepBefore = await args.analyze(move.fenBefore, deepStrength);
      const deepAfter = await args.analyze(move.fenAfter, deepStrength);
      cache.set(move.fenBefore, deepBefore);
      cache.set(move.fenAfter, deepAfter);
      move.bestUci = deepBefore.bestMove ?? move.bestUci;
      move.bestSan = move.bestUci ? uciToSan(move.fenBefore, move.bestUci) : move.bestSan;
      move.pv = deepBefore.pv;
      move.evalBeforeCp = deepBefore.scoreCp;
      move.evalBeforeMate = deepBefore.mateIn;
      move.evalAfterCp = deepAfter.scoreCp;
      move.evalAfterMate = deepAfter.mateIn;
      move.deep = true;
      move.cpLoss = Math.max(0, moverCpOf(deepBefore.scoreCp, move.mover) - moverCpOf(deepAfter.scoreCp, move.mover));
      applyExceptional(move, deepBefore, deepAfter, shallowBeforeCp, shallowBestUci, "best");
      deepPlies += 1;
    } catch (error) {
      if (error instanceof AnalysisAbortedError) throw error;
      // An unconfirmed candidate simply stays an ordinary "best" move.
    }
    report({
      stage: "deep",
      ratio: 0.95,
      text: "Confirming the brightest idea…",
      ply: move.ply,
    });
  }

  /* ------------------------------------------------------------ summarise */
  report({ stage: "summarise", ratio: 0.97, text: "Writing your summary…" });

  const toMoment = (move: MoveAssessment, kind: KeyMomentKind): KeyMoment => {
    const { explanation, lesson } = explainMoment({
      kind,
      mover: move.mover,
      san: move.san,
      ply: move.ply,
      cpLoss: move.cpLoss,
      evalBeforeCp: move.evalBeforeCp,
      evalAfterCp: move.evalAfterCp,
      mateBefore: move.evalBeforeMate,
      mateAfter: move.evalAfterMate,
      phase: move.phase,
      classification: move.classification,
      motifs: move.motifs,
      bestSan: move.bestSan,
    });
    return {
      ply: move.ply,
      kind,
      san: move.san,
      mover: move.mover,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      evalBeforeCp: move.evalBeforeCp,
      evalAfterCp: move.evalAfterCp,
      mateBefore: move.evalBeforeMate,
      mateAfter: move.evalAfterMate,
      cpLoss: move.cpLoss,
      bestUci: move.bestUci,
      bestSan: move.bestSan,
      ...(move.bestChildCp !== undefined ? { bestChildCp: move.bestChildCp } : {}),
      classification: move.classification,
      phase: move.phase,
      motifs: move.motifs,
      allowedMotifs: move.allowedMotifs,
      explanation,
      lesson,
      deep: move.deep,
      ...(move.exceptional ? { exceptional: move.exceptional } : {}),
    };
  };

  const moments: KeyMoment[] = chosen.map((entry) => toMoment(entry.move, entry.kind));

  // Phase 2.5: confirmed brilliant/exceptional plies join the same ranked list,
  // so The Moment can feature a highlight and not only a mistake.
  const highlights: KeyMoment[] = moves
    .filter(
      (move) =>
        (move.classification === "brilliant" || move.classification === "exceptional") &&
        !moments.some((moment) => moment.ply === move.ply),
    )
    .map((move) =>
      toMoment(move, move.classification === "brilliant" ? "brilliant" : "exceptional"),
    );

  const allMoments: KeyMoment[] = [...moments, ...highlights].sort((a, b) => a.ply - b.ply);

  // Built from the final (deep-refined) assessments so the graph and the
  // ranked moments can never disagree with each other.
  const evalPoints = [
    {
      ply: 0,
      cp: plotCp(moves[0]?.evalBeforeCp ?? evals[0]?.scoreCp ?? 0, moves[0]?.evalBeforeMate ?? null),
      mate: moves[0]?.evalBeforeMate ?? evals[0]?.mateIn ?? null,
    },
    ...moves.map((move) => ({
      ply: move.ply,
      cp: plotCp(move.evalAfterCp, move.evalAfterMate),
      mate: move.evalAfterMate,
    })),
  ];

  // Strongest move: the best-classified own move that gained the most.
  let strongest: ReviewedGame["strongest"] = null;
  let bestGain = -Infinity;
  for (const move of moves) {
    if (
      move.classification !== "best" &&
      move.classification !== "only-move" &&
      move.classification !== "brilliant" &&
      move.classification !== "exceptional"
    ) {
      continue;
    }
    const gain = moverCp(move.evalAfterCp, move.mover) - moverCp(move.evalBeforeCp, move.mover);
    if (gain > bestGain) {
      bestGain = gain;
      strongest = { ply: move.ply, san: move.san, mover: move.mover };
    }
  }

  const opening: OpeningMatch | null = detectOpening(sans);

  report({ stage: "summarise", ratio: 1, text: "Review complete." });

  return {
    plies,
    moves,
    evalPoints,
    moments: allMoments,
    white: summarise("w", moves),
    black: summarise("b", moves),
    opening,
    strongest,
    engineBuild: args.engineBuild ?? "unknown",
    strength: shallowStrength,
    deepStrength,
    durationMs: Date.now() - started,
    analyzedPlies: fens.length,
    deepPlies,
  };
}

/** Serialise a review for storage (drops nothing; kept explicit for clarity). */
export function reviewToRecord(review: ReviewedGame): {
  moves: MoveAssessment[];
  moments: KeyMoment[];
} {
  return { moves: review.moves, moments: review.moments };
}
