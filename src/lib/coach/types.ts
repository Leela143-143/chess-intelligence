import type { MoveClassification } from "@/lib/chess/classification";

/**
 * Structured coach context (spec §20).
 *
 * The model RECEIVES engine facts and EXPLAINS them. It never invents them.
 * Everything in here is deterministic data produced by Stockfish + analytics.
 */

export type GamePhase = "opening" | "middlegame" | "endgame";

export type CoachContext = {
  position: {
    fen: string;
    sideToMove: "w" | "b";
  };
  move?: {
    san: string;
    uci: string;
    playedBy: "white" | "black";
  };
  engine?: {
    /** White-perspective evaluations. */
    evaluationBefore: number | null;
    evaluationAfter: number | null;
    bestMove: string | null;
    depth: number;
    /** UCI principal variation. */
    pv: string[];
  };
  classification?: MoveClassification;
  /** Detected tactic theme (fork, pin, ...), if any. */
  theme?: string;
  phase: GamePhase;
  /** Only relevant, small slices of player evidence — never the whole DB. */
  player?: {
    skillLevel?: number;
    relevantStats?: Record<string, number>;
  };
};

export type CoachSource = "gemma-local" | "deterministic" | "unavailable";

export type CoachEvidence = {
  type: "engine" | "tactic" | "stat" | "game";
  detail: string;
};

export type CoachRequest = {
  context: CoachContext;
  /** Which contextual action triggered this (§52). */
  action:
    | "explain-move"
    | "why-bad"
    | "better-move"
    | "why-lost"
    | "show-idea"
    | "show-variation"
    | "explain-simply"
    | "explain-deeply"
    | "find-similar"
    | "create-puzzle"
    | "practice-advice"
    | "freeform";
  /** Free-form user question for `freeform`. */
  question?: string;
  personalityId: string;
  /** Player-visible skill target for explanation depth. */
  targetLevel?: "beginner" | "intermediate" | "advanced";
};

export type CoachResponse = {
  text: string;
  source: CoachSource;
  evidence: CoachEvidence[];
  confidence: "high" | "medium" | "low";
  /** Sample size backing any statistical claim, when applicable. */
  sampleSize?: number;
  /** Claims removed by validation (never shown as fact). */
  removedClaims?: string[];
  generatedInMs?: number;
};

/**
 * The AI coach engine contract (spec §18).
 *
 * UI → CoachController → CoachEngine → (Gemma | deterministic rules).
 */
export interface CoachEngine {
  readonly id: string;
  readonly displayName: string;
  isAvailable(): boolean;
  /**
   * Generate a response. `onToken` streams partial text when the runtime
   * supports it. Must never fabricate engine data — validation happens
   * downstream regardless.
   */
  generate(
    request: CoachRequest,
    onToken?: (chunk: string) => void,
  ): Promise<CoachResponse>;
}

/** Model profiles (spec §5) — chosen by device capability detection. */
export type ModelProfileId =
  | "gemma-mobile-fast"
  | "gemma-mobile"
  | "gemma-browser-balanced"
  | "gemma-browser-quality";

export type ModelProfile = {
  id: ModelProfileId;
  label: string;
  /** Model artifact identifier (recorded in docs/licenses.md when wired up). */
  modelId: string;
  quantization: string;
  approxSizeMb: number;
  contextTokens: number;
  expectedFirstTokenMs: [number, number];
  requiresWebGpu: boolean;
};

export const MODEL_PROFILES: Record<ModelProfileId, ModelProfile> = {
  "gemma-mobile-fast": {
    id: "gemma-mobile-fast",
    label: "Gemma Mobile Fast",
    modelId: "gemma-2-2b-it (Q4_0, draft)",
    quantization: "Q4_0",
    approxSizeMb: 1400,
    contextTokens: 1024,
    expectedFirstTokenMs: [800, 2500],
    requiresWebGpu: false,
  },
  "gemma-mobile": {
    id: "gemma-mobile",
    label: "Gemma Mobile",
    modelId: "gemma-2-2b-it (Q4_K_M)",
    quantization: "Q4_K_M",
    approxSizeMb: 1700,
    contextTokens: 2048,
    expectedFirstTokenMs: [1200, 4000],
    requiresWebGpu: false,
  },
  "gemma-browser-balanced": {
    id: "gemma-browser-balanced",
    label: "Gemma Browser Balanced",
    modelId: "gemma-2-2b-it (Q8_0)",
    quantization: "Q8_0",
    approxSizeMb: 2900,
    contextTokens: 4096,
    expectedFirstTokenMs: [900, 3000],
    requiresWebGpu: true,
  },
  "gemma-browser-quality": {
    id: "gemma-browser-quality",
    label: "Gemma Browser Quality",
    modelId: "gemma-2-2b-it (F16)",
    quantization: "F16",
    approxSizeMb: 5200,
    contextTokens: 8192,
    expectedFirstTokenMs: [700, 2500],
    requiresWebGpu: true,
  },
};

export type CoachAvailability =
  | { available: true; profile: ModelProfile }
  | { available: false; reason: string };
