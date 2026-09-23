import type { MoveAssessment } from "@/lib/chess/review";
import type { DnaGame } from "@/lib/chess/dna";
import type { PlayerGame } from "@/lib/player/stats";
import type { EngineEvaluation } from "@/lib/engine/types";
import type { AnalysisStrength } from "@/lib/engine/types";

/**
 * Fixtures for the analytical layer.
 *
 * Every fixture is built from observable inputs only (FENs, classifications,
 * cp losses) so a test asserts the *contract* rather than re-stating the
 * implementation. FENs are standard chess positions; nothing here is a
 * hard-coded engine value.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function makeMove(partial: Partial<MoveAssessment> & { ply: number }): MoveAssessment {
  const mover: "w" | "b" = partial.ply % 2 === 1 ? "w" : "b";
  return {
    ply: partial.ply,
    san: partial.san ?? (mover === "w" ? "e4" : "e5"),
    uci: partial.uci ?? (mover === "w" ? "e2e4" : "e7e5"),
    mover: partial.mover ?? mover,
    fenBefore: partial.fenBefore ?? START_FEN,
    fenAfter: partial.fenAfter ?? START_FEN,
    evalBeforeCp: partial.evalBeforeCp ?? 0,
    evalBeforeMate: partial.evalBeforeMate ?? null,
    evalAfterCp: partial.evalAfterCp ?? 0,
    evalAfterMate: partial.evalAfterMate ?? null,
    bestUci: partial.bestUci ?? null,
    bestSan: partial.bestSan ?? null,
    cpLoss: partial.cpLoss ?? 0,
    cpOpportunity: partial.cpOpportunity ?? 0,
    classification: partial.classification ?? "good",
    phase: partial.phase ?? "middlegame",
    motifs: partial.motifs ?? [],
    allowedMotifs: partial.allowedMotifs ?? [],
    allowedCheck: partial.allowedCheck ?? false,
    deep: partial.deep ?? false,
  };
}

export function makeDnaGame(partial: Partial<DnaGame> & { gameId: number }): DnaGame {
  return {
    gameId: partial.gameId,
    color: partial.color ?? "w",
    result: partial.result ?? "1-0",
    opening: partial.opening,
    timeControl: partial.timeControl,
    termination: partial.termination,
    importedAt: partial.importedAt ?? 0,
    moves: partial.moves ?? [],
    moments: partial.moments ?? [],
  };
}

/** A game where the player blundered the same motif twice. */
export function makeBlunderGame(
  gameId: number,
  options: { motif?: MoveAssessment["allowedMotifs"][number]; cpLoss?: number } = {},
): DnaGame {
  const motif = options.motif ?? "fork";
  const cpLoss = options.cpLoss ?? 300;
  return makeDnaGame({
    gameId,
    color: "w",
    result: "1-0",
    opening: "Italian Game",
    moves: [
      makeMove({ ply: 1, san: "e4", classification: "best" }),
      makeMove({ ply: 2, san: "e5", mover: "b", classification: "good" }),
      makeMove({
        ply: 5,
        san: "Nf3",
        classification: "blunder",
        cpLoss,
        allowedMotifs: [motif],
        bestUci: "f1c4",
        bestSan: "Bc4",
      }),
      makeMove({ ply: 6, san: "Nc6", mover: "b", classification: "good" }),
      makeMove({
        ply: 9,
        san: "d3",
        classification: "blunder",
        cpLoss,
        allowedMotifs: [motif],
        bestUci: "b1c3",
        bestSan: "Nc3",
      }),
    ],
  });
}

export function makePlayerGame(partial: Partial<PlayerGame> & { gameId: number }): PlayerGame {
  return {
    gameId: partial.gameId,
    color: partial.color ?? "w",
    result: partial.result ?? "1-0",
    date: partial.date,
    opening: partial.opening,
    eco: partial.eco,
    variation: partial.variation,
    timeControl: partial.timeControl,
    termination: partial.termination,
    elo: partial.elo,
    importedAt: partial.importedAt,
    accuracy: partial.accuracy,
    acpl: partial.acpl,
    counts: partial.counts,
    moves: partial.moves,
    moments: partial.moments,
  };
}

export function evaluation(
  fen: string,
  scoreCp: number,
  mateIn: number | null = null,
  bestMove: string | null = null,
  pv: string[] = [],
): EngineEvaluation {
  return {
    fen,
    bestMove,
    ponder: null,
    scoreCp,
    mateIn,
    depth: 12,
    pv,
    alternatives: [],
    nodes: 1000,
    timeMs: 5,
  };
}

export type StubEngine = {
  analyze: (fen: string, strength: AnalysisStrength) => Promise<EngineEvaluation>;
  calls: Array<{ fen: string; strength: AnalysisStrength }>;
};

/** A stub engine that answers from a FEN → evaluation table. */
export function stubEngine(table: Map<string, Partial<EngineEvaluation>>): StubEngine {
  const calls: StubEngine["calls"] = [];
  return {
    calls,
    analyze: (fen, strength) => {
      calls.push({ fen, strength });
      const entry = table.get(fen);
      if (!entry) return Promise.resolve(evaluation(fen, 0));
      return Promise.resolve(
        evaluation(fen, entry.scoreCp ?? 0, entry.mateIn ?? null, entry.bestMove ?? null, entry.pv ?? []),
      );
    },
  };
}
