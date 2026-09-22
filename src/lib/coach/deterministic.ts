import { Chess } from "chess.js";
import { detectPhase, materialBalance } from "@/lib/chess/phase";
import type { CoachEvidence, CoachRequest, CoachResponse } from "./types";
import { getPersonality } from "./personalities";

/**
 * Deterministic coach (spec §71).
 *
 * Rule-based explanations generated purely from engine facts + detected
 * tactics + classification. Requires NO language model. This is the honest
 * fallback when local Gemma is unavailable — it never claims to be an AI
 * model ("No fake AI", §72): responses are labeled `deterministic`.
 */

function evalPhrase(pawnsValue: number | null, mate: number | null): string {
  if (mate !== null && mate !== 0) {
    const n = Math.abs(mate);
    return mate > 0 ? `White mates in ${n}` : `Black mates in ${n}`;
  }
  if (pawnsValue === null) return "an unclear evaluation";
  const sign = pawnsValue > 0 ? "+" : pawnsValue < 0 ? "−" : "";
  return `${sign}${Math.abs(pawnsValue).toFixed(2)}`;
}

function swingPhrase(before: number | null, after: number | null, mover: "white" | "black"): string | null {
  if (before === null || after === null) return null;
  const moverBefore = mover === "white" ? before : -before;
  const moverAfter = mover === "white" ? after : -after;
  const swing = moverBefore - moverAfter;
  if (swing < 0.5) return null;
  return `the evaluation dropped from ${evalPhrase(before, null)} to ${evalPhrase(after, null)} — about ${swing.toFixed(2)} pawns of advantage lost by ${mover}`;
}

const PHASE_HINT = {
  opening: "in the opening, prioritize development, king safety and controlling the center",
  middlegame: "in the middlegame, compare candidate moves by king safety, piece activity and pawn structure",
  endgame: "in the endgame, activate the king, avoid pawn weaknesses and calculate pawn races precisely",
} as const;

function explainMove(req: CoachRequest): string | null {
  const ctx = req.context;
  const personality = getPersonality(req.personalityId);
  const parts: string[] = [];

  const mover = ctx.move?.playedBy ?? (ctx.position.sideToMove === "w" ? "black" : "white");

  if (ctx.classification) {
    switch (ctx.classification) {
      case "blunder":
        parts.push(`${mover}'s move is a blunder.`);
        break;
      case "mistake":
        parts.push(`${mover}'s move is a mistake.`);
        break;
      case "inaccuracy":
        parts.push(`${mover}'s move is an inaccuracy.`);
        break;
      case "missed-opportunity":
        parts.push(`A much stronger move was available here.`);
        break;
      case "best":
        parts.push(`This is the engine's first choice.`);
        break;
      case "book":
        parts.push(`This matches established opening theory.`);
        break;
      case "forced":
        parts.push(`Only one legal move existed.`);
        break;
      case "only-move":
        parts.push(`Practically the only move to hold the position.`);
        break;
      default:
        parts.push(`A reasonable move.`);
    }
  }

  if (ctx.engine) {
    const swing = swingPhrase(
      ctx.engine.evaluationBefore,
      ctx.engine.evaluationAfter,
      mover,
    );
    if (swing) parts.push(`After the move, ${swing}.`);
    else if (ctx.engine.evaluationAfter !== null) {
      parts.push(`Evaluation: ${evalPhrase(ctx.engine.evaluationAfter, null)}.`);
    }
    if (ctx.engine.bestMove) {
      parts.push(`The engine's preference is ${ctx.engine.bestMove}.`);
    }
  }

  if (ctx.theme) {
    parts.push(`A tactical theme here: ${ctx.theme.replace(/-/g, " ")}.`);
  }

  parts.push(`Reminder: ${PHASE_HINT[ctx.phase]}.`);

  const tone = personality.tone;
  void tone; // presentation is applied by the LLM path; deterministic text stays neutral
  return parts.join(" ");
}

function betterMoveText(req: CoachRequest): string | null {
  const ctx = req.context;
  if (!ctx.engine?.bestMove) return null;
  const pv = ctx.engine.pv.slice(0, 4).join(" ");
  const base = `The engine's line is ${ctx.engine.bestMove}${pv ? ` followed by ${pv}` : ""}.`;
  const reason = ctx.theme
    ? ` It addresses the ${ctx.theme.replace(/-/g, " ")} motif directly.`
    : ` Compare it with your move using ${PHASE_HINT[ctx.phase]}.`;
  return base + reason;
}

function tacticText(req: CoachRequest): string | null {
  const ctx = req.context;
  if (!ctx.theme || !ctx.move) return null;
  const theme = ctx.theme.replace(/-/g, " ");
  return `The position turned on a ${theme}: after ${ctx.move.san}, ${theme} resources decide the evaluation. Recheck forcing moves — checks, captures and threats — before quiet moves in such positions.`;
}

/** Build a deterministic (non-LLM) coach response from structured facts. */
export function deterministicCoach(req: CoachRequest): CoachResponse {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  let text: string | null = null;
  switch (req.action) {
    case "better-move":
      text = betterMoveText(req) ?? explainMove(req);
      break;
    case "show-idea":
    case "find-similar":
    case "create-puzzle":
      text = tacticText(req) ?? explainMove(req);
      break;
    case "why-bad":
    case "explain-move":
    case "why-lost":
    case "show-variation":
    case "explain-simply":
    case "explain-deeply":
    case "practice-advice":
    case "freeform":
    default:
      text = explainMove(req);
  }

  const evidence: CoachEvidence[] = [];
  if (req.context.engine) {
    evidence.push({
      type: "engine",
      detail: `Stockfish depth ${req.context.engine.depth}: before ${evalPhrase(req.context.engine.evaluationBefore, null)}, after ${evalPhrase(req.context.engine.evaluationAfter, null)}${req.context.engine.bestMove ? `, best ${req.context.engine.bestMove}` : ""}`,
    });
  }
  if (req.context.theme) {
    evidence.push({ type: "tactic", detail: `Detected theme: ${req.context.theme}` });
  }
  if (req.context.player?.relevantStats) {
    for (const [key, value] of Object.entries(req.context.player.relevantStats)) {
      evidence.push({ type: "stat", detail: `${key}: ${value}` });
    }
  }

  const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;

  return {
    text: text ?? "There is not enough structured information to explain this position yet.",
    source: "deterministic",
    evidence,
    confidence: req.context.engine ? "high" : "low",
    generatedInMs: Math.round(elapsed),
  };
}

/** Quick helper used by the board page when only a FEN is known. */
export function describePosition(fen: string): string {
  try {
    const chess = new Chess(fen);
    const phase = detectPhase(fen, chess.history().length);
    const material = materialBalance(fen);
    return `${phase} position; material ${material === 0 ? "level" : material > 0 ? `+${material} for White` : `+${-material} for Black`}.`;
  } catch {
    return "Position could not be parsed.";
  }
}
