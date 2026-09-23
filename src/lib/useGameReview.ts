import { useCallback, useRef, useState } from "react";
import { analyzeGame } from "@/lib/chess/analysis";
import { buildGameStory } from "@/lib/chess/story";
import type { GamePhase, ReviewProgress } from "@/lib/chess/review";
import { ENGINE_BUILD } from "@/lib/engine/buildInfo";
import { useEngine } from "@/lib/engineContext";
import { useSettings } from "@/lib/settingsContext";
import { saveAnalysis, type GameAnalysis, type GameRecord } from "@/lib/db/schema";
import { AnalysisAbortedError } from "@/lib/engine/types";

/**
 * Full-game review driver (brief §59–§62).
 *
 * Wires the pure pipeline to the engine scheduler, persists the result, and
 * exposes honest progress (`move 23 / 47`, "Finding the moments that
 * mattered…") so the UI never shows a fake bar.
 */

export type ReviewState =
  | { status: "idle" }
  | { status: "running"; progress: ReviewProgress }
  | { status: "done"; analysis: GameAnalysis }
  | { status: "error"; message: string };

export type GameReviewController = {
  state: ReviewState;
  start: () => Promise<GameAnalysis | null>;
  cancel: () => void;
  reset: () => void;
};

export function useGameReview(
  game: GameRecord | null,
  onSaved?: (analysis: GameAnalysis) => void,
): GameReviewController {
  const engine = useEngine();
  const { settings } = useSettings();
  const [state, setState] = useState<ReviewState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  const start = useCallback(async (): Promise<GameAnalysis | null> => {
    if (!game || !engine) return null;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({
      status: "running",
      progress: { stage: "prepare", ratio: 0.01, text: "Reconstructing your game…" },
    });

    try {
      const review = await analyzeGame({
        uciMoves: game.uciList,
        analyze: (fen, strength) => engine.analyze({ fen, strength, priority: 3 }).promise,
        signals: controller.signal,
        intensity: settings.analysisIntensity,
        engineBuild: `${ENGINE_BUILD.npmPackage}@${ENGINE_BUILD.packageVersion}`,
        // Clock annotations (when the PGN had them) become real evidence for
        // the time-management dimension instead of an assumed value.
        ...(game.clocks && game.clocks.length > 0 ? { clocks: game.clocks } : {}),
        onProgress: (progress) => setState({ status: "running", progress }),
      });

      const perspective = game.playerColor ?? null;
      const story = buildGameStory(review, { perspective, result: game.result });

      const phaseAcpl: { w: Record<GamePhase, number>; b: Record<GamePhase, number> } = {
        w: review.white.phaseAcpl,
        b: review.black.phaseAcpl,
      };

      const analysis: Omit<GameAnalysis, "id"> = {
        gameId: game.id!,
        createdAt: Date.now(),
        engineBuild: `${ENGINE_BUILD.npmPackage}@${ENGINE_BUILD.packageVersion}`,
        strength: review.strength,
        deepStrength: review.deepStrength,
        whiteAccuracy: review.white.accuracy,
        blackAccuracy: review.black.accuracy,
        whiteAcpl: review.white.acpl,
        blackAcpl: review.black.acpl,
        cpLosses: review.moves.map((move) => move.cpLoss),
        classifications: review.moves.map((move) => move.classification),
        criticalMoments: review.moments.map((moment) => ({
          ply: moment.ply,
          moveSan: moment.san,
          mover: moment.mover,
          cpLoss: moment.cpLoss,
          kind: moment.kind,
        })),
        opening: review.opening
          ? { eco: review.opening.eco, name: review.opening.name }
          : null,
        summary: story.verdict,
        moves: review.moves,
        moments: review.moments,
        phaseAcpl,
        story,
        perspective,
      };

      const id = await saveAnalysis(analysis);
      const saved: GameAnalysis = { ...analysis, id };
      setState({ status: "done", analysis: saved });
      onSaved?.(saved);
      return saved;
    } catch (error) {
      if (error instanceof AnalysisAbortedError) {
        setState({ status: "idle" });
        return null;
      }
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      abortRef.current = null;
    }
  }, [game, engine, settings.analysisIntensity, onSaved]);

  return { state, start, cancel, reset };
}
