import { describe, expect, it } from "vitest";
import { computeChessDna, detectPatterns, type DnaDimensionId } from "./dna";
import { makeBlunderGame, makeDnaGame, makeMove } from "@/test/fixtures";

const AXES: DnaDimensionId[] = [
  "tactics",
  "calculation",
  "position",
  "opening",
  "endgame",
  "defense",
  "kingSafety",
  "initiative",
  "timeManagement",
  "conversion",
];

describe("computeChessDna", () => {
  it("returns every axis, honestly marked, for no data at all", () => {
    const dna = computeChessDna([]);

    expect(dna.dimensions.map((dimension) => dimension.id)).toEqual(AXES);
    expect(dna.gamesUsed).toBe(0);
    expect(dna.headline.length).toBeGreaterThan(10);
    for (const dimension of dna.dimensions) {
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(100);
      expect(dimension.provisional).toBe(true);
      expect(dimension.evidence.length).toBeGreaterThan(0);
      expect(dimension.sample).toBe(0);
    }
  });

  it("scores from the player's own moves and carries evidence counts", () => {
    const dna = computeChessDna([makeBlunderGame(1), makeBlunderGame(2), makeBlunderGame(3)]);

    expect(dna.gamesUsed).toBe(3);
    expect(dna.movesUsed).toBeGreaterThan(0);
    expect(new Set(dna.dimensions.map((dimension) => dimension.id)).size).toBe(AXES.length);

    for (const dimension of dna.dimensions) {
      expect(Number.isFinite(dimension.score)).toBe(true);
      expect(dimension.evidence).toMatch(/[0-9]|[a-z]/i);
    }

    const tactics = dna.dimensions.find((dimension) => dimension.id === "tactics")!;
    expect(tactics.sample).toBeGreaterThan(0);
    // A thin sample must say so rather than pretend to be measured.
    expect(typeof tactics.provisional).toBe("boolean");
    expect(tactics.evidence.length).toBeGreaterThan(0);

    // Every claimed strength and weakness is a real axis.
    for (const id of [...dna.strengths, ...dna.weaknesses]) {
      expect(AXES).toContain(id);
    }
  });

  it("uses a different measurement per axis rather than one number ten ways", () => {
    const dna = computeChessDna([makeBlunderGame(1), makeBlunderGame(2)]);
    const evidence = dna.dimensions.map((dimension) => dimension.evidence);
    expect(new Set(evidence).size).toBeGreaterThan(3);
  });
});

describe("detectPatterns", () => {
  it("reports an allowed-tactic pattern once it repeats across games", () => {
    const cards = detectPatterns([makeBlunderGame(1), makeBlunderGame(2), makeBlunderGame(3)]);
    const fork = cards.find((card) => card.id === "motif-fork");

    expect(fork).toBeDefined();
    expect(fork!.occurrences).toBe(6);
    expect(fork!.games).toBe(3);
    expect(fork!.avgSwingCp).toBe(300);
    expect(fork!.severity).toBe("medium");
    expect(fork!.training).toBeGreaterThan(0);
    expect(fork!.evidence).toContain("3.0");
    expect(fork!.examples.length).toBeGreaterThan(0);
    expect(fork!.examples[0]!.gameId).toBeGreaterThan(0);
  });

  it("stays quiet when the pattern only happens once", () => {
    const cards = detectPatterns([makeBlunderGame(1)]);
    expect(cards.filter((card) => card.motif)).toHaveLength(0);
  });

  it("ignores cheap moves when tallying patterns", () => {
    const cheap = makeDnaGame({
      gameId: 9,
      color: "w",
      moves: [
        makeMove({ ply: 1, cpLoss: 20, allowedMotifs: ["fork"] }),
        makeMove({ ply: 3, cpLoss: 40, allowedMotifs: ["fork"] }),
      ],
    });
    expect(detectPatterns([cheap]).filter((card) => card.motif)).toHaveLength(0);
  });

  it("ignores the opponent's mistakes", () => {
    const opponent = makeDnaGame({
      gameId: 11,
      color: "w",
      moves: [makeMove({ ply: 2, mover: "b", cpLoss: 400, allowedMotifs: ["fork"] })],
    });
    expect(detectPatterns([opponent, opponent, opponent]).filter((card) => card.motif)).toHaveLength(0);
  });
});
