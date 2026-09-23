import { describe, expect, it } from "vitest";
import {
  isAttackedBy,
  isTerminal,
  legalMoveCountOf,
  materialBalance,
  materialFor,
  staticExchange,
} from "./position";
import { START_FEN } from "./replay";

const KNIGHT_EN_PRISE = "4k3/8/2p5/3N4/8/8/8/4K3 b - - 0 1";
const BISHOP_TAKES_FREE_PAWN = "4k3/8/8/3p4/4B3/8/8/4K3 w - - 0 1";
const BISHOP_TAKES_DEFENDED_PAWN = "4k3/8/2p5/3p4/4B3/8/8/4K3 w - - 0 1";

describe("legalMoveCountOf", () => {
  it("counts the real moves in the starting position", () => {
    expect(legalMoveCountOf(START_FEN)).toBe(20);
  });

  it("reports the true count in a sparse position rather than assuming 20", () => {
    // The bug this replaces: a quiet king-and-knight position scored as if it
    // had 20 legal moves, which mis-fed the "forced move" check.
    // 8 knight moves (f4) + 5 king moves (e1).
    expect(legalMoveCountOf("4k3/8/8/8/5N2/8/8/4K3 w - - 0 1")).toBe(13);
  });

  it("returns zero for a mate (a genuinely forced situation, not a parse error)", () => {
    const mate = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
    expect(legalMoveCountOf(mate)).toBeGreaterThan(0);
    // Fool's mate position — black is checkmated.
    expect(legalMoveCountOf("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")).toBe(0);
  });

  it("falls back only when the FEN cannot be parsed", () => {
    expect(legalMoveCountOf("not a fen")).toBe(20);
    expect(legalMoveCountOf("not a fen", null)).toBeNull();
  });
});

describe("isTerminal", () => {
  it("is false for a normal position", () => {
    expect(isTerminal(START_FEN)).toBe(false);
  });

  it("is true for checkmate", () => {
    expect(isTerminal("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")).toBe(true);
  });
});

describe("material", () => {
  it("reads the starting material as level", () => {
    expect(materialBalance(START_FEN)).toBe(0);
    expect(materialFor(START_FEN, "w")).toBe(39);
    expect(materialFor(START_FEN, "b")).toBe(39);
  });

  it("signs the balance from White's perspective", () => {
    // Black has given up a rook.
    expect(materialBalance("4k3/8/8/8/8/8/8/R3K3 w - - 0 1")).toBe(5);
  });
});

describe("staticExchange", () => {
  it("values a free capture at the captured piece's worth", () => {
    expect(staticExchange(BISHOP_TAKES_FREE_PAWN, "d5", "w")).toBe(1);
  });

  it("returns zero when the recapture makes the capture unprofitable", () => {
    // Bxd5 cxd5 costs a bishop (3) for a pawn (1): the capture is not worth it.
    expect(staticExchange(BISHOP_TAKES_DEFENDED_PAWN, "d5", "w")).toBe(0);
  });

  it("detects a piece that is simply en prise", () => {
    expect(staticExchange(KNIGHT_EN_PRISE, "d5", "b")).toBe(3);
  });

  it("is zero for a square nobody can win material on", () => {
    expect(staticExchange(START_FEN, "e4", "w")).toBe(0);
  });

  it("does not throw on an empty square", () => {
    expect(staticExchange(START_FEN, "e3", "w")).toBe(0);
  });
});

describe("isAttackedBy", () => {
  it("sees a pawn's diagonal attack", () => {
    expect(isAttackedBy(KNIGHT_EN_PRISE, "d5", "b")).toBe(true);
  });

  it("does not count a pawn's straight-ahead square", () => {
    // White's d2/f2 pawns attack e3 diagonally, but nothing attacks e3's
    // neighbour two ranks up: e4 is unattacked in the starting position.
    expect(isAttackedBy(START_FEN, "e3", "w")).toBe(true);
    expect(isAttackedBy(START_FEN, "e4", "w")).toBe(false);
  });
});
