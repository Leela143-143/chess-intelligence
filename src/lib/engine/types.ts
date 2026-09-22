/**
 * Chess Engine Abstraction Layer
 *
 * The UI never talks to Stockfish directly. Everything goes through the
 * `ChessEngine` interface so future engines (or a remote analysis service)
 * can be plugged in without touching the UI.
 */

/** Evaluation from White's perspective, always normalized. */
export type EngineEvaluation = {
  fen: string;
  /** Best move in UCI, or null when the engine returned nothing. */
  bestMove: string | null;
  ponder: string | null;
  /** Centipawns from White's perspective (positive = White better). */
  scoreCp: number;
  /** Moves to mate from White's perspective (positive = White mates). */
  mateIn: number | null;
  depth: number;
  /** Principal variation in UCI moves. */
  pv: string[];
  /** Additional MultiPV lines (excluding the top line). */
  alternatives: EngineLine[];
  nodes: number;
  timeMs: number;
};

export type EngineLine = {
  multipv: number;
  scoreCp: number;
  mateIn: number | null;
  bestMove: string | null;
  pv: string[];
};

/** User-facing analysis strength (spec §14). */
export type AnalysisStrength = "fast" | "standard" | "deep" | "maximum";

export type StrengthBudget = {
  maxDepth: number;
  timeMs: number;
  multiPv: number;
};

/**
 * Budgets per strength. "maximum" is intentionally bounded so a mis-click
 * cannot cook a phone for minutes; long studies can pass explicit options.
 */
export const STRENGTH_BUDGETS: Record<AnalysisStrength, StrengthBudget> = {
  fast: { maxDepth: 10, timeMs: 400, multiPv: 1 },
  standard: { maxDepth: 16, timeMs: 2_000, multiPv: 2 },
  deep: { maxDepth: 22, timeMs: 6_000, multiPv: 3 },
  maximum: { maxDepth: 30, timeMs: 15_000, multiPv: 4 },
};

/**
 * Job priorities (spec §16):
 * 1. Current position
 * 2. User-selected move
 * 3. Game review
 * 4. Background historical analysis
 */
export type JobPriority = 1 | 2 | 3 | 4;

export const PRIORITY = {
  CURRENT_POSITION: 1 as JobPriority,
  USER_SELECTED: 2 as JobPriority,
  GAME_REVIEW: 3 as JobPriority,
  BACKGROUND: 4 as JobPriority,
};

export type AnalyzeOptions = {
  fen: string;
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
  /** Abort to stop the search (UCI `stop`). */
  signal?: AbortSignal;
};

export interface ChessEngine {
  readonly name: string;
  /** Resolves when the engine is usable (UCI handshake complete). */
  ready(): Promise<void>;
  /** Analyze a position. Normalized to White's perspective. */
  analyze(options: AnalyzeOptions): Promise<EngineEvaluation>;
  /** Request stop of any in-flight search. */
  stop(): void;
  /** Release the underlying worker. */
  dispose(): void;
}

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export class AnalysisAbortedError extends Error {
  constructor(message = "Analysis aborted") {
    super(message);
    this.name = "AnalysisAbortedError";
  }
}
