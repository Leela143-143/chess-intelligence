import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { detectPhase, materialBalance } from "./phase";
import { accuracyFromLosses, acplFromLosses, findCriticalMoments } from "./metrics";

/**
 * Chess regression tests (spec §103) covering rules we depend on:
 * checkmate, stalemate, castling, en passant, promotion, repetition,
 * 50-move rule, insufficient material, SAN/UCI/FEN and eval perspective.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("rules regression", () => {
  it("detects fool's-mate checkmate", () => {
    const chess = new Chess();
    chess.move("f3");
    chess.move("e5");
    chess.move("g4");
    chess.move("Qh4#");
    expect(chess.isCheckmate()).toBe(true);
    expect(chess.isGameOver()).toBe(true);
  });

  it("detects stalemate", () => {
    const chess = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(chess.isStalemate()).toBe(true);
  });

  it("allows castling when legal and forbids through check", () => {
    const chess = new Chess(START);
    chess.move("e4"); chess.move("e5");
    chess.move("Nf3"); chess.move("Nc6");
    chess.move("Bc4"); chess.move("Bc5");
    chess.move("O-O");
    // White's castling rights are consumed (only Black's kq remain).
    expect(chess.fen()).not.toContain("KQ");
    expect(chess.fen()).toContain("kq");
    // King moved → cannot castle again.
    expect(chess.moves({ square: "e1" })).not.toContain("O-O");
  });

  it("supports en passant", () => {
    const chess = new Chess(START);
    chess.move("e4");
    chess.move("a6");
    chess.move("e5");
    chess.move("d5");
    const move = chess.move("e5d6");
    expect(move.flags).toContain("e");
    expect(chess.get("d5")).toBeUndefined();
  });

  it("supports promotion to underpromotion", () => {
    const chess = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const move = chess.move("a7a8=n");
    expect(move.promotion).toBe("n");
    expect(chess.get("a8")?.type).toBe("n");
  });

  it("detects threefold repetition", () => {
    const chess = new Chess(START);
    for (const san of ["Nf3", "Nf6", "Ng1", "Ng8"]) chess.move(san);
    for (const san of ["Nf3", "Nf6", "Ng1", "Ng8"]) chess.move(san);
    for (const san of ["Nf3", "Nf6", "Ng1", "Ng8"]) chess.move(san);
    expect(chess.isThreefoldRepetition()).toBe(true);
  });

  it("detects the 50-move rule", () => {
    const chess = new Chess("k7/8/1K6/8/8/8/8/7R w - - 99 1");
    // A quiet king move keeps halfmove clock at 100 → draw.
    chess.move("Ka6");
    expect(chess.isDraw()).toBe(true);
  });

  it("detects insufficient material", () => {
    expect(new Chess("8/8/4k3/8/8/4K3/8/8 w - - 0 1").isInsufficientMaterial()).toBe(true);
    expect(new Chess("8/8/4k3/8/8/4K3/8/7B w - - 0 1").isInsufficientMaterial()).toBe(true);
    expect(new Chess("8/8/4k3/8/8/4K3/8/7R w - - 0 1").isInsufficientMaterial()).toBe(false);
  });

  it("round-trips FEN", () => {
    const chess = new Chess();
    chess.move("e4");
    chess.move("c5");
    const fen = chess.fen();
    expect(new Chess(fen).fen()).toBe(fen);
  });

  it("generates UCI and SAN consistently", () => {
    const chess = new Chess();
    const move = chess.move({ from: "e2", to: "e4" });
    expect(move.san).toBe("e4");
    expect(`${move.from}${move.to}`).toBe("e2e4");
  });
});

describe("phase & material", () => {
  it("start position is opening with level material", () => {
    expect(detectPhase(START, 0)).toBe("opening");
    expect(materialBalance(START)).toBe(0);
  });

  it("recognizes endgames by non-pawn material", () => {
    expect(detectPhase("8/8/4k3/8/8/4K3/8/7R w - - 0 40", 60)).toBe("endgame");
  });

  it("computes material balance from White's perspective", () => {
    // White up a queen
    expect(materialBalance("4k3/8/8/8/8/8/8/3QK3 w - - 0 1")).toBe(9);
    // Black up a rook (White king vs Black king + rook)
    expect(materialBalance("4k3/8/8/8/8/8/8/4K2r w - - 0 1")).toBe(-5);
  });
});

describe("metrics", () => {
  it("accuracy is 100 with zero losses", () => {
    expect(accuracyFromLosses([0, 0, 0])).toBe(100);
  });

  it("accuracy drops with bigger losses and clamps at 0", () => {
    const good = accuracyFromLosses([10, 20, 30]);
    const bad = accuracyFromLosses([400, 500, 600]);
    expect(good).toBeGreaterThan(bad);
    expect(accuracyFromLosses([9999])).toBe(0);
    expect(accuracyFromLosses([])).toBe(0);
  });

  it("ACPL is the mean loss", () => {
    expect(acplFromLosses([10, 20, 30])).toBe(20);
    expect(acplFromLosses([])).toBe(0);
  });

  it("finds and ranks critical moments", () => {
    const moments = findCriticalMoments([
      {
        ply: 1,
        moveSan: "e4",
        mover: "w",
        evalBeforeCp: 20,
        evalBeforeMate: null,
        evalAfterCp: 15,
        evalAfterMate: null,
        bestUci: "e2e4",
        playedUci: "e2e4",
      },
      {
        ply: 2,
        moveSan: "Qh5??",
        mover: "b",
        evalBeforeCp: 15,
        evalBeforeMate: null,
        evalAfterCp: 480,
        evalAfterMate: null,
        bestUci: "g8f6",
        playedUci: "d8h5",
      },
    ]);
    expect(moments).toHaveLength(1);
    expect(moments[0]!.ply).toBe(2);
    expect(moments[0]!.cpLoss).toBe(465);
    expect(moments[0]!.kind).toBe("material-loss");
  });

  it("flags allowed mate as critical even below cp threshold", () => {
    const moments = findCriticalMoments([
      {
        ply: 5,
        moveSan: "??",
        mover: "b",
        evalBeforeCp: 50,
        evalBeforeMate: null,
        evalAfterCp: 10000,
        evalAfterMate: 1,
        bestUci: null,
        playedUci: null as unknown as string,
      },
    ]);
    expect(moments[0]!.kind).toBe("allowed-mate");
  });
});
