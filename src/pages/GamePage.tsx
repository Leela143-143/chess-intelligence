import { useEffect, useMemo, useState } from "react";
import ChessBoard from "@/components/ChessBoard";
import MoveList from "@/components/MoveList";
import EnginePanel from "@/components/EnginePanel";
import CoachPanel from "@/components/CoachPanel";
import EvaluationGraph from "@/components/EvaluationGraph";
import { useChessGame } from "@/lib/useChessGame";
import { useEngine } from "@/lib/engineContext";
import { buildCoachContext } from "@/lib/coach/context";
import { deleteGame, getGame, type GameRecord } from "@/lib/db/schema";
import { detectOpening } from "@/lib/chess/openings";
import { navigate } from "@/lib/router";
import type { EngineEvaluation } from "@/lib/engine/types";
import type { PieceSymbol, Square } from "chess.js";

/**
 * Game view (Phase 1): board + moves + engine + coach for one stored game.
 * Full two-stage game review pipeline lands in Phase 2; navigation,
 * per-move engine facts and coach explanations already work here.
 */
export default function GamePage({ id }: { id: number }) {
  const [gameRecord, setGameRecord] = useState<GameRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [evals, setEvals] = useState<Record<string, EngineEvaluation>>({});
  const [flip, setFlip] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const engine = useEngine();

  const model = useChessGame();

  useEffect(() => {
    let cancelled = false;
    getGame(id)
      .then((record) => {
        if (cancelled) return;
        if (!record) {
          setMissing(true);
          return;
        }
        setGameRecord(record);
        model.load({
          sans: record.sanList,
          uci: record.uciList,
          headers: record.headers,
        });
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
     
  }, [id]);

  const recordEval = (evaluation: EngineEvaluation) => {
    setEvals((current) => ({ ...current, [evaluation.fen]: evaluation }));
  };

  const fenAfter = model.fens[Math.min(model.viewPly, model.fens.length - 1)] ?? model.fens[0] ?? "";
  const fenBefore = model.viewPly > 0 ? model.fens[model.viewPly - 1]! : fenAfter;

  // Auto-analyze viewed position (+ prior position) for coach context.
  useEffect(() => {
    if (!engine || !fenAfter) return;
    const needed: string[] = [];
    if (!evals[fenAfter]) needed.push(fenAfter);
    if (fenBefore !== fenAfter && !evals[fenBefore]) needed.push(fenBefore);
    if (needed.length === 0) return;
    const handles = needed.map((fen, index) =>
      engine.analyze({ fen, strength: "fast", priority: index === 0 ? 1 : 2 }),
    );
    for (const handle of handles) handle.promise.then(recordEval).catch(() => undefined);
    return () => {
      for (const handle of handles) handle.cancel();
    };
     
  }, [engine, fenAfter, fenBefore, evals]);

  const opening = useMemo(
    () => (gameRecord ? detectOpening(gameRecord.sanList) : null),
    [gameRecord],
  );

  const coachContext = useMemo(() => {
    if (!gameRecord) return null;
    return buildCoachContext({
      fenBefore,
      fenAfter,
      san: model.viewPly > 0 ? model.sans[model.viewPly - 1] : undefined,
      uci: model.viewPly > 0 ? model.uci[model.viewPly - 1] : undefined,
      evalBefore: evals[fenBefore] ?? null,
      evalAfter: evals[fenAfter] ?? null,
      ply: model.viewPly,
    });
  }, [gameRecord, fenBefore, fenAfter, model, evals]);

  if (missing) {
    return (
      <div className="empty-state">
        <div className="glyph">◌</div>
        <h3>Game not found</h3>
        <button className="btn" onClick={() => navigate("/games")}>
          Back to games
        </button>
      </div>
    );
  }

  if (!gameRecord) {
    return <div className="skeleton" style={{ height: 240 }} aria-label="Loading game" />;
  }

  const evalPoints = model.fens
    .map((fen, ply) => ({ fen, ply }))
    .map(({ fen, ply }) => {
      const evaluation = evals[fen];
      if (!evaluation) return null;
      return {
        ply,
        cp: evaluation.mateIn !== null && evaluation.mateIn !== 0
          ? Math.sign(evaluation.mateIn) * 1000
          : evaluation.scoreCp,
      };
    })
    .filter((p): p is { ply: number; cp: number } => p !== null);

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>
            {gameRecord.headers.white ?? "White"} — {gameRecord.headers.black ?? "Black"}
          </h1>
          <div className="small dim">
            {gameRecord.headers.date ?? ""}
            {gameRecord.headers.result ? ` · ${gameRecord.headers.result}` : ""}
            {opening ? ` · ${opening.eco} ${opening.name}` : ""}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn small ghost" onClick={() => setFlip((f) => !f)}>
            ⟲ flip
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (!window.confirm("Delete this game from your local database?")) return;
              void deleteGame(gameRecord.id!).then(() => navigate("/games"));
            }}
          >
            delete
          </button>
          <button className="btn small ghost" onClick={() => navigate("/games")}>
            ← games
          </button>
        </div>
      </div>

      <div className="pgn-board-layout">
        <div className="stack">
          <ChessBoard
            fen={model.fen}
            orientation={flip ? "black" : "white"}
            lastMove={model.lastMove}
            onMove={(from: Square, to: Square, promotion: PieceSymbol | null) => {
              const result = model.tryMove(from, to, promotion);
              if (!result) {
                setNotice("Browsing history — use ◀ to return before moving.");
                window.setTimeout(() => setNotice(null), 2200);
                return false;
              }
              setNotice("Move added (unsaved branch — re-import to persist).");
              window.setTimeout(() => setNotice(null), 2400);
              return true;
            }}
            interactive
          />
          <div className="btn-row">
            <button className="btn small ghost" onClick={() => model.go(0)} aria-label="First">
              ⏮
            </button>
            <button className="btn small ghost" onClick={() => model.go(model.viewPly - 1)} aria-label="Previous">
              ◀
            </button>
            <button className="btn small ghost" onClick={() => model.go(model.viewPly + 1)} aria-label="Next">
              ▶
            </button>
            <button
              className="btn small ghost"
              onClick={() => model.go(model.sans.length)}
              aria-label="Last"
            >
              ⏭
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>
              Evaluation
              <span className="small faint">{evalPoints.length} positions</span>
            </h2>
            <EvaluationGraph
              points={evalPoints}
              selectedPly={model.viewPly}
              onSelect={model.go}
            />
            <EnginePanel
              fen={model.fen}
              strength="fast"
              onEvaluation={recordEval}
              externalEval={evals[model.fen] ?? null}
            />
          </div>

          <div className="card">
            <h2>Moves</h2>
            <MoveList sans={model.sans} currentPly={model.viewPly} onSelect={model.go} />
          </div>

          <div className="card">
            <h2>Coach</h2>
            <CoachPanel
              context={coachContext}
              emptyHint="Navigate to a move to ask the coach."
            />
            <p className="faint small" style={{ marginTop: 8 }}>
              Full game review — accuracy, critical moments, "Why did I lose?" — arrives with
              the Phase 2 analysis pipeline.
            </p>
          </div>
        </div>
      </div>

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
