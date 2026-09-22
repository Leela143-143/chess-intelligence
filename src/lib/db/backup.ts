import {
  db,
  DEFAULT_SETTINGS,
  type CoachMessage,
  type GameAnalysis,
  type GameRecord,
  type ProfileRecord,
  type SettingsRecord,
  type TrainingItem,
} from "./schema";
import { gameFingerprint } from "@/lib/chess/fingerprint";

/**
 * Full data export/import (spec §76–77).
 *
 * A portable JSON package containing games, analyses, profile, settings,
 * training and coach history. Restore it on another device.
 */

export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 50_000_000;

export type BackupPackage = {
  schemaVersion: number;
  exportedAt: string;
  app: "chess-intelligence";
  games: GameRecord[];
  analyses: GameAnalysis[];
  profile: ProfileRecord;
  settings: SettingsRecord;
  trainingItems: TrainingItem[];
  coachMessages: CoachMessage[];
};

export async function exportAllData(): Promise<BackupPackage> {
  const [games, analyses, trainingItems, coachMessages] = await Promise.all([
    db.games.toArray(),
    db.analyses.toArray(),
    db.trainingItems.toArray(),
    db.coachMessages.orderBy("createdAt").toArray(),
  ]);
  const profile = await db.profile.get("current");
  const settings = await db.settings.get("current");

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: "chess-intelligence",
    games,
    analyses,
    profile: profile ?? {
      id: "current",
      displayName: "Player",
      avatar: "♟",
      bio: "",
      createdAt: Date.now(),
    },
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    trainingItems,
    coachMessages,
  };
}

/** Serialize the backup for download. */
export async function exportAllDataAsJson(): Promise<string> {
  return JSON.stringify(await exportAllData());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Guard against prototype pollution and malformed payloads. */
function assertSafe(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertSafe(item, `${path}[${i}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error(`Unsafe key "${key}" at ${path}`);
      }
      assertSafe(value[key], `${path}.${key}`);
    }
  }
}

export type RestoreOutcome = {
  gamesImported: number;
  gamesSkipped: number;
  analysesImported: number;
  trainingImported: number;
  coachImported: number;
};

/** Restore a backup package (merges games by fingerprint, replaces profile/settings). */
export async function importBackupData(json: string): Promise<RestoreOutcome> {
  if (json.length > MAX_BACKUP_BYTES) {
    throw new Error("Backup file is too large.");
  }
  const parsed: unknown = JSON.parse(json);
  if (!isPlainObject(parsed) || parsed.app !== "chess-intelligence") {
    throw new Error("Not a Chess Intelligence backup package.");
  }
  assertSafe(parsed);

  const pkg = parsed as unknown as BackupPackage;
  let gamesImported = 0;
  let gamesSkipped = 0;

  for (const game of pkg.games ?? []) {
    if (!game || typeof game.pgn !== "string" || !Array.isArray(game.sanList)) continue;
    const fingerprint =
      game.fingerprint ??
      gameFingerprint({ headers: game.headers ?? {}, uciList: game.uciList ?? [] });
    const exists = await db.games.where("fingerprint").equals(fingerprint).count();
    if (exists > 0) {
      gamesSkipped++;
      continue;
    }
    await db.games.add({ ...game, fingerprint, importedAt: game.importedAt ?? Date.now() });
    gamesImported++;
  }

  let analysesImported = 0;
  for (const analysis of pkg.analyses ?? []) {
    if (!analysis || typeof analysis.gameId !== "number") continue;
    const hasGame = await db.games.get(analysis.gameId);
    if (!hasGame) continue; // never orphan analyses
    await db.analyses.add({ ...analysis, createdAt: analysis.createdAt ?? Date.now() });
    analysesImported++;
  }

  let trainingImported = 0;
  for (const item of pkg.trainingItems ?? []) {
    if (!item || typeof item.fen !== "string" || !Array.isArray(item.solutionUci)) continue;
    await db.trainingItems.add({
      ...item,
      attempts: item.attempts ?? 0,
      successes: item.successes ?? 0,
      interval: item.interval ?? 0,
      ease: item.ease ?? 2.5,
      due: item.due ?? Date.now(),
      lastSeen: item.lastSeen ?? Date.now(),
    });
    trainingImported++;
  }

  let coachImported = 0;
  for (const message of pkg.coachMessages ?? []) {
    if (!message || typeof message.text !== "string") continue;
    await db.coachMessages.add({
      ...message,
      createdAt: message.createdAt ?? Date.now(),
    });
    coachImported++;
  }

  if (isPlainObject(pkg.profile)) {
    await db.profile.put({
      id: "current",
      ...(pkg.profile as Partial<ProfileRecord>),
    } as ProfileRecord);
  }
  if (isPlainObject(pkg.settings)) {
    await db.settings.put({ ...DEFAULT_SETTINGS, ...(pkg.settings as Partial<SettingsRecord>) });
  }

  return { gamesImported, gamesSkipped, analysesImported, trainingImported, coachImported };
}

/** Trigger a browser download of the JSON backup. */
export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
