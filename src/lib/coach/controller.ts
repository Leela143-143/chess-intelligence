import type {
  CoachEngine,
  CoachRequest,
  CoachResponse,
} from "./types";
import { deterministicCoach } from "./deterministic";
import { localCoach } from "./gemma";
import { validateCoachResponse, removedExcerpts } from "./validate";

/**
 * CoachController (spec §18, §21, §70, §72).
 *
 * UI → CoachController → CoachEngine → (Gemma | deterministic rules)
 *
 * - Picks the best available engine; falls back to deterministic rules.
 * - ALWAYS validates output against the structured context.
 * - Never fabricates model output: `source` honestly reports what produced
 *   the text ("deterministic" is never labeled as AI).
 */
export class CoachController {
  constructor(
    private readonly engines: CoachEngine[] = [localCoach],
    private readonly fallback = deterministicCoach,
  ) {}

  availableEngine(): CoachEngine | null {
    return this.engines.find((e) => e.isAvailable()) ?? null;
  }

  async ask(
    request: CoachRequest,
    onToken?: (chunk: string) => void,
  ): Promise<CoachResponse> {
    const engine = this.availableEngine();
    let response: CoachResponse;

    if (engine) {
      try {
        response = await engine.generate(request, onToken);
      } catch {
        // Honest degradation (§70): no cloud, no fake AI.
        response = {
          text:
            "Local AI Coach could not run right now. Here is the rule-based explanation instead.",
          source: "unavailable",
          evidence: [],
          confidence: "low",
        };
        const fallback = this.fallback(request);
        response = {
          ...fallback,
          text: response.text + " " + fallback.text,
        };
      }
    } else {
      response = this.fallback(request);
      onToken?.(response.text);
    }

    // Validation applies to every source (§21, §104).
    const validation = validateCoachResponse(response.text, request.context);
    const removed = removedExcerpts(validation);

    return {
      ...response,
      text:
        validation.text.length > 0
          ? validation.text
          : "I can only discuss the engine facts available for this position.",
      removedClaims: removed.length > 0 ? removed : response.removedClaims,
    };
  }
}

export const coachController = new CoachController();
