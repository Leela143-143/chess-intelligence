import Dexie, { type Table } from "dexie";
import type { CriticalMoment } from "@/lib/chess/metrics";
import type { MoveClassification } from "@/lib/chess/classification";
import type { PgnHeaders } from "@/lib/chess/pgn";
import type { GamePhase, GameStory, KeyMoment, MoveAssessment } from "@/lib/chess/review";

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
  /**
   * Phase 2.5: per-ply seconds on the clock from PGN `%clk` annotations.
   * `null` where the source carried no clock. Absent on games imported before
   * clock support existed, which the time-management analysis reports honestly
   * instead of assuming.
   */
  clocks?: Array<number | null>;
  result: string;
  pgn: string;
  openingEco?: string;
  openingName?: string;
  /** Which side the local player had, resolved at import time. */
  playerColor?: "w" | "b" | null;
  analyzedAt?: number;
};

export type GameAnalysis = {
  id?: number;
  gameId: number;
  createdAt: number;
  engineBuild: string;
  strength: string;
  /** Deep-pass strength used for the critical moments (Phase 2). */
  deepStrength?: string;
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
  /** Phase 2: full move assessments (includes tactical motifs + allowed). */
  moves?: MoveAssessment[];
  /** Phase 2: ranked turning points with deterministic explanations. */
  moments?: KeyMoment[];
  /** Phase 2: per-phase ACPL, used by profile + training. */
  phaseAcpl?: {
    w: Record<GamePhase, number>;
    b: Record<GamePhase, number>;
  };
  /** Phase 2: the deterministic game story for this side's perspective. */
  story?: GameStory;
  /** Phase 2: which side the story was told from. */
  perspective?: "w" | "b" | null;
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
/** Six board themes (design-system §6). */
export type BoardThemeSetting =
  | "obsidian"
  | "ivory"
  | "slate"
  | "walnut"
  | "paper"
  | "carbon";

/** Six piece sets, all rendered from our own SVG geometry (design-system §7). */
export type PieceSetSetting =
  | "classic"
  | "tournament"
  | "editorial"
  | "minimal"
  | "sculptural"
  | "technical";
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
  /** Names this player uses in PGN headers, so games can be attributed. */
  aliases: string[];
  /** Desktop contextual cursor (brief §13). */
  customCursor: boolean;
  /** Procedural atmosphere layer (brief §12). */
  atmosphere: boolean;
};

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: "current",
  theme: "dark",
  boardTheme: "obsidian",
  pieceSet: "classic",
  orientation: "white",
  deviceProfile: "auto",
  analysisIntensity: "standard",
  backgroundAnalysis: true,
  personalityId: "professional",
  targetLevel: "intermediate",
  reduceMotion: false,
  aliases: [],
  customCursor: true,
  atmosphere: true,
};

/** Resolve which side the local player had, from PGN player names. */
export function detectPlayerColor(
  headers: PgnHeaders,
  aliases: string[],
): "w" | "b" | null {
  const wanted = aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return null;
  const white = headers.white?.trim().toLowerCase() ?? "";
  const black = headers.black?.trim().toLowerCase() ?? "";
  if (wanted.includes(white) && !wanted.includes(black)) return "w";
  if (wanted.includes(black) && !wanted.includes(white)) return "b";
  return null;
}

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
  /** Deterministic reveal text, generated with the position. */
  explanation?: string;
  lesson?: string;
  playedSan?: string;
  bestSan?: string;
  /** Ply in the source game, for "show me the game" links. */
  ply?: number;
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
    // v2 adds the player-colour index used by every analytics view.
    this.version(2).stores({
      games: "++id, &fingerprint, importedAt, result, openingEco, analyzedAt, playerColor",
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
  games: Array<
    Omit<GameRecord, "id" | "fingerprint" | "importedAt"> & { fingerprint: string }
  >,
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

/** Persist (or replace) a game review and stamp the game as analysed. */
export async function saveAnalysis(
  analysis: Omit<GameAnalysis, "id">,
): Promise<number> {
  return db.transaction("rw", db.analyses, db.games, async () => {
    const existing = await db.analyses.where("gameId").equals(analysis.gameId).first();
    let id: number;
    if (existing?.id !== undefined) {
      await db.analyses.update(existing.id, analysis);
      id = existing.id;
    } else {
      id = await db.analyses.add(analysis as GameAnalysis);
    }
    await db.games.update(analysis.gameId, { analyzedAt: analysis.createdAt });
    return id;
  });
}

export async function getAnalysis(gameId: number): Promise<GameAnalysis | undefined> {
  return db.analyses.where("gameId").equals(gameId).first();
}

export async function listAnalyses(): Promise<GameAnalysis[]> {
  return db.analyses.toArray();
}

export async function setGamePlayerColor(
  gameId: number,
  playerColor: "w" | "b" | null,
): Promise<void> {
  await db.games.update(gameId, { playerColor });
}

/** Every game paired with its review, newest first — the analytics input. */
export async function listGamesWithAnalysis(): Promise<
  Array<{ game: GameRecord; analysis: GameAnalysis }>
> {
  const [games, analyses] = await Promise.all([listGames(), db.analyses.toArray()]);
  const byGame = new Map(analyses.map((analysis) => [analysis.gameId, analysis]));
  const out: Array<{ game: GameRecord; analysis: GameAnalysis }> = [];
  for (const game of games) {
    const analysis = byGame.get(game.id!);
    if (analysis) out.push({ game, analysis });
  }
  return out;
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
