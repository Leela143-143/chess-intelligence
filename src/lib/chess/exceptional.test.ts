import { describe, expect, it } from "vitest";
import { classifyExceptional, isExceptionalClass, moveFacts } from "./exceptional";
import type { ExceptionalInput } from "./exceptional";

/**
 * Fixtures are mirrored king-and-piece positions so the tactical facts are
 * unambiguous and the tests describe chess, not engine behaviour.
 */

/** White knight f4 -> d5, nothing attacks d5. No sacrifice. */
const QUIET_BEFORE = "4k3/8/8/8/5N2/8/8/4K3 w - - 0 1";
const QUIET_AFTER = "4k3/8/8/3N4/8/8/8/4K3 b - - 0 1";

/** Same move, but a black c6 pawn can take the knight: a real 3-point offer. */
const SAC_BEFORE = "4k3/8/2p5/8/5N2/8/8/4K3 w - - 0 1";
const SAC_AFTER = "4k3/8/2p5/3N4/8/8/8/4K3 b - - 0 1";

/** Re1-e8 is checkmate. */
const MATE_BEFORE = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
const MATE_AFTER = "4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1";

const base: ExceptionalInput = {
  playedUci: "f4d5",
  fenBefore: QUIET_BEFORE,
  fenAfter: QUIET_AFTER,
  mover: "w",
  beforeCp: 150,
  afterCp: 150,
  bestUci: "f4d5",
  alternatives: [{ uci: "e1e2", cp: 30 }],
  legalMoves: 11,
  shallowBeforeCp: 150,
  shallowBestUci: "f4d5",
};

describe("classifyExceptional — rarity", () => {
  it("does not call a plain engine-best move brilliant", () => {
    const result = classifyExceptional(base);
    expect(result.classification).toBeNull();
    expect(result.evidence.sacrifice).toBeNull();
    expect(result.evidence.isBest).toBe(true);
  });

  it("never awards anything for a mate-in-one", () => {
    const result = classifyExceptional({
      playedUci: "e1e8",
      fenBefore: MATE_BEFORE,
      fenAfter: MATE_AFTER,
      mover: "w",
      beforeCp: 9_000,
      afterCp: 10_000,
      bestUci: "e1e8",
      alternatives: [],
      legalMoves: 20,
    });
    // The move is best, wins instantly, and costs nothing — and still earns
    // nothing, because finding mate-in-one is not the skill being rewarded.
    expect(result.classification).toBeNull();
  });

  it("never awards anything to a book move", () => {
    const result = classifyExceptional({
      ...base,
      fenBefore: SAC_BEFORE,
      fenAfter: SAC_AFTER,
      legalMoves: 12,
      isBook: true,
    });
    expect(result.classification).toBeNull();
  });

  it("never awards anything to a forced move", () => {
    const result = classifyExceptional({
      ...base,
      fenBefore: SAC_BEFORE,
      fenAfter: SAC_AFTER,
      legalMoves: 12,
      forced: true,
    });
    expect(result.classification).toBeNull();
  });
});

describe("classifyExceptional — brilliant", () => {
  it("marks a sound sacrifice the engine endorses as brilliant", () => {
    const result = classifyExceptional({
      ...base,
      fenBefore: SAC_BEFORE,
      fenAfter: SAC_AFTER,
      legalMoves: 12,
    });
    expect(result.classification).toBe("brilliant");
    expect(result.evidence.sacrifice).not.toBeNull();
    expect(result.evidence.sacrifice!.materialGiven).toBeGreaterThanOrEqual(2);
    expect(result.evidence.sacrifice!.sound).toBe(true);
    expect(result.evidence.sacrifice!.immediatelyCapturable).toBe(true);
    expect(result.evidence.sacrifice!.square).toBe("d5");
  });

  it("explains itself with evidence rather than a bare label", () => {
    const result = classifyExceptional({
      ...base,
      fenBefore: SAC_BEFORE,
      fenAfter: SAC_AFTER,
      legalMoves: 12,
    });
    expect(result.evidence.reasons.length).toBeGreaterThan(0);
    expect(result.evidence.reasons.join(" ")).toMatch(/material/i);
    expect(result.evidence.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("refuses when the sacrifice is not endorsed by the engine", () => {
    const result = classifyExceptional({
      ...base,
      fenBefore: SAC_BEFORE,
      fenAfter: SAC_AFTER,
      legalMoves: 12,
      beforeCp: -100,
      afterCp: -100,
      shallowBeforeCp: -100,
    });
    expect(result.classification).toBeNull();
    expect(result.evidence.sacrifice!.sound).toBe(false);
  });

  it("refuses when plenty of alternatives were just as good", () => {
    const result = classifyExceptional({
      ...base,
      fenBefore: SAC_BEFORE,
      fenAfter: SAC_AFTER,
      legalMoves: 12,
      alternatives: [
        { uci: "e1e2", cp: 148 },
        { uci: "e1d1", cp: 144 },
        { uci: "f4e2", cp: 140 },
      ],
    });
    expect(result.evidence.viableAlternatives).toBe(3);
    expect(result.classification).not.toBe("brilliant");
  });
});

describe("classifyExceptional — exceptional", () => {
  it("marks a hard, position-changing move that is not a sacrifice", () => {
    const result = classifyExceptional({
      ...base,
      beforeCp: -20,
      afterCp: 180,
      shallowBeforeCp: -20,
    });
    expect(result.classification).toBe("exceptional");
    expect(result.evidence.sacrifice).toBeNull();
    expect(result.evidence.swingPawns).toBeGreaterThanOrEqual(1.5);
  });

  it("requires a real gain or a lone saving resource", () => {
    const result = classifyExceptional(base);
    expect(result.evidence.swingPawns).toBe(0);
    expect(result.classification).toBeNull();
  });
});

describe("classifyExceptional — evidence quality", () => {
  it("only claims an only-move when the engine was searched multi-PV", () => {
    const withoutAlternatives = classifyExceptional({ ...base, alternatives: [] });
    expect(withoutAlternatives.evidence.alternativesAvailable).toBe(false);
    expect(withoutAlternatives.evidence.viableAlternatives).toBeNull();
    expect(withoutAlternatives.evidence.onlyMove).toBe(false);
  });

  it("reads the real legal move count when the caller omits it", () => {
    const result = classifyExceptional({ ...base, legalMoves: undefined });
    expect(result.evidence.legalMoves).toBe(13);
  });

  it("reports lower stability when shallow and deep disagree on the best move", () => {
    const agreeing = classifyExceptional(base);
    const disagreeing = classifyExceptional({ ...base, shallowBestUci: "e1e2" });
    expect(disagreeing.evidence.stability).toBeLessThan(agreeing.evidence.stability);
  });

  it("lowers confidence when neither MultiPV nor a shallow pass was available", () => {
    const rich = classifyExceptional(base);
    const sparse = classifyExceptional({
      ...base,
      alternatives: [],
      shallowBeforeCp: undefined,
      shallowBestUci: undefined,
    });
    expect(sparse.evidence.confidence).toBeLessThan(rich.evidence.confidence);
  });
});

describe("moveFacts", () => {
  it("detects captures from the position, not from SAN punctuation", () => {
    const facts = moveFacts("4k3/8/8/3p4/4B3/8/8/4K3 w - - 0 1", "e4d5");
    expect(facts.ok).toBe(true);
    expect(facts.isCapture).toBe(true);
    expect(facts.san).toBe("Bxd5");
  });

  it("detects a check and a mate", () => {
    expect(moveFacts(MATE_BEFORE, "e1e8").givesCheck).toBe(true);
    expect(moveFacts(MATE_BEFORE, "e1e8").isMate).toBe(true);
  });

  it("reports a quiet move as neither", () => {
    const facts = moveFacts(QUIET_BEFORE, "f4d5");
    expect(facts.isCapture).toBe(false);
    expect(facts.givesCheck).toBe(false);
    expect(facts.isMate).toBe(false);
  });

  it("fails safely on an illegal move", () => {
    const facts = moveFacts(QUIET_BEFORE, "a1a8");
    expect(facts.ok).toBe(false);
    expect(facts.isCapture).toBe(false);
  });
});

describe("isExceptionalClass", () => {
  it("recognises only the two exceptional classes", () => {
    expect(isExceptionalClass("brilliant")).toBe(true);
    expect(isExceptionalClass("exceptional")).toBe(true);
    expect(isExceptionalClass("best")).toBe(false);
    expect(isExceptionalClass("blunder")).toBe(false);
  });
});
