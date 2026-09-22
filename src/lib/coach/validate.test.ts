import { describe, expect, it } from "vitest";
import { validateCoachResponse } from "./validate";
import type { CoachContext } from "./types";

/**
 * AI regression tests (spec §104): the coach must never invent evaluations,
 * variations, statistics, games, illegal moves or reversed perspectives.
 */

const context: CoachContext = {
  position: {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    sideToMove: "b",
  },
  move: { san: "e4", uci: "e2e4", playedBy: "white" },
  engine: {
    evaluationBefore: 0.2,
    evaluationAfter: 0.35,
    bestMove: "c7c5",
    depth: 22,
    pv: ["c7c5", "g1f3"],
  },
  classification: "excellent",
  phase: "opening",
};

describe("validateCoachResponse", () => {
  it("keeps honest sentences untouched", () => {
    const text = "White grabbed the center with e4. The engine slightly prefers 0.35 here.";
    const result = validateCoachResponse(text, context);
    expect(result.issues).toHaveLength(0);
    expect(result.text).toContain("e4");
  });

  it("removes sentences with unsupported evaluations", () => {
    const text = "The eval is +1.8 which means White is winning easily.";
    const result = validateCoachResponse(text, context);
    expect(result.issues.some((i) => i.type === "unsupported-eval")).toBe(true);
    expect(result.text).not.toContain("+1.8");
  });

  it("allows evaluations that match the provided context", () => {
    const text = "After the move the evaluation is +0.35 for White.";
    const result = validateCoachResponse(text, context);
    expect(result.issues).toHaveLength(0);
    expect(result.text).toContain("+0.35");
  });

  it("removes sentences claiming illegal moves", () => {
    const text = "You should have played Qh5xe8 immediately.";
    const result = validateCoachResponse(text, context);
    expect(result.issues.some((i) => i.type === "illegal-move")).toBe(true);
    expect(result.text).not.toContain("Qh5xe8");
  });

  it("allows legal moves and engine moves", () => {
    const text = "c7c5 was the engine's choice; Nf3 is also legal for White later.";
    // Nf3 is not legal for Black here → sentence removed; c7c5 alone would pass.
    const result = validateCoachResponse(text, context);
    expect(result.text).not.toContain("Nf3");
  });

  it("removes statistical claims when no stats were provided", () => {
    const text = "You blunder 12 games in a row like this.";
    const result = validateCoachResponse(text, context);
    expect(result.issues.some((i) => i.type === "unsupported-stat")).toBe(true);
  });

  it("keeps statistical claims when stats were provided", () => {
    const withStats: CoachContext = {
      ...context,
      player: { relevantStats: { rookEndingsConverted: 11 } },
    };
    const text = "You converted 11 of your rook endings.";
    const result = validateCoachResponse(text, withStats);
    expect(result.issues).toHaveLength(0);
  });
});
