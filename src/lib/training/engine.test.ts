import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  LEARNING_STEP_MS,
  buildDailyMission,
  generateTrainingItems,
  isDue,
  itemsFromGame,
  newSrsState,
  scheduleNext,
  type SrsState,
} from "./engine";
import type { PatternCard } from "@/lib/chess/dna";
import { computePlayerStats } from "@/lib/player/stats";
import { makeBlunderGame, makePlayerGame } from "@/test/fixtures";

const T0 = 1_700_000_000_000;

describe("spaced repetition (SM-2 lite)", () => {
  it("starts every position as due now", () => {
    const state = newSrsState(T0);
    expect(state.interval).toBe(0);
    expect(state.ease).toBe(2.5);
    expect(state.due).toBe(T0);
    expect(isDue(state, T0)).toBe(true);
    expect(isDue(state, T0 - 1)).toBe(false);
  });

  it("brings a failure back in ten minutes and lowers ease", () => {
    const failed = scheduleNext(newSrsState(T0), "fail", T0);
    expect(failed.due).toBe(T0 + LEARNING_STEP_MS);
    expect(failed.interval).toBe(0);
    expect(failed.ease).toBeCloseTo(2.3, 5);
    expect(failed.lastResult).toBe("fail");
    expect(failed.attempts).toBe(1);
    expect(failed.successes).toBe(0);
  });

  it("walks a pass up the ladder 1 → 3 → interval × ease", () => {
    const first = scheduleNext(newSrsState(T0), "good", T0);
    expect(first.interval).toBe(1);
    expect(first.due).toBe(T0 + DAY_MS);
    expect(first.ease).toBeCloseTo(2.6, 5);

    const second = scheduleNext(first, "good", T0 + DAY_MS);
    expect(second.interval).toBe(3);
    expect(second.ease).toBeCloseTo(2.7, 5);

    const third = scheduleNext(second, "good", T0 + 4 * DAY_MS);
    expect(third.interval).toBe(Math.round(3 * 2.7));
    expect(third.successes).toBe(3);
    expect(third.attempts).toBe(3);
  });

  it("treats a hard pass as a small step and never leaves the ease bounds", () => {
    const hard = scheduleNext(newSrsState(T0), "hard", T0);
    expect(hard.interval).toBe(1);
    expect(hard.ease).toBeCloseTo(2.35, 5);
    expect(hard.successes).toBe(0);

    let state: SrsState = newSrsState(T0);
    for (let i = 0; i < 12; i++) state = scheduleNext(state, "fail", T0);
    expect(state.ease).toBe(1.3);

    let up: SrsState = newSrsState(T0);
    for (let i = 0; i < 12; i++) up = scheduleNext(up, "good", T0);
    expect(up.ease).toBeLessThanOrEqual(3);
  });

  it("keeps due dates moving forward on a pass", () => {
    const first = scheduleNext(newSrsState(T0), "good", T0);
    const second = scheduleNext(first, "good", first.due);
    expect(second.due).toBeGreaterThan(first.due);
    expect(isDue(second, first.due)).toBe(false);
  });
});

describe("training generation", () => {
  it("turns the player's own mistakes into positions", () => {
    const game = makeBlunderGame(7, { motif: "fork", cpLoss: 400 });
    const items = itemsFromGame({ gameId: 7, color: "w", moves: game.moves }, 6);

    expect(items.length).toBeGreaterThan(0);
    const item = items[0]!;
    expect(item.sourceGameId).toBe(7);
    expect(item.fen).toContain(" ");
    expect(item.playedSan.length).toBeGreaterThan(0);
    expect(item.bestSan).toBe("Bc4");
    expect(item.theme).toBe("fork");
    expect(item.difficulty).toBeGreaterThanOrEqual(1);
    expect(item.difficulty).toBeLessThanOrEqual(5);
    expect(item.explanation).toContain("Bc4");
    expect(item.lesson.toLowerCase()).toContain("fork");
    expect(item.solutionUci.length).toBeGreaterThan(0);
  });

  it("ignores the opponent's errors and quiet moves", () => {
    const game = makeBlunderGame(8);
    const asBlack = itemsFromGame({ gameId: 8, color: "b", moves: game.moves }, 6);
    // The fixture's blunders are White's.
    expect(asBlack.every((item) => item.sourceGameId === 8)).toBe(true);
    expect(asBlack.length).toBe(0);
  });

  it("de-duplicates across games and ranks the hardest first", () => {
    const a = makeBlunderGame(1, { cpLoss: 200 });
    const b = makeBlunderGame(2, { cpLoss: 900 });
    const items = generateTrainingItems(
      [
        { gameId: 1, color: "w", moves: a.moves },
        { gameId: 2, color: "w", moves: b.moves },
      ],
      20,
    );

    expect(new Set(items.map((item) => item.fen)).size).toBe(items.length);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.difficulty).toBeGreaterThanOrEqual(items[i]!.difficulty);
    }
  });
});

describe("daily mission", () => {
  const pattern: PatternCard = {
    id: "motif-fork",
    title: "Loose pieces",
    detail: "Pieces left undefended",
    occurrences: 6,
    games: 3,
    lastGameId: 3,
    avgSwingCp: 300,
    severity: "high",
    training: 6,
    evidence: "6 occurrences across 3 games · −3.0 average evaluation swing",
    examples: [{ gameId: 1, ply: 5, san: "Nf3" }],
    motif: "fork",
  };

  const stats = computePlayerStats([
    makePlayerGame({ gameId: 1, color: "w", result: "0-1", accuracy: 70, counts: { blunder: 3 } }),
    makePlayerGame({ gameId: 2, color: "w", result: "0-1", accuracy: 65, counts: { blunder: 2 } }),
  ]);

  it("leads with spaced repetition when positions are due", () => {
    const mission = buildDailyMission({ dueCount: 7, patterns: [pattern], stats });
    expect(mission.blocks[0]!.kind).toBe("due");
    expect(mission.blocks[0]!.count).toBe(7);
    expect(mission.totalMinutes).toBeGreaterThan(0);
    expect(["light", "focused", "deep"]).toContain(mission.difficulty);
    expect(mission.headline.length).toBeGreaterThan(5);
    expect(mission.reason.length).toBeGreaterThan(10);
    for (const block of mission.blocks) {
      expect(block.reason.length).toBeGreaterThan(10);
      expect(block.benefit.length).toBeGreaterThan(10);
      expect(block.minutes).toBeGreaterThan(0);
    }
  });

  it("explains the plan from patterns when nothing is due", () => {
    const mission = buildDailyMission({ dueCount: 0, patterns: [pattern], stats });
    expect(mission.blocks.some((block) => block.kind === "weakness")).toBe(true);
    expect(mission.blocks.some((block) => block.kind === "due")).toBe(false);
    const weakness = mission.blocks.find((block) => block.kind === "weakness")!;
    expect(weakness.reason).toBe(pattern.evidence);
  });

  it("does not invent a plan with no evidence at all", () => {
    const empty = computePlayerStats([]);
    const mission = buildDailyMission({ dueCount: 0, patterns: [], stats: empty });
    expect(mission.blocks).toHaveLength(0);
    expect(mission.totalMinutes).toBe(0);
    expect(mission.headline.length).toBeGreaterThan(5);
  });
});
