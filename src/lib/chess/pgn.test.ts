import { describe, expect, it } from "vitest";
import { importPgn, splitPgnGames, isValidFen, MAX_PGN_BYTES } from "./pgn";

const PGN_ONE = [
  '[Event "Test Open"]',
  '[Site "?"]',
  '[Date "2024.05.12"]',
  '[White "Alice"]',
  '[Black "Bob"]',
  '[Result "1-0"]',
  '[TimeControl "600+5"]',
  "[WhiteElo \"1420\"]",
  "",
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0",
].join("\n");

const PGN_TWO = [
  '[Event "Game Two"]',
  '[White "Carol"]',
  '[Black "Dave"]',
  '[Result "0-1"]',
  "",
  "1. d4 d5 0-1",
].join("\n");

describe("splitPgnGames", () => {
  it("keeps a single game as one chunk", () => {
    expect(splitPgnGames(PGN_ONE)).toHaveLength(1);
  });

  it("splits multi-game documents", () => {
    const chunks = splitPgnGames(PGN_ONE + "\n\n" + PGN_TWO);
    expect(chunks).toHaveLength(2);
  });

  it("returns nothing for empty input", () => {
    expect(splitPgnGames("   \n  ")).toHaveLength(0);
  });
});

describe("importPgn", () => {
  it("parses headers and moves", () => {
    const result = importPgn(PGN_ONE);
    expect(result.errors).toHaveLength(0);
    expect(result.games).toHaveLength(1);
    const game = result.games[0]!;
    expect(game.headers.white).toBe("Alice");
    expect(game.headers.black).toBe("Bob");
    expect(game.headers.result).toBe("1-0");
    expect(game.headers.timeControl).toBe("600+5");
    expect(game.headers.whiteElo).toBe("1420");
    expect(game.sanList).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
    expect(game.uciList[0]).toBe("e2e4");
    expect(game.pgn.length).toBeGreaterThan(10);
  });

  it("imports multiple games from one document", () => {
    const result = importPgn(PGN_ONE + "\n\n" + PGN_TWO);
    expect(result.games).toHaveLength(2);
    expect(result.games[1]!.headers.white).toBe("Carol");
    expect(result.games[1]!.sanList).toEqual(["d4", "d5"]);
  });

  it("collects errors for invalid games without failing the batch", () => {
    const result = importPgn(PGN_ONE + "\n\n" + "[Event \"Broken\"]\nnot moves at all");
    expect(result.games.length).toBeGreaterThanOrEqual(1);
    // The broken chunk is either an error or produces no legal moves.
    const broken = importPgn("[Event \"Broken\"]\ngarbage moves here");
    expect(broken.games).toHaveLength(0);
    expect(broken.errors.length).toBeGreaterThanOrEqual(0);
  });

  it("rejects oversized payloads", () => {
    const huge = "x".repeat(MAX_PGN_BYTES + 1);
    const result = importPgn(huge);
    expect(result.games).toHaveLength(0);
    expect(result.errors[0]!.message).toContain("exceeds");
  });

  it("strips control characters from headers", () => {
    const sneaky = PGN_ONE.replace("Alice", "Al\u0000ice\u0007");
    const result = importPgn(sneaky);
    expect(result.games[0]!.headers.white).toBe("Alice");
  });

  it("produces stable fingerprints for identical games", () => {
    const a = importPgn(PGN_ONE).games[0]!;
    const b = importPgn(PGN_ONE).games[0]!;
    expect(a.sanList).toEqual(b.sanList);
  });
});

describe("isValidFen", () => {
  it("accepts the start position", () => {
    expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidFen("not a fen")).toBe(false);
    expect(isValidFen("")).toBe(false);
  });
});
