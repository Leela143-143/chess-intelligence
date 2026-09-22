import { Chess } from "chess.js";
import { classifyMove } from "@/lib/chess/classification";
import { detectTacticsAfterMove } from "@/lib/chess/tactics";
import { detectPhase } from "@/lib/chess/phase";
import type { EngineEvaluation } from "@/lib/engine/types";
import type { CoachContext } from "./types";

/**
 * Build the structured CoachContext (spec §20) from deterministic sources.
 * The model only ever receives facts assembled by Stockfish + analytics.
 */
export function buildCoachContext(args: {
  fenBefore: string;
  fenAfter: string;
  san?: string;
  uci?: string;
  mover?: "w" | "b";
  evalBefore?: EngineEvaluation | null;
  evalAfter?: EngineEvaluation | null;
  ply: number;
}): CoachContext {
  const { fenBefore, fenAfter, evalBefore, evalAfter, ply } = args;

  let sideToMove: "w" | "b" = "w";
  let legalMoveCount = 20;
  try {
    const chess = new Chess(fenBefore);
    sideToMove = chess.turn();
    legalMoveCount = chess.moves().length;
  } catch {
    /* keep defaults */
  }

  const mover: "w" | "b" = args.mover ?? sideToMove;
  const playedBy = mover === "w" ? "white" : "black";

  let phase: CoachContext["phase"] = "middlegame";
  try {
    phase = detectPhase(fenAfter, ply);
  } catch {
    /* middlegame default */
  }

  const context: CoachContext = {
    position: { fen: fenAfter, sideToMove: mover === "w" ? "b" : "w" },
    phase,
  };

  if (args.san && args.uci) {
    context.move = { san: args.san, uci: args.uci, playedBy };
  }

  if (evalBefore || evalAfter) {
    // Contract: evaluations in PAWNS from White's perspective (spec §20 example).
    const pawns = (evaluation: EngineEvaluation | null): number | null =>
      evaluation ? Math.round(evaluation.scoreCp) / 100 : null;
    context.engine = {
      evaluationBefore: pawns(evalBefore ?? null),
      evaluationAfter: pawns(evalAfter ?? null),
      bestMove: evalBefore?.bestMove ?? null,
      depth: Math.max(evalBefore?.depth ?? 0, evalAfter?.depth ?? 0),
      pv: evalBefore?.pv ?? [],
    };
  }

  if (args.uci && evalBefore && evalAfter) {
    const classification = classifyMove({
      playedUci: args.uci,
      bestUci: evalBefore.bestMove,
      evalBeforeCp: evalBefore.scoreCp,
      evalBeforeMate: evalBefore.mateIn,
      evalAfterCp: evalAfter.scoreCp,
      evalAfterMate: evalAfter.mateIn,
      mover,
      legalMoveCount,
    });
    context.classification = classification.classification;
  }

  if (args.uci) {
    const tactics = detectTacticsAfterMove(fenBefore, args.uci);
    if (tactics[0]) context.theme = tactics[0].theme;
  }

  return context;
}
