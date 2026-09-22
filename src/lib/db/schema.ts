import Dexie, { type Table } from "dexie";
import type { CriticalMoment } from "@/lib/chess/metrics";
import type { MoveClassification } from "@/lib/chess/classification";
import type { PgnHeaders } from "@/lib/chess/pgn";

/**
 * Local-first data architecture (spec §10).
 *
 * IndexedDB via Dexie.js. Everything the product remembers lives on-device:
 * games, analyses, profile, settings, training, coach messages.
 * No PostgreSQL, no server, no account required.
 */

export type GameRecord = {
  id?: number;
  fingerprint: string;
  source: string;
  importedAt: number;
  headers: PgnHeaders;
  sanList: string[];
  uciList: string[];
  result: string;
  pgn: string;
  openingEco?: string;
  openingName?: string;
  analyzedAt?: number;
};

export type GameAnalysis = {
  id?: number;
  gameId: number;
  createdAt: number;
  engineBuild: string;
  strength: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteAcpl: number;
  blackAcpl: number;
  /** cp loss per ply (mover's perspective), aligned with game plies. */
  cpLosses: number[];
  classifications: MoveClassification[];
  criticalMoments: CriticalMoment[];
  opening: { eco?: string; name?: string } | null;
  summary: string;
};

export type ProfileRecord = {
  id: "current";
  displayName: string;
  avatar: string;
  bio: string;
  createdAt: number;
  ratings?: { white?: number; black?: number };
};

export type ThemeSetting = "dark" | "light" | "oled" | "contrast";
export type BoardThemeSetting = "classic" | "wood" | "marble" | "slate" | "minimal";
export type PieceSetSetting = "classic" | "neo" | "minimal";
export type DeviceProfileSetting = "auto" | "ultra-low" | "low" | "balanced" | "high" | "desktop";

export type SettingsRecord = {
  id: "current";
  theme: ThemeSetting;
  boardTheme: BoardThemeSetting;
  pieceSet: PieceSetSetting;
  orientation: "white" | "black";
  deviceProfile: DeviceProfileSetting;
  analysisIntensity: "fast" | "standard" | "deep";
  backgroundAnalysis: boolean;
  personalityId: string;
  targetLevel: "beginner" | "intermediate" | "advanced";
  reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: "current",
  theme: "dark",
  boardTheme: "classic",
  pieceSet: "classic",
  orientation: "white",
  deviceProfile: "auto",
  analysisIntensity: "standard",
  backgroundAnalysis: true,
  personalityId: "professional",
  targetLevel: "intermediate",
  reduceMotion: false,
};

export type TrainingItem = {
  id?: number;
  fen: string;
  solutionUci: string[];
  solutionSan: string[];
  theme: string;
  difficulty: number;
  source: string;
  sourceGameId?: number;
  attempts: number;
  successes: number;
  /** Spaced repetition (SM-2 lite). */
  interval: number;
  ease: number;
  due: number;
  lastResult?: "good" | "hard" | "fail";
  lastSeen: number;
};

export type CoachMessage = {
  id?: number;
  conversationId: string;
  role: "user" | "coach";
  text: string;
  source?: string;
  evidence?: Array<{ type: string; detail: string }>;
  createdAt: number;
};

class ChessIntelligenceDB extends Dexie {
  games!: Table<GameRecord, number>;
  analyses!: Table<GameAnalysis, number>;
  profile!: Table<ProfileRecord, string>;
  settings!: Table<SettingsRecord, string>;
  trainingItems!: Table<TrainingItem, number>;
  coachMessages!: Table<CoachMessage, number>;

  constructor() {
    super("chess-intelligence");
    this.version(1).stores({
      games: "++id, &fingerprint, importedAt, result, openingEco, analyzedAt",
      analyses: "++id, &gameId, createdAt",
      profile: "id",
      settings: "id",
      trainingItems: "++id, &fen, theme, due, lastSeen",
      coachMessages: "++id, conversationId, createdAt",
    });
  }
}

export const db = new ChessIntelligenceDB();

/* ------------------------------------------------------------------ */
/* Repositories                                                        */
/* ------------------------------------------------------------------ */

export type ImportOutcome = {
  added: GameRecord[];
  duplicates: number;
};

/** Insert games, skipping duplicates by fingerprint (spec §29). */
export async function importGames(
  games: Array<Omit<GameRecord, "id" | "fingerprint" | "importedAt"> & { fingerprint: string }>,
): Promise<ImportOutcome> {
  const added: GameRecord[] = [];
  let duplicates = 0;

  for (const game of games) {
    const exists = await db.games.where("fingerprint").equals(game.fingerprint).count();
    if (exists > 0) {
      duplicates++;
      continue;
    }
    const record: GameRecord = { ...game, importedAt: Date.now() };
    const id = await db.games.add(record);
    added.push({ ...record, id });
  }
  return { added, duplicates };
}

export async function listGames(): Promise<GameRecord[]> {
  const games = await db.games.orderBy("importedAt").reverse().toArray();
  return games;
}

export async function getGame(id: number): Promise<GameRecord | undefined> {
  return db.games.get(id);
}

export async function deleteGame(id: number): Promise<void> {
  await db.transaction("rw", db.games, db.analyses, async () => {
    await db.games.delete(id);
    await db.analyses.where("gameId").equals(id).delete();
  });
}

export async function getSettings(): Promise<SettingsRecord> {
  const stored = await db.settings.get("current");
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(patch: Partial<SettingsRecord>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "current" });
}

export async function getProfile(): Promise<ProfileRecord> {
  const stored = await db.profile.get("current");
  return (
    stored ?? {
      id: "current",
      displayName: "Player",
      avatar: "♟",
      bio: "",
      createdAt: Date.now(),
    }
  );
}

export async function saveProfile(patch: Partial<ProfileRecord>): Promise<ProfileRecord> {
  const current = await getProfile();
  const next = { ...current, ...patch, id: "current" as const };
  await db.profile.put(next);
  return next;
}
