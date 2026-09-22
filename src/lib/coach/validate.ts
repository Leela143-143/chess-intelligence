import { Chess } from "chess.js";
import type { CoachContext } from "./types";

/**
 * Coach response validation (spec §21).
 *
 * Before any model text is shown we verify the claims it makes against the
 * structured context. Unsupported claims are removed (never presented as
 * fact). The AI must never fabricate evidence.
 */

export type ValidationIssue = {
  type: "unsupported-eval" | "illegal-move" | "unsupported-stat";
  excerpt: string;
  action: "removed";
};

export type ValidationResult = {
  text: string;
  issues: ValidationIssue[];
};

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/** Numbers in the context that a coach is allowed to cite. */
function allowedNumbers(ctx: CoachContext): number[] {
  const allowed: number[] = [];
  if (ctx.engine) {
    for (const v of [ctx.engine.evaluationBefore, ctx.engine.evaluationAfter]) {
      if (v !== null && v !== undefined) {
        allowed.push(v, Math.round(v * 10) / 10, Math.round(v));
      }
    }
    if (ctx.engine.depth) allowed.push(ctx.engine.depth);
  }
  if (ctx.player?.relevantStats) {
    for (const v of Object.values(ctx.player.relevantStats)) allowed.push(v);
  }
  return allowed;
}

function numbersMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.11;
}

/** Signed decimal tokens that look like evaluations: +1.8, -0.7, +3 */
const EVAL_CLAIM_RE = /(?<![\w#])([+-]\d{1,3}(?:\.\d{1,2})?)(?![\w])/g;

/** SAN-looking move tokens: Nf3, exd5, Bxh7+, O-O, e8=Q+ */
const SAN_CLAIM_RE = /\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;

/** Statistical claims: "12 of your 30 games", "60% of the time", "you blunder 4 times" */
const STAT_CLAIM_RE =
  /\b\d+(?:\.\d+)?(?:\s*of\s*\d+|\s*%)?\s+(?:games?|losses|wins|blunders?|mistakes?|forks?|endings?|openings?|times|percent)/gi;

function legalMovesFrom(fen: string): { sans: Set<string>; uci: Set<string> } {
  const sans = new Set<string>();
  const uci = new Set<string>();
  try {
    const chess = new Chess(fen);
    for (const m of chess.moves({ verbose: true })) {
      sans.add(m.san);
      uci.add(`${m.from}${m.to}${m.promotion ?? ""}`);
    }
  } catch {
    /* invalid FEN: nothing legal to check against */
  }
  return { sans, uci };
}

/**
 * Validate model output against the structured context.
 * Returns sanitized text plus the list of removed claims.
 */
export function validateCoachResponse(
  text: string,
  ctx: CoachContext,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const allowed = allowedNumbers(ctx);
  const { sans: legalSans, uci: legalUci } = legalMovesFrom(ctx.position.fen);
  const engineMoves = new Set<string>([
    ...(ctx.engine?.pv ?? []),
    ...(ctx.engine?.bestMove ? [ctx.engine.bestMove] : []),
  ]);

  const kept: string[] = [];

  for (const sentence of text.split(SENTENCE_SPLIT)) {
    if (sentence.trim().length === 0) continue;

    // 1. Evaluation claims must match provided engine evals.
    const evalClaims = [...sentence.matchAll(EVAL_CLAIM_RE)];
    const badEval = evalClaims.find((m) => {
      const value = Number(m[1]);
      // Only police values that look like evals (fractional or small signed).
      if (!Number.isFinite(value)) return false;
      if (!sentence.toLowerCase().includes("eval") && !m[1]!.includes(".")) {
        return false; // bare integers like "move 20" are not eval claims
      }
      return !allowed.some((a) => numbersMatch(a, value));
    });
    if (badEval) {
      issues.push({
        type: "unsupported-eval",
        excerpt: sentence.trim(),
        action: "removed",
      });
      continue;
    }

    // 2. Move claims must be legal here, the engine's move, or in the PV.
    const moveClaims = [...sentence.matchAll(SAN_CLAIM_RE)];
    const badMove = moveClaims.find((m) => {
      const token = m[0];
      if (legalSans.has(token)) return false;
      if (engineMoves.has(token)) return false;
      // The move actually under discussion is always allowed.
      if (ctx.move && ctx.move.san === token) return false;
      // PV contains UCI — allow direct UCI hits.
      if (legalUci.has(token)) return false;
      return true;
    });
    if (badMove) {
      issues.push({
        type: "illegal-move",
        excerpt: sentence.trim(),
        action: "removed",
      });
      continue;
    }

    // 3. Statistical claims require provided player stats.
    const statClaims = [...sentence.matchAll(STAT_CLAIM_RE)];
    if (statClaims.length > 0 && !ctx.player?.relevantStats) {
      issues.push({
        type: "unsupported-stat",
        excerpt: sentence.trim(),
        action: "removed",
      });
      continue;
    }

    kept.push(sentence);
  }

  return { text: kept.join(" ").trim(), issues };
}

/** Convenience: extract removed claim excerpts. */
export function removedExcerpts(result: ValidationResult): string[] {
  return result.issues.map((i) => i.excerpt);
}
