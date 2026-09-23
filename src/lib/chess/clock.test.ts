import { describe, expect, it } from "vitest";
import { extractClocks, importPgn } from "./pgn";
import { analyseTimeManagement, mergeTimeProfiles } from "@/lib/player/timeManagement";
import type { MoveAssessment } from "./review";

const header = [
  '[Event "Clock Test"]',
  '[Site "?"]',
  '[Date "2024.05.12"]',
  '[White "Alice"]',
  '[Black "Bob"]',
  '[Result "1-0"]',
  '[TimeControl "600+5"]',
];

const pgn = (movetext: string) => `${header.join("\n")}\n\n${movetext}`;

describe("extractClocks", () => {
  it("reads per-ply clock annotations in order", () => {
    const clocks = extractClocks(
      pgn(
        "1. e4 {[%clk 0:09:55]} e5 {[%clk 0:09:58]} 2. Nf3 {[%clk 0:09:40]} Nc6 {[%clk 0:09:45]} 1-0",
      ),
    );
    expect(clocks).toEqual([595, 598, 580, 585]);
  });

  it("handles hour-long controls", () => {
    const clocks = extractClocks(pgn("1. e4 {[%clk 1:30:00]} e5 {[%clk 1:29:12]} 1-0"));
    expect(clocks).toEqual([5400, 5352]);
  });

  it("ignores clocks inside variations so plies never shift", () => {
    const clocks = extractClocks(
      pgn(
        "1. e4 {[%clk 0:09:55]} (1. d4 {[%clk 0:09:50]} d5) e5 {[%clk 0:09:58]} 1-0",
      ),
    );
    // The variation's 0:09:50 must not overwrite ply 1 or add a phantom ply.
    expect(clocks).toEqual([595, 598]);
  });

  it("leaves null for plies the PGN does not annotate", () => {
    const clocks = extractClocks(pgn("1. e4 e5 {[%clk 0:09:58]} 2. Nf3 Nc6 1-0"));
    expect(clocks).toEqual([null, 598, null, null]);
  });

  it("skips move numbers, NAGs and the result token", () => {
    const clocks = extractClocks(pgn("1. e4 $1 e5 {[%clk 0:05:00]} 2. Nf3 Nc6 1/2-1/2"));
    expect(clocks).toEqual([null, 300, null, null]);
  });

  it("returns nothing for a game without clocks", () => {
    const clocks = extractClocks(pgn("1. e4 e5 2. Nf3 Nc6 1-0"));
    expect(clocks.every((value) => value === null)).toBe(true);
  });

  it("never reads a clock that is not a valid time", () => {
    const clocks = extractClocks(pgn("1. e4 {[%clk 0:99:99]} e5 {[%clk 0:01:02]} 1-0"));
    expect(clocks[0]).toBeNull();
    expect(clocks[1]).toBe(62);
  });
});

describe("importPgn clock plumbing", () => {
  it("trims the clock list to the number of plies actually played", () => {
    const result = importPgn(
      pgn("1. e4 {[%clk 0:09:55]} e5 {[%clk 0:09:58]} 2. Nf3 {[%clk 0:09:40]} Nc6 1-0"),
    );
    expect(result.games).toHaveLength(1);
    const game = result.games[0]!;
    expect(game.clocks).toHaveLength(game.uciList.length);
    expect(game.clocks[0]).toBe(595);
    expect(game.clocks[1]).toBe(598);
  });

  it("gives every game a clocks array, empty of data when unannotated", () => {
    const result = importPgn(pgn("1. e4 e5 1-0"));
    expect(result.games[0]!.clocks).toEqual([null, null]);
  });
});

/* ---------------------------------------------------- time management */

type MoveSpec = {
  ply: number;
  mover?: "w" | "b";
  classification?: MoveAssessment["classification"];
  thinkSeconds?: number | null;
  clockSeconds?: number | null;
};

function move(spec: MoveSpec): MoveAssessment {
  return {
    ply: spec.ply,
    san: "e4",
    uci: "e2e4",
    mover: spec.mover ?? "w",
    fenBefore: "4k3/8/8/8/5N2/8/8/4K3 w - - 0 1",
    fenAfter: "4k3/8/8/3N4/8/8/8/4K3 b - - 0 1",
    evalBeforeCp: 0,
    evalBeforeMate: null,
    evalAfterCp: 0,
    evalAfterMate: null,
    bestUci: "e2e4",
    bestSan: "e4",
    cpLoss: 0,
    cpOpportunity: 0,
    classification: spec.classification ?? "best",
    phase: "middlegame",
    motifs: [],
    allowedMotifs: [],
    allowedCheck: false,
    deep: false,
    thinkSeconds: spec.thinkSeconds ?? null,
    clockSeconds: spec.clockSeconds ?? null,
  };
}

describe("analyseTimeManagement", () => {
  it("refuses to score when no clock was recorded", () => {
    const profile = analyseTimeManagement([move({ ply: 1 }), move({ ply: 3 })]);
    expect(profile.score).toBeNull();
    expect(profile.confidence).toBe("none");
    expect(profile.measuredPlies).toBe(0);
    expect(profile.unmeasuredPlies).toBe(2);
    expect(profile.findings[0]!.text).toMatch(/no per-move clock/i);
  });

  it("detects rushing the moves that matter", () => {
    const moves = [
      ...Array.from({ length: 3 }, (_, i) =>
        move({
          ply: i * 2 + 1,
          classification: "blunder",
          thinkSeconds: 3,
          clockSeconds: 20,
        }),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        move({ ply: i * 2 + 100, thinkSeconds: 30, clockSeconds: 120 }),
      ),
    ];
    const profile = analyseTimeManagement(moves);
    expect(profile.avgThinkOnErrors).toBe(3);
    expect(profile.avgThinkOnSound).toBe(30);
    expect(profile.findings.some((f) => /rush/i.test(f.text))).toBe(true);
    // 70 base, -15 for rushing, -20 for the pressure gap.
    expect(profile.score).toBe(35);
    expect(profile.confidence).toBe("provisional");
  });

  it("rewards holding up under pressure", () => {
    const moves = [
      ...Array.from({ length: 40 }, (_, i) => move({ ply: i + 1, thinkSeconds: 15, clockSeconds: 300 })),
      ...Array.from({ length: 6 }, (_, i) => move({ ply: i + 200, thinkSeconds: 4, clockSeconds: 20 })),
    ];
    const profile = analyseTimeManagement(moves);
    expect(profile.lowTimeMoves).toBe(6);
    expect(profile.lowTimeErrors).toBe(0);
    expect(profile.score).toBe(80);
    expect(profile.confidence).toBe("medium");
  });

  it("computes a pressure sensitivity ratio from both buckets", () => {
    const moves = [
      ...Array.from({ length: 10 }, (_, i) =>
        move({
          ply: i + 1,
          classification: "blunder",
          thinkSeconds: 2,
          clockSeconds: 10,
        }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        move({ ply: i + 100, classification: "best", thinkSeconds: 20, clockSeconds: 200 }),
      ),
    ];
    const profile = analyseTimeManagement(moves);
    expect(profile.lowTimeErrorRate).toBe(100);
    expect(profile.comfortableErrorRate).toBe(0);
    // Zero errors with time in hand means every short-of-time error is pressure.
    expect(profile.pressureSensitivity).toBe(3);
  });

  it("only counts the requested side", () => {
    const moves = [
      move({ ply: 1, mover: "w", thinkSeconds: 10, clockSeconds: 300 }),
      move({ ply: 2, mover: "b", thinkSeconds: 10, clockSeconds: 300 }),
      move({ ply: 3, mover: "w", thinkSeconds: 10, clockSeconds: 300 }),
    ];
    expect(analyseTimeManagement(moves, "w").measuredPlies).toBe(2);
    expect(analyseTimeManagement(moves, "b").measuredPlies).toBe(1);
  });

  it("relabels confidence as the sample grows", () => {
    const build = (count: number) =>
      Array.from({ length: count }, (_, i) => move({ ply: i + 1, thinkSeconds: 10, clockSeconds: 300 }));
    expect(analyseTimeManagement(build(29)).confidence).toBe("provisional");
    expect(analyseTimeManagement(build(30)).confidence).toBe("medium");
    expect(analyseTimeManagement(build(100)).confidence).toBe("high");
  });
});

describe("mergeTimeProfiles", () => {
  it("stays unscored when no game carried clock data", () => {
    const empty = analyseTimeManagement([move({ ply: 1 })]);
    const merged = mergeTimeProfiles([empty, empty]);
    expect(merged.score).toBeNull();
    expect(merged.confidence).toBe("none");
    expect(merged.unmeasuredPlies).toBe(2);
    expect(merged.findings[0]!.text).toMatch(/carry clock annotations.*unmeasured/i);
  });

  it("weights longer games more heavily", () => {
    const short = analyseTimeManagement(
      Array.from({ length: 10 }, (_, i) => move({ ply: i + 1, thinkSeconds: 2, clockSeconds: 10 })),
    );
    const long = analyseTimeManagement(
      Array.from({ length: 100 }, (_, i) => move({ ply: i + 1, thinkSeconds: 30, clockSeconds: 300 })),
    );
    const merged = mergeTimeProfiles([short, long]);
    expect(merged.measuredPlies).toBe(110);
    // The weighted mean must sit close to the long game's 30s, not the midpoint.
    expect(merged.avgThinkSeconds!).toBeGreaterThan(25);
  });
});
