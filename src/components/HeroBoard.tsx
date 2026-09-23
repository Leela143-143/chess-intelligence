import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import { EvalBar } from "@/components/EvaluationGraph";
import { formatEval, evalTier } from "@/lib/chess/analysis";
import { useEngine } from "@/lib/engineContext";
import type { EngineEvaluation } from "@/lib/engine/types";
import { useHeroTilt } from "@/components/ambient";

/**
 * HeroBoard (brief §7, §54) — a working board on the home screen and the
 * landing page, so the product demonstrates itself instead of describing
 * itself. Anyone can play a move in under two seconds without importing
 * anything, and the engine answers live.
 */

const DEMO_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function HeroBoard({
  startFen = DEMO_FEN,
  caption,
  showEval = true,
}: {
  startFen?: string;
  caption?: string;
  showEval?: boolean;
}): ReactNode {
  const engine = useEngine();
  const { ref, enabled } = useHeroTilt();
  const [history, setHistory] = useState<string[]>([startFen]);
  const [played, setPlayed] = useState<Array<{ from: string; to: string }>>([]);
  const [viewPly, setViewPly] = useState(0);
  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [flip, setFlip] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const fen = history[Math.min(viewPly, history.length - 1)] ?? startFen;
  const lastMove = useMemo(
    () => (viewPly > 0 ? played[viewPly - 1] ?? null : null),
    [played, viewPly],
  );

  // Live evaluation of the displayed position.
  useEffect(() => {
    if (!showEval || !engine) return;
    cancelRef.current?.();
    const handle = engine.analyze({ fen, strength: "fast", priority: 1 });
    cancelRef.current = handle.cancel;
    handle.promise
      .then((result) => setEvaluation(result))
      .catch(() => undefined);
    return () => handle.cancel();
  }, [engine, fen, showEval]);

  const onMove = (from: Square, to: Square, promotion: PieceSymbol | null) => {
    try {
      const board = new Chess(history[history.length - 1] ?? startFen);
      const move = board.move({ from, to, promotion: promotion ?? undefined });
      if (!move) return false;
      setHistory((current) => [...current.slice(0, viewPly + 1), board.fen()]);
      setPlayed((current) => [...current.slice(0, viewPly), { from, to }]);
      setViewPly((current) => current + 1);
      return true;
    } catch {
      return false;
    }
  };

  const cp = evaluation?.scoreCp ?? 0;
  const mate = evaluation?.mateIn ?? null;

  return (
    <div className="hero-board" ref={ref}>
      <div className="board-stage">
        {showEval && <EvalBar cp={cp} mate={mate} stretch />}
        <ChessBoard
          fen={fen}
          previousFen={history[Math.max(0, viewPly - 1)] ?? null}
          onMove={onMove}
          lastMove={lastMove}
          orientation={flip ? "black" : "white"}
          advantage={cp > 40 ? "white" : cp < -40 ? "black" : null}
          interactive
        />
      </div>

      {showEval && (
        <div className="row between wrap" style={{ marginTop: "var(--s-3)" }}>
          <div>
            <div className="engine-eval">{formatEval(cp, mate)}</div>
            <div className="small faint">{evaluation ? evalTier(cp, mate) : "engine warming up…"}</div>
          </div>
          <div className="btn-row tight">
            <button
              className="btn small ghost"
              onClick={() => {
                setHistory([startFen]);
                setPlayed([]);
                setViewPly(0);
                setEvaluation(null);
              }}
            >
              Reset
            </button>
            <button className="btn small ghost" onClick={() => setFlip((value) => !value)}>
              Flip
            </button>
          </div>
        </div>
      )}

      <p className="small faint" style={{ marginTop: "var(--s-2)" }}>
        {caption ??
          (enabled
            ? "Play either side — Stockfish answers live, and nothing leaves this device."
            : "Tap a piece to move. Stockfish answers live on your device.")}
      </p>
    </div>
  );
}
