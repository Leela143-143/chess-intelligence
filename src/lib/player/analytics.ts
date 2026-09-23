import type { GameAnalysis, GameRecord } from "@/lib/db/schema";
import type { DnaGame } from "@/lib/chess/dna";
import type { PlayerGame } from "./stats";
import type { TrainingSource } from "@/lib/training/engine";
import { detectOpening } from "@/lib/chess/openings";

/**
 * Adapters from the stored layer to the analytics layer.
 *
 * Every view (Home, Profile, Training, Games) reads from here so the local
 * database has exactly one interpretation. All pure — no engine, no React.
 */

export type GameWithAnalysis = { game: GameRecord; analysis: GameAnalysis };

function openingLabel(game: GameRecord, analysis: GameAnalysis): string | undefined {
  if (analysis.opening?.name) return analysis.opening.name;
  if (game.openingName) return game.openingName;
  return detectOpening(game.sanList)?.name;
}

function ecoOf(game: GameRecord, analysis: GameAnalysis): string | undefined {
  return analysis.opening?.eco ?? game.openingEco;
}

function eloFor(game: GameRecord, color: "w" | "b" | null): number | undefined {
  const raw = color === "w" ? game.headers.whiteElo : color === "b" ? game.headers.blackElo : undefined;
  const fallback = game.headers.whiteElo ?? game.headers.blackElo;
  const value = Number(raw ?? fallback ?? "");
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function accuracyFor(analysis: GameAnalysis, color: "w" | "b" | null): number | undefined {
  if (color === "w") return analysis.whiteAccuracy;
  if (color === "b") return analysis.blackAccuracy;
  return undefined;
}

function acplFor(analysis: GameAnalysis, color: "w" | "b" | null): number | undefined {
  if (color === "w") return analysis.whiteAcpl;
  if (color === "b") return analysis.blackAcpl;
  return undefined;
}

export function toPlayerGames(pairs: GameWithAnalysis[]): PlayerGame[] {
  return pairs.map(({ game, analysis }) => {
    const color = game.playerColor ?? analysis.perspective ?? null;
    const moves = analysis.moves ?? [];
    const own = color ? moves.filter((move) => move.mover === color) : moves;
    const counts: Record<string, number> = {};
    for (const move of own) {
      counts[move.classification] = (counts[move.classification] ?? 0) + 1;
    }

    const opening = openingLabel(game, analysis);
    const eco = ecoOf(game, analysis);
    const elo = eloFor(game, color);
    const accuracy = accuracyFor(analysis, color);
    const acpl = acplFor(analysis, color);

    return {
      gameId: game.id!,
      color,
      result: game.result,
      ...(game.headers.date ? { date: game.headers.date } : {}),
      ...(opening ? { opening } : {}),
      ...(eco ? { eco } : {}),
      ...(game.headers.timeControl ? { timeControl: game.headers.timeControl } : {}),
      ...(game.headers.termination ? { termination: game.headers.termination } : {}),
      ...(elo !== undefined ? { elo } : {}),
      importedAt: game.importedAt,
      ...(accuracy !== undefined ? { accuracy } : {}),
      ...(acpl !== undefined ? { acpl } : {}),
      counts,
      moves: own,
      moments: analysis.moments ?? [],
    } satisfies PlayerGame;
  });
}

export function toDnaGames(pairs: GameWithAnalysis[]): DnaGame[] {
  return pairs.map(({ game, analysis }) => {
    const color = game.playerColor ?? analysis.perspective ?? null;
    const opening = openingLabel(game, analysis);
    return {
      gameId: game.id!,
      color,
      result: game.result,
      ...(opening ? { opening } : {}),
      ...(game.headers.timeControl ? { timeControl: game.headers.timeControl } : {}),
      ...(game.headers.termination ? { termination: game.headers.termination } : {}),
      importedAt: game.importedAt,
      moves: analysis.moves ?? [],
      moments: analysis.moments ?? [],
    } satisfies DnaGame;
  });
}

export function toTrainingSources(pairs: GameWithAnalysis[]): TrainingSource[] {
  return pairs
    .filter(({ analysis }) => (analysis.moves?.length ?? 0) > 0)
    .map(({ game, analysis }) => ({
      gameId: game.id!,
      color: game.playerColor ?? analysis.perspective ?? null,
      moves: analysis.moves ?? [],
    }));
}

/** How many games still have no review. */
export function unanalysedCount(
  pairs: GameWithAnalysis[],
  totalGames: number,
): number {
  return Math.max(0, totalGames - pairs.length);
}
