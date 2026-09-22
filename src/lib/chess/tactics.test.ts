import { describe, expect, it } from "vitest";
import { detectTacticsAfterMove, attacksFrom } from "./tactics";
import { Chess, type Square } from "chess.js";

describe("attacksFrom", () => {
  it("knight attacks eight squares in the center", () => {
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    chess.move("Nf3");
    chess.move("Nc6");
    chess.move("Nc3");
    // Place a white knight on e4 via a fresh position.
    const position = new Chess("4k3/8/8/8/4N3/8/8/4K3 w - - 0 1");
    expect(attacksFrom(position, "e4" as Square).sort()).toEqual(
      ["c3", "c5", "d2", "d6", "f2", "f6", "g3", "g5"].sort(),
    );
  });

  it("sliding pieces stop at blockers", () => {
    const position = new Chess("4k3/8/8/8/8/8/3R4/4K3 w - - 0 1");
    const attacks = attacksFrom(position, "d2" as Square);
    expect(attacks).toContain("d8");
    expect(attacks).toContain("d1"); // own rook square not attacked downward beyond board edge
    expect(attacks.length).toBeGreaterThan(5);
  });
});

describe("detectTacticsAfterMove", () => {
  it("detects a knight fork", () => {
    // Nb5-c7+ forks the king on e8 and the rook on a8.
    const fork = detectTacticsAfterMove(
      "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1",
      "b5c7",
    );
    expect(fork.some((t) => t.theme === "fork")).toBe(true);
    const forkHit = fork.find((t) => t.theme === "fork")!;
    expect(forkHit.squares).toContain("a8");
    expect(forkHit.squares).toContain("e8");
  });

  it("detects checkmate (back rank)", () => {
    // Back rank mate: Ra8#
    const tactics = detectTacticsAfterMove(
      "6k1/5ppp/8/8/8/8/8/R6K w - - 0 1",
      "a1a8",
    );
    expect(tactics.some((t) => t.theme === "mate-in-one" || t.theme === "back-rank-mate")).toBe(true);
  });

  it("detects a hanging piece", () => {
    // The black queen on d5 sits attacked by the c4 pawn and fully undefended.
    // White plays a quiet king move — the queen remains hanging.
    const tactics = detectTacticsAfterMove(
      "4k3/8/8/3q4/2P5/8/8/4K3 w - - 0 1",
      "e1e2",
    );
    const hanging = tactics.find((t) => t.theme === "hanging-piece");
    expect(hanging).toBeDefined();
    expect(hanging!.squares).toContain("d5");
  });

  it("detects a pin on the king", () => {
    // Bb5 pins the black knight on c6 to the king on e8.
    const tactics = detectTacticsAfterMove(
      "r2qkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
      "f1b5",
    );
    const pin = tactics.find((t) => t.theme === "pin");
    expect(pin).toBeDefined();
    expect(pin!.squares).toContain("c6");
    expect(pin!.squares).toContain("e8");
  });

  it("detects discovered check", () => {
    // White rook on e1 behind white king… move king away exposing check:
    // Position: black king e8, white rook e2, white king e1? king blocks rook file.
    // Ke1-d2 unleashes Re2-e8 check (path must be clear: e2..e7 empty).
    const fen = "4k3/8/8/8/8/8/4R3/4K3 w - - 0 1";
    const tactics = detectTacticsAfterMove(fen, "e1d2");
    expect(tactics.some((t) => t.theme === "discovered-check")).toBe(true);
  });

  it("returns empty for illegal moves", () => {
    expect(detectTacticsAfterMove("4k3/8/8/8/8/8/8/4K3 w - - 0 1", "e2e4")).toEqual([]);
  });

  it("returns empty for invalid FENs", () => {
    expect(detectTacticsAfterMove("not-a-fen", "e2e4")).toEqual([]);
  });
});
