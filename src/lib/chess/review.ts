import type { MoveClassification } from "./classification";
import type { ExceptionalEvidence } from "./exceptional";
import type { TacticTheme } from "./tactics";
import type { OpeningMatch } from "./openings";

/**
 * Game-review data contract (brief §59–§63).
 *
 * Types only — no logic — so the storage layer (db/schema.ts) can import them
 * without depending on the analysis pipeline, and the pipeline can be tested
 * against these shapes with a stub engine.
 */

export type GamePhase = "opening" | "middlegame" | "endgame";

/** One ply of a reviewed game, with every deterministic fact we know about it. */
export type MoveAssessment = {
  /** 1-based ply (1 = White's first move). */
  ply: number;
  san: string;
  uci: string;
  mover: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  /** White-perspective evaluations (pawns in the coach contract, cp here). */
  evalBeforeCp: number;
  evalBeforeMate: number | null;
  evalAfterCp: number;
  evalAfterMate: number | null;
  /** Engine best move in the position *before* the move. */
  bestUci: string | null;
  bestSan: string | null;
  /** Centipawns lost by the mover (>= 0). */
  cpLoss: number;
  /** Centipawns the engine's move would have gained over the played move. */
  cpOpportunity: number;
  classification: MoveClassification;
  phase: GamePhase;
  /** Tactical motifs the played move created (your own tactics). */
  motifs: TacticTheme[];
  /**
   * Motifs the opponent's *best reply* would create after this move — i.e.
   * what the move allowed. This is the evidence behind "loose pieces",
   * "you allowed a fork" and the rest of the pattern engine.
   */
  allowedMotifs: TacticTheme[];
  /** True when the opponent has a checking move available after this move. */
  allowedCheck: boolean;
  /** True when this ply was re-analysed at the deep strength (stage 2). */
  deep: boolean;
  /** Deep-pass evaluation after the engine's best move (White perspective). */
  bestChildCp?: number | null;
  /** Principal variation from the deep pass (UCI). */
  pv?: string[];
  /**
   * Phase 2.5: present whenever the move was tested by the exceptional-move
   * engine (whether or not it graded as brilliant/exceptional). Carries the
   * sacrifice, only-move, difficulty, stability and confidence evidence behind
   * the verdict so the UI and the coach can show their work.
   */
  exceptional?: ExceptionalEvidence;
  /** Seconds left on the mover's clock after this move (from PGN `%clk`). */
  clockSeconds?: number | null;
  /** Seconds the mover spent on this move, when clocks are known. */
  thinkSeconds?: number | null;
};

export type ClassificationCounts = Record<MoveClassification, number>;

export type SideSummary = {
  color: "w" | "b";
  /** Average centipawn loss over the side's plies. */
  acpl: number;
  /** Deterministic accuracy, 0–100 (see metrics.accuracyFromLosses). */
  accuracy: number;
  counts: ClassificationCounts;
  blunderPlies: number[];
  mistakePlies: number[];
  inaccuracyPlies: number[];
  bestPlies: number[];
  /** Per-phase ACPL, useful for the profile and training engines. */
  phaseAcpl: Record<GamePhase, number>;
  phaseCount: Record<GamePhase, number>;
  /** Motifs this side created, most frequent first. */
  motifs: Array<{ theme: TacticTheme; count: number }>;
};

export type KeyMomentKind =
  | "largest-swing"
  | "missed-mate"
  | "allowed-mate"
  | "material-loss"
  | "defensive-failure"
  /** Phase 2.5: a sound sacrifice the engine endorses (see exceptional.ts). */
  | "brilliant"
  /** Phase 2.5: a hard-to-find, position-changing move that is not a sacrifice. */
  | "exceptional";

/** A ranked turning point — the raw material for "The Moment" (brief §56). */
export type KeyMoment = {
  ply: number;
  kind: KeyMomentKind;
  san: string;
  mover: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  evalBeforeCp: number;
  evalAfterCp: number;
  mateBefore: number | null;
  mateAfter: number | null;
  /** Centipawns lost by the mover at this ply. */
  cpLoss: number;
  bestUci: string | null;
  bestSan: string | null;
  /** Evaluation (White perspective) after the engine's own move, when known. */
  bestChildCp?: number | null;
  classification: MoveClassification;
  phase: GamePhase;
  /** Tactics the mover created with this move. */
  motifs: TacticTheme[];
  /** Tactics the move allowed the opponent (the common case for an error). */
  allowedMotifs: TacticTheme[];
  /** Deterministic, human-readable reason (brief §63). */
  explanation: string;
  /** A single imperative for the player, derived from the same facts. */
  lesson: string;
  deep: boolean;
  /** Phase 2.5: the evidence behind a brilliant/exceptional verdict. */
  exceptional?: ExceptionalEvidence;
};

export type EvalPoint = {
  ply: number;
  /** White-perspective centipawns (mates folded to ±1000 for plotting). */
  cp: number;
  mate: number | null;
};

/** Narrative beats rendered as the "Game Story" (brief §22). */
export type StoryBeat = {
  label: string;
  text: string;
  tone: "neutral" | "pos" | "neg" | "warn";
  ply?: number;
};

export type GameStory = {
  beats: StoryBeat[];
  /** One-sentence verdict shown under the score. */
  verdict: string;
  /** Which side the story is told from. */
  perspective: "w" | "b" | null;
};

export type ReviewedGame = {
  plies: number;
  moves: MoveAssessment[];
  evalPoints: EvalPoint[];
  moments: KeyMoment[];
  white: SideSummary;
  black: SideSummary;
  opening: OpeningMatch | null;
  strongest: { ply: number; san: string; mover: "w" | "b" } | null;
  engineBuild: string;
  strength: string;
  deepStrength: string;
  durationMs: number;
  analyzedPlies: number;
  deepPlies: number;
};

export type ReviewStage = "prepare" | "shallow" | "critical" | "deep" | "summarise";

export type ReviewProgress = {
  stage: ReviewStage;
  /** 0–1 across the whole review. */
  ratio: number;
  /** Human sentence for the progress UI (brief §62). */
  text: string;
  ply?: number;
  totalPlies?: number;
  detail?: string;
};

export type AnalysisIntensity = "fast" | "standard" | "deep";

export const INTENSITY_SETTINGS: Record<
  AnalysisIntensity,
  { shallow: "fast" | "standard"; deep: "standard" | "deep" | "maximum"; moments: number }
> = {
  fast: { shallow: "fast", deep: "standard", moments: 4 },
  standard: { shallow: "fast", deep: "deep", moments: 6 },
  deep: { shallow: "standard", deep: "maximum", moments: 10 },
};

export type MoveQualityBand = "best" | "good" | "book" | "inaccuracy" | "mistake" | "blunder";

/** Map a classification to the four-band timeline heat scale. */
export function qualityBand(classification: MoveClassification): MoveQualityBand | "none" {
  switch (classification) {
    case "brilliant":
    case "exceptional":
    case "best":
    case "excellent":
    case "only-move":
      return "best";
    case "good":
      return "good";
    case "book":
    case "forced":
      return "book";
    case "inaccuracy":
      return "inaccuracy";
    case "mistake":
      return "mistake";
    case "blunder":
    case "missed-opportunity":
      return "blunder";
    default:
      return "none";
  }
}
