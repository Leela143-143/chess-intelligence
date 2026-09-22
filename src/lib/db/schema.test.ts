import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  importGames,
  listGames,
  getSettings,
  saveSettings,
  getProfile,
  saveProfile,
  deleteGame,
  DEFAULT_SETTINGS,
} from "./schema";
import { gameFingerprint } from "@/lib/chess/fingerprint";
import { exportAllData, importBackupData } from "./backup";

const sampleGame = (overrides: Partial<{ white: string; date: string; moves: string[] }> = {}) => {
  const uciList = overrides.moves ?? ["e2e4", "e7e5"];
  const headers = {
    white: overrides.white ?? "Alice",
    black: "Bob",
    date: overrides.date ?? "2024.01.01",
    result: "1-0",
  };
  return {
    fingerprint: gameFingerprint({ headers, uciList }),
    source: "test",
    headers,
    sanList: uciList.map((_, i) => (i === 0 ? "e4" : "e5")),
    uciList,
    result: "1-0",
    pgn: "1. e4 e5 1-0",
  };
};

beforeEach(async () => {
  await db.games.clear();
  await db.analyses.clear();
  await db.trainingItems.clear();
  await db.coachMessages.clear();
});

describe("game import & dedupe", () => {
  it("adds games and skips duplicates by fingerprint", async () => {
    const first = await importGames([sampleGame()]);
    expect(first.added).toHaveLength(1);
    expect(first.duplicates).toBe(0);

    const second = await importGames([sampleGame()]);
    expect(second.added).toHaveLength(0);
    expect(second.duplicates).toBe(1);

    expect(await listGames()).toHaveLength(1);
  });

  it("treats different moves as different games", async () => {
    await importGames([sampleGame()]);
    const other = await importGames([sampleGame({ moves: ["d2d4", "d7d5"] })]);
    expect(other.added).toHaveLength(1);
    expect(await listGames()).toHaveLength(2);
  });

  it("deleting a game cascades to analyses", async () => {
    const { added } = await importGames([sampleGame()]);
    const gameId = added[0]!.id!;
    await db.analyses.add({
      gameId,
      createdAt: Date.now(),
      engineBuild: "test",
      strength: "fast",
      whiteAccuracy: 90,
      blackAccuracy: 80,
      whiteAcpl: 20,
      blackAcpl: 40,
      cpLosses: [5, 50],
      classifications: ["best", "blunder"],
      criticalMoments: [],
      opening: null,
      summary: "test",
    });
    expect(await db.analyses.count()).toBe(1);
    await deleteGame(gameId);
    expect(await db.analyses.count()).toBe(0);
    expect(await db.games.count()).toBe(0);
  });
});

describe("settings & profile", () => {
  it("returns defaults when nothing stored", async () => {
    await db.settings.clear();
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial settings updates", async () => {
    await saveSettings({ theme: "light", analysisIntensity: "deep" });
    const settings = await getSettings();
    expect(settings.theme).toBe("light");
    expect(settings.analysisIntensity).toBe("deep");
    expect(settings.boardTheme).toBe(DEFAULT_SETTINGS.boardTheme);
  });

  it("round-trips the profile", async () => {
    await saveProfile({ displayName: "Magnus", avatar: "♔" });
    const profile = await getProfile();
    expect(profile.displayName).toBe("Magnus");
    expect(profile.avatar).toBe("♔");
  });
});

describe("backup export/import", () => {
  it("exports and restores the full package", async () => {
    await importGames([sampleGame()]);
    await saveSettings({ theme: "oled" });
    await saveProfile({ displayName: "Backup Tester" });

    const backup = await exportAllData();
    expect(backup.games).toHaveLength(1);
    expect(backup.app).toBe("chess-intelligence");

    await db.games.clear();
    await db.profile.clear();
    await db.settings.clear();

    const outcome = await importBackupData(JSON.stringify(backup));
    expect(outcome.gamesImported).toBe(1);
    expect((await listGames())).toHaveLength(1);
    expect((await getProfile()).displayName).toBe("Backup Tester");
    expect((await getSettings()).theme).toBe("oled");
  });

  it("skips duplicates on restore", async () => {
    await importGames([sampleGame()]);
    const backup = await exportAllData();
    const outcome = await importBackupData(JSON.stringify(backup));
    expect(outcome.gamesImported).toBe(0);
    expect(outcome.gamesSkipped).toBe(1);
  });

  it("rejects non-backup payloads", async () => {
    await expect(importBackupData(JSON.stringify({ app: "something-else" }))).rejects.toThrow(
      "Not a Chess Intelligence backup",
    );
  });

  it("blocks prototype pollution payloads", async () => {
    // Raw JSON so the "__proto__" key survives as an own property.
    const evil =
      '{"app":"chess-intelligence","games":[{"pgn":"x","sanList":[],"__proto__":{"polluted":true}}]}';
    await expect(importBackupData(evil)).rejects.toThrow("Unsafe key");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects malformed JSON", async () => {
    await expect(importBackupData("{nope")).rejects.toThrow();
  });
});
