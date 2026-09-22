import { useEffect, useRef, useState } from "react";
import type { EngineEvaluation } from "@/lib/engine/types";
import { STRENGTH_BUDGETS, type AnalysisStrength } from "@/lib/engine/types";
import { useEngine } from "@/lib/engineContext";

/**
 * EnginePanel (spec §14, §81) — authoritative Stockfish output for the
 * current position: eval, depth, best move, PV, MultiPV lines, live status.
 */

export type EnginePanelProps = {
  fen: string;
  /** Auto-analyze position changes (uses intensity from settings via strength). */
  autoAnalyze?: boolean;
  strength?: AnalysisStrength;
  onEvaluation?: (evaluation: EngineEvaluation) => void;
  /** Evaluation computed elsewhere (e.g. the page's cache) — shown when present. */
  externalEval?: EngineEvaluation | null;
};

function formatEval(evaluation: EngineEvaluation): string {
  if (evaluation.mateIn !== null && evaluation.mateIn !== 0) {
    return evaluation.mateIn > 0 ? `M${evaluation.mateIn}` : `-M${Math.abs(evaluation.mateIn)}`;
  }
  const pawns = evaluation.scoreCp / 100;
  return `${pawns >= 0 ? "+" : "−"}${Math.abs(pawns).toFixed(2)}`;
}

export function evalLabel(evaluation: EngineEvaluation): string {
  return formatEval(evaluation);
}

export default function EnginePanel({
  fen,
  autoAnalyze = false,
  strength = "standard",
  onEvaluation,
  externalEval = null,
}: EnginePanelProps) {
  const engine = useEngine();
  const [internalEval, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStrength, setLocalStrength] = useState<AnalysisStrength>(strength);
  const cancelRef = useRef<(() => void) | null>(null);
  const onEvalRef = useRef(onEvaluation);
  onEvalRef.current = onEvaluation;

  const analyze = async (targetFen: string, useStrength: AnalysisStrength) => {
    if (!engine) return;
    cancelRef.current?.();
    setRunning(true);
    setError(null);
    const budget = STRENGTH_BUDGETS[useStrength];
    const handle = engine.analyze({
      fen: targetFen,
      strength: useStrength,
      priority: 1,
      depth: budget.maxDepth,
      movetimeMs: budget.timeMs,
      multiPv: budget.multiPv,
    });
    cancelRef.current = handle.cancel;
    try {
      const result = await handle.promise;
      setEvaluation(result);
      onEvalRef.current?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/abort|cancel/i.test(message)) setError(message);
    } finally {
      setRunning(false);
      cancelRef.current = null;
    }
  };

  useEffect(() => {
    if (autoAnalyze) void analyze(fen, localStrength);
     
  }, [fen, autoAnalyze, localStrength]);

  const stop = () => {
    cancelRef.current?.();
    setRunning(false);
  };

  // Prefer an evaluation supplied by the page's FEN-keyed cache.
  const evaluation = externalEval ?? internalEval;

  const whitePct = evaluation
    ? Math.max(4, Math.min(96, 50 + (evaluation.mateIn !== null
        ? Math.sign(evaluation.mateIn) * 46
        : evaluation.scoreCp / 40)))
    : 50;

  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="row">
          <div className="evalbar" style={{ height: 96 }} aria-hidden>
            <div className="white-part" style={{ height: `${whitePct}%` }} />
          </div>
          <div>
            <div className="engine-eval">
              {evaluation ? formatEval(evaluation) : running ? "…" : "—"}
            </div>
            <div className="small faint">
              {evaluation
                ? `depth ${evaluation.depth} · ${evaluation.nodes ? `${Math.round(evaluation.nodes / 1000)}k nodes` : ""}`
                : engine?.statusMessage ?? "Engine not ready"}
            </div>
          </div>
        </div>
        <div className="seg" role="group" aria-label="Analysis strength">
          {(Object.keys(STRENGTH_BUDGETS) as AnalysisStrength[]).map((key) => (
            <button
              key={key}
              className={localStrength === key ? "active" : ""}
              onClick={() => setLocalStrength(key)}
            >
              {key[0]!.toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {evaluation && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="engine-line">
            best: <strong>{evaluation.bestMove ?? "—"}</strong>
            {evaluation.pv.length > 0 && <> · pv: {evaluation.pv.slice(0, 8).join(" ")}</>}
          </div>
          {evaluation.alternatives.map((alt) => (
            <div className="engine-line faint" key={alt.multipv}>
              {alt.multipv}. {formatEval({ ...evaluation, scoreCp: alt.scoreCp, mateIn: alt.mateIn })}{" "}
              {alt.pv.slice(0, 6).join(" ")}
            </div>
          ))}
        </div>
      )}

      {error && <div className="small" style={{ color: "var(--danger)" }}>{error}</div>}

      <div className="btn-row">
        <button className="btn small" onClick={() => void analyze(fen, localStrength)} disabled={!engine}>
          {running ? "Analyzing…" : "Analyze position"}
        </button>
        {running && (
          <button className="btn small ghost" onClick={stop}>
            Stop
          </button>
        )}
        <span className="chip">
          {engine ? `${engine.deviceClass} · pool ${engine.stats().poolSize}` : "no engine"}
        </span>
      </div>
    </div>
  );
}
