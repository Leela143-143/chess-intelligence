import { describe, expect, it } from "vitest";
import { computePlayerStats, outcomeOf, parseTimeControl, timeBucketOf } from "./stats";
import { makeMove, makePlayerGame } from "@/test/fixtures";

describe("outcomeOf", () => {
  it("resolves results from the player's colour", () => {
    expect(outcomeOf("1-0", "w")).toBe("win");
    expect(outcomeOf("1-0", "b")).toBe("loss");
    expect(outcomeOf("0-1", "b")).toBe("win");
    expect(outcomeOf("0-1", "w")).toBe("loss");
    expect(outcomeOf("1/2-1/2", "w")).toBe("draw");
    expect(outcomeOf("1/2-1/2", "b")).toBe("draw");
  });

  it("admits when it cannot tell", () => {
    expect(outcomeOf("*", "w")).toBe("unknown");
    expect(outcomeOf("1-0", null)).toBe("unknown");
    expect(outcomeOf("", "b")).toBe("unknown");
  });
});

describe("time controls", () => {
  it("parses seconds from common forms", () => {
    expect(parseTimeControl("600+5")).toBe(600);
    expect(parseTimeControl("300")).toBe(300);
    expect(parseTimeControl(undefined)).toBeNull();
    expect(parseTimeControl("nonsense")).toBeNull();
  });

  it("buckets the format", () => {
    expect(timeBucketOf("60+0")).toBe("bullet");
    expect(timeBucketOf("300+3")).toBe("blitz");
    expect(timeBucketOf("900+10")).toBe("rapid");
    expect(timeBucketOf("3600")).toBe("classical");
    expect(timeBucketOf(undefined)).toBe("unknown");
  });
});

describe("computePlayerStats", () => {
  it("is honest about an empty database", () => {
    const stats = computePlayerStats([]);
    expect(stats.total).toBe(0);
    expect(stats.scorePct).toBe(0);
    expect(stats.byColour.w.games).toBe(0);
    expect(stats.openings).toHaveLength(0);
    expect(stats.rating).toHaveLength(0);
    expect(stats.headline.length).toBeGreaterThan(10);
    expect(stats.errorFrequency.gamesWithAnalysis).toBe(0);
  });

  it("counts results, colour splits and score", () => {
    const stats = computePlayerStats([
      makePlayerGame({ gameId: 1, color: "w", result: "1-0", accuracy: 90, acpl: 20 }),
      makePlayerGame({ gameId: 2, color: "w", result: "0-1", accuracy: 70, acpl: 60 }),
      makePlayerGame({ gameId: 3, color: "b", result: "1/2-1/2", accuracy: 80, acpl: 40 }),
      makePlayerGame({ gameId: 4, color: "b", result: "0-1", accuracy: 85, acpl: 30 }),
    ]);

    expect(stats.total).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.draws).toBe(1);
    expect(stats.scorePct).toBe(62.5); // (2 + 0.5) / 4
    expect(stats.byColour.w.games).toBe(2);
    expect(stats.byColour.b.games).toBe(2);
    expect(stats.byColour.w.wins).toBe(1);
    expect(stats.byColour.b.wins).toBe(1);
    // Accuracy alone is not an analysis: only games with move assessments count.
    expect(stats.errorFrequency.gamesWithAnalysis).toBe(0);
    expect(stats.bests.accuracy?.value).toBe(90);
  });

  it("aggregates openings and keeps the sample sizes straight", () => {
    const stats = computePlayerStats([
      makePlayerGame({
        gameId: 1,
        color: "w",
        result: "1-0",
        opening: "Italian Game",
        eco: "C50",
        accuracy: 90,
        moves: [makeMove({ ply: 1, mover: "w", classification: "best" })],
      }),
      makePlayerGame({
        gameId: 2,
        color: "w",
        result: "0-1",
        opening: "Italian Game",
        eco: "C50",
        accuracy: 70,
        moves: [makeMove({ ply: 1, mover: "w", classification: "good" })],
      }),
      makePlayerGame({
        gameId: 3,
        color: "b",
        result: "1-0",
        opening: "Italian Game",
        eco: "C50",
        accuracy: 60,
        moves: [makeMove({ ply: 2, mover: "b", classification: "good" })],
      }),
    ]);

    const italian = stats.openings.find((opening) => opening.name === "Italian Game");
    expect(italian).toBeDefined();
    expect(italian!.games).toBe(3);
    expect(italian!.wins).toBe(1);
    expect(italian!.losses).toBe(2);
    expect(italian!.asWhite).toBe(2);
    expect(italian!.asBlack).toBe(1);
    expect(italian!.lastPlayedGameId).toBe(3);
    expect(italian!.accuracy).toBeGreaterThan(70);
  });

  it("builds a rating series in the order the games are given", () => {
    const stats = computePlayerStats([
      makePlayerGame({ gameId: 1, color: "w", result: "1-0", elo: 1400, date: "2024.01.01" }),
      makePlayerGame({ gameId: 2, color: "w", result: "0-1", elo: 1420, date: "2024.01.08" }),
      makePlayerGame({ gameId: 3, color: "b", result: "0-1", elo: 1450, date: "2024.01.15" }),
    ]);

    expect(stats.rating.map((point) => point.elo)).toEqual([1400, 1420, 1450]);
    expect(stats.rating[0]!.outcome).toBe("win");
    expect(stats.rating[2]!.outcome).toBe("win"); // Black won 0-1
    expect(stats.bests.rating).toBe(1450);
  });

  it("counts mistakes per game only over reviewed games, and only the player's own", () => {
    const stats = computePlayerStats([
      makePlayerGame({
        gameId: 1,
        color: "w",
        result: "1-0",
        moves: [
          makeMove({ ply: 1, mover: "w", classification: "blunder" }),
          makeMove({ ply: 2, mover: "b", classification: "blunder" }),
          makeMove({ ply: 3, mover: "w", classification: "blunder" }),
          makeMove({ ply: 4, mover: "b", classification: "blunder" }),
          makeMove({ ply: 5, mover: "w", classification: "mistake" }),
          makeMove({ ply: 7, mover: "w", classification: "inaccuracy" }),
          makeMove({ ply: 7, mover: "w", classification: "inaccuracy" }),
          makeMove({ ply: 7, mover: "w", classification: "inaccuracy" }),
        ],
      }),
      makePlayerGame({ gameId: 2, color: "w", result: "1-0" }),
    ]);

    expect(stats.errorFrequency.gamesWithAnalysis).toBe(1);
    expect(stats.errorFrequency.blundersPerGame).toBe(2);
    expect(stats.errorFrequency.mistakesPerGame).toBe(1);
    expect(stats.errorFrequency.inaccuraciesPerGame).toBe(3);
  });

  it("measures per-phase ACPL from the player's own moves", () => {
    const stats = computePlayerStats([
      makePlayerGame({
        gameId: 1,
        color: "w",
        result: "1-0",
        moves: [
          makeMove({ ply: 1, mover: "w", phase: "endgame", cpLoss: 100 }),
          makeMove({ ply: 2, mover: "b", phase: "endgame", cpLoss: 500 }),
          makeMove({ ply: 3, mover: "w", phase: "endgame", cpLoss: 200 }),
        ],
      }),
    ]);
    expect(stats.phaseAcpl.endgame).toBe(150);
  });

  it("reports a streak from consecutive results", () => {
    const stats = computePlayerStats([
      makePlayerGame({ gameId: 1, color: "w", result: "1-0" }),
      makePlayerGame({ gameId: 2, color: "w", result: "1-0" }),
      makePlayerGame({ gameId: 3, color: "w", result: "0-1" }),
    ]);
    expect(stats.streak.length).toBeGreaterThanOrEqual(1);
    expect(["win", "loss", "draw", "unknown"]).toContain(stats.streak.kind);
  });
});
