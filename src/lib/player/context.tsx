import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  db,
  listGamesWithAnalysis,
  type GameAnalysis,
  type GameRecord,
  type TrainingItem,
} from "@/lib/db/schema";
import { computeChessDna, detectPatterns, type ChessDna, type PatternCard } from "@/lib/chess/dna";
import { computePlayerStats, type PlayerStats } from "./stats";
import {
  toDnaGames,
  toPlayerGames,
  toTrainingSources,
  type GameWithAnalysis,
} from "./analytics";
import { generateTrainingItems, type GeneratedItem } from "@/lib/training/engine";

/**
 * Player analytics context (brief §26–§33).
 *
 * One load of the local database produces every derived view: player stats,
 * Chess DNA, recurring patterns and the training pool. Views subscribe instead
 * of re-querying, and `refresh()` re-derives after an import or a review.
 */

export type PlayerContextValue = {
  ready: boolean;
  games: GameRecord[];
  pairs: GameWithAnalysis[];
  analysed: number;
  total: number;
  stats: PlayerStats;
  dna: ChessDna;
  patterns: PatternCard[];
  /** Positions available to train, hardest first. */
  pool: GeneratedItem[];
  /** Pool entries whose schedule is due now. */
  due: TrainingItem[];
  refresh: () => Promise<void>;
  /** Persist a freshly generated pool into the training table. */
  syncPool: () => Promise<number>;
};

const EMPTY_PAIRS: GameWithAnalysis[] = [];

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }): ReactNode {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [pairs, setPairs] = useState<GameWithAnalysis[]>(EMPTY_PAIRS);
  const [ready, setReady] = useState(false);
  const [pool, setPool] = useState<GeneratedItem[]>([]);
  const [due, setDue] = useState<TrainingItem[]>([]);

  const load = useCallback(async () => {
    try {
      const all = await db.games.orderBy("importedAt").reverse().toArray();
      const withAnalysis = await listGamesWithAnalysis();
      const sources = toTrainingSources(withAnalysis);
      const generated = generateTrainingItems(sources, 24);
      const stored = await db.trainingItems.toArray();
      const now = Date.now();
      setGames(all);
      setPairs(withAnalysis);
      setPool(generated);
      setDue(stored.filter((item) => item.due <= now).sort((a, b) => a.due - b.due));
    } catch {
      setGames([]);
      setPairs(EMPTY_PAIRS);
      setPool([]);
      setDue([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => computePlayerStats(toPlayerGames(pairs)), [pairs]);
  const dna = useMemo(() => computeChessDna(toDnaGames(pairs)), [pairs]);
  const patterns = useMemo(() => detectPatterns(toDnaGames(pairs)), [pairs]);

  const syncPool = useCallback(async () => {
    const now = Date.now();
    let added = 0;
    for (const item of pool) {
      const existing = await db.trainingItems.where("fen").equals(item.fen).first();
      if (existing) continue;
      const record: TrainingItem = {
        fen: item.fen,
        solutionUci: item.solutionUci,
        solutionSan: item.solutionSan,
        theme: item.theme,
        difficulty: item.difficulty,
        source: item.source,
        ...(item.sourceGameId !== undefined ? { sourceGameId: item.sourceGameId } : {}),
        attempts: 0,
        successes: 0,
        interval: 0,
        ease: 2.5,
        due: now,
        lastSeen: 0,
        explanation: item.explanation,
        lesson: item.lesson,
        playedSan: item.playedSan,
        ...(item.bestSan ? { bestSan: item.bestSan } : {}),
        ply: item.ply,
      };
      await db.trainingItems.add(record);
      added += 1;
    }
    if (added > 0) await load();
    return added;
  }, [pool, load]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      ready,
      games,
      pairs,
      analysed: pairs.length,
      total: games.length,
      stats,
      dna,
      patterns,
      pool,
      due,
      refresh: load,
      syncPool,
    }),
    [ready, games, pairs, stats, dna, patterns, pool, due, load, syncPool],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error("usePlayer must be used inside <PlayerProvider>");
  }
  return value;
}

/** Analysis for a single game, loaded on demand (Game page). */
export async function loadAnalysis(gameId: number): Promise<GameAnalysis | undefined> {
  return db.analyses.where("gameId").equals(gameId).first();
}
