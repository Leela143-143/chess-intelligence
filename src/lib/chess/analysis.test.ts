import { describe, expect, it } from "vitest";
import { analyzeGame } from "./analysis";
import { AnalysisAbortedError } from "@/lib/engine/types";
import { replayLine } from "./replay";
import type { ReviewProgress } from "./review";
import { START_FEN, stubEngine } from "@/test/fixtures";

/**
 * The review pipeline is the heart of Phase 2. These tests pin the contract
 * the UI depends on: White-perspective evaluations, mover-perspective losses,
 * a two-stage search, honest progress, and real cancellation.
 */

const LINE = ["e2e4", "e7e5", "g1f3", "b8c6"];

function tableFor(whiteCpByPly: number[], mates: Record<number, number> = {}) {
  const { fens } = replayLine(START_FEN, LINE);
  const table = new Map<string, { scoreCp: number; mateIn: number | null }>();
  fens.forEach((fen, index) => {
    table.set(fen, { scoreCp: whiteCpByPly[index] ?? 0, mateIn: mates[index] ?? null });
  });
  return table;
}

async function review(whiteCpByPly: number[], mates: Record<number, number> = {}) {
  const engine = stubEngine(tableFor(whiteCpByPly, mates));
  const progress: ReviewProgress[] = [];
  const result = await analyzeGame({
    uciMoves: LINE,
    analyze: engine.analyze,
    intensity: "fast",
    onProgress: (entry) => progress.push(entry),
  });
  return { result, progress, engine };
}

describe("analyzeGame — perspective and loss attribution", () => {
  it("reviews every ply and keeps evaluations White-perspective", async () => {
    const { result } = await review([0, 30, 20, 20, 320]);

    expect(result.plies).toBe(4);
    expect(result.moves).toHaveLength(4);
    expect(result.evalPoints).toHaveLength(5);

    // FEN order is White's turn, Black's turn, ...; the evals stay White's.
    expect(result.moves[0]!.mover).toBe("w");
    expect(result.moves[1]!.mover).toBe("b");
    expect(result.evalPoints[1]!.cp).toBe(30);
    expect(result.evalPoints[4]!.cp).toBe(320);
  });

  it("charges the loss to the side that moved, not to White", async () => {
    const { result } = await review([0, 30, 20, 20, 320]);

    // White improved the position twice: no loss.
    expect(result.moves[0]!.cpLoss).toBe(0);
    expect(result.moves[2]!.cpLoss).toBe(0);
    // Black's move dropped White's score by 300cp: Black lost 300.
    expect(result.moves[3]!.cpLoss).toBe(300);
    expect(result.moves[3]!.classification).toBe("blunder");
    expect(result.black.acpl).toBeGreaterThan(result.white.acpl);
    expect(result.white.accuracy).toBeGreaterThan(result.black.accuracy);
  });

  it("folds mate scores into the plot while keeping the mate count", async () => {
    const { result } = await review([0, 30, 20, 20, 0], { 4: 3 });

    expect(result.moves[3]!.evalAfterMate).toBe(3);
    expect(result.evalPoints[4]!.mate).toBe(3);
    expect(result.evalPoints[4]!.cp).toBe(10_000 - 30);
    expect(result.moments.length).toBeGreaterThan(0);
    expect(result.moments[0]!.explanation.toLowerCase()).toContain("mate");
  });
});

describe("analyzeGame — two-stage search", () => {
  it("deepens only the positions it ranked as critical", async () => {
    const { result, engine } = await review([0, 30, 20, 20, 320]);

    expect(result.moments).toHaveLength(1);
    expect(result.moments[0]!.ply).toBe(4);
    expect(result.moments[0]!.deep).toBe(true);
    expect(result.moments[0]!.cpLoss).toBe(300);
    expect(result.deepPlies).toBe(1);

    // Quiet plies are never re-searched.
    expect(result.moves[0]!.deep).toBe(false);
    expect(result.moves[2]!.deep).toBe(false);

    // The deep pass really used the deeper strength ("fast" preset → standard).
    expect(engine.calls.some((call) => call.strength === "standard")).toBe(true);
    const shallowCalls = engine.calls.filter((call) => call.strength === "fast");
    expect(shallowCalls).toHaveLength(5);
  });

  it("ranks moments by cost and returns them in move order", async () => {
    const { result } = await review([0, 0, -400, -400, 600, -600]);

    const plies = result.moments.map((moment) => moment.ply);
    expect([...plies].sort((a, b) => a - b)).toEqual(plies);
    expect(result.moments[0]!.cpLoss).toBeGreaterThanOrEqual(
      result.moments[result.moments.length - 1]!.cpLoss,
    );
    expect(result.moments.every((moment) => moment.explanation.length > 20)).toBe(true);
    expect(result.moments.every((moment) => moment.lesson.length > 10)).toBe(true);
    expect(plies.length).toBeGreaterThan(0);
  });
});

describe("analyzeGame — progress, bounds and cancellation", () => {
  it("reports monotonic progress that ends at 1", async () => {
    const { progress } = await review([0, 30, 20, 20, 320]);

    const ratios = progress.map((entry) => entry.ratio);
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios);
    expect(ratios[ratios.length - 1]!).toBe(1);
    expect(progress.map((entry) => entry.stage)).toContain("shallow");
    expect(progress.map((entry) => entry.stage)).toContain("deep");
    expect(progress.every((entry) => entry.text.length > 4)).toBe(true);
  });

  it("truncates honestly with maxPlies", async () => {
    const engine = stubEngine(tableFor([0, 30, 20, 20, 320]));
    const result = await analyzeGame({
      uciMoves: LINE,
      analyze: engine.analyze,
      maxPlies: 2,
      intensity: "fast",
    });
    expect(result.plies).toBe(2);
    expect(result.moves).toHaveLength(2);
    expect(result.analyzedPlies).toBe(3);
  });

  it("returns an empty review for an empty game", async () => {
    const engine = stubEngine(tableFor([]));
    const result = await analyzeGame({ uciMoves: [], analyze: engine.analyze });
    expect(result.plies).toBe(0);
    expect(result.moves).toHaveLength(0);
    expect(result.moments).toHaveLength(0);
    expect(result.evalPoints).toHaveLength(1);
    expect(engine.calls).toHaveLength(0);
  });

  it("throws AnalysisAbortedError when the signal is already aborted", async () => {
    const engine = stubEngine(tableFor([0, 30, 20, 20, 320]));
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeGame({
        uciMoves: LINE,
        analyze: engine.analyze,
        signals: controller.signal,
        intensity: "fast",
      }),
    ).rejects.toBeInstanceOf(AnalysisAbortedError);
  });

  it("survives a deep search that fails", async () => {
    const engine = stubEngine(tableFor([0, 30, 20, 20, 320]));
    const failing = (fen: string, strength: "fast" | "standard" | "deep" | "maximum") => {
      if (strength !== "fast") return Promise.reject(new Error("engine died"));
      return engine.analyze(fen, strength);
    };
    const result = await analyzeGame({ uciMoves: LINE, analyze: failing, intensity: "fast" });
    expect(result.moves).toHaveLength(4);
    expect(result.moments).toHaveLength(1);
    expect(result.moments[0]!.deep).toBe(false);
    expect(result.deepPlies).toBe(0);
  });
});
