import { describe, expect, it } from "vitest";
import {
  normalizeToWhite,
  parseBestMoveLine,
  parseInfoLine,
  sideToMoveFromFen,
} from "./uci";

describe("parseInfoLine", () => {
  it("parses a cp score line with pv", () => {
    const info = parseInfoLine(
      "info depth 16 seldepth 20 multipv 1 score cp 13 nodes 123456 nps 500000 time 246 pv e2e4 e7e5 g1f3",
    );
    expect(info).not.toBeNull();
    expect(info!.depth).toBe(16);
    expect(info!.multipv).toBe(1);
    expect(info!.scoreCp).toBe(13);
    expect(info!.mateIn).toBeNull();
    expect(info!.nodes).toBe(123456);
    expect(info!.pv).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("parses a mate score line", () => {
    const info = parseInfoLine("info depth 12 score mate 3 pv e2e4");
    expect(info!.mateIn).toBe(3);
    expect(info!.scoreCp).toBeNull();
  });

  it("ignores lines without a score", () => {
    expect(parseInfoLine("info string hashfull 333")).toBeNull();
    expect(parseInfoLine("info currmove e2e4 currmovenumber 1")).toBeNull();
  });

  it("ignores non-info lines", () => {
    expect(parseInfoLine("readyok")).toBeNull();
  });
});

describe("parseBestMoveLine", () => {
  it("parses bestmove with ponder", () => {
    const best = parseBestMoveLine("bestmove e2e4 ponder e7e5");
    expect(best).toEqual({ bestMove: "e2e4", ponder: "e7e5" });
  });

  it("parses bestmove without ponder", () => {
    expect(parseBestMoveLine("bestmove c7c5")).toEqual({ bestMove: "c7c5", ponder: null });
  });

  it("handles (none)", () => {
    expect(parseBestMoveLine("bestmove (none)")).toEqual({ bestMove: null, ponder: null });
  });
});

describe("normalizeToWhite", () => {
  it("keeps white-to-move scores", () => {
    expect(normalizeToWhite(42, null, "w")).toEqual({ scoreCp: 42, mateIn: null });
    expect(normalizeToWhite(0, 4, "w")).toEqual({ scoreCp: 0, mateIn: 4 });
  });

  it("flips black-to-move scores", () => {
    expect(normalizeToWhite(42, null, "b")).toEqual({ scoreCp: -42, mateIn: null });
    expect(normalizeToWhite(0, -3, "b")).toEqual({ scoreCp: 0, mateIn: 3 });
    expect(normalizeToWhite(0, 3, "b")).toEqual({ scoreCp: 0, mateIn: -3 });
  });

  it("leaves null/zero mates alone", () => {
    expect(normalizeToWhite(10, 0, "b").mateIn).toBe(0);
    expect(normalizeToWhite(10, null, "b").mateIn).toBeNull();
  });
});

describe("sideToMoveFromFen", () => {
  it("reads the side to move", () => {
    expect(sideToMoveFromFen("8/8/8/8/8/8/8/K6k w - - 0 1")).toBe("w");
    expect(sideToMoveFromFen("8/8/8/8/8/8/8/K6k b - - 0 1")).toBe("b");
    expect(sideToMoveFromFen("garbage")).toBe("w");
  });
});
