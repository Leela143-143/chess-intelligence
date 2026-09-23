import { useMemo, useState, type ReactNode } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import { formatEval } from "@/lib/chess/analysis";
import { applyUci } from "@/lib/chess/replay";
import type { EngineEvaluation } from "@/lib/engine/types";
import type { TrainingItem } from "@/lib/db/schema";
import type { SrsGrade } from "@/lib/training/engine";

/**
 * TrainingSession (brief §25, §32) — play the position, get scored, then get
 * told why. The player moves on a real board; the engine grades the move
 * against the solution and reports the cost of the attempt.
 */

export type TrainingSessionProps = {
  items: TrainingItem[];
  evaluate: (fen: string) => Promise<EngineEvaluation | null>;
  onGraded: (item: TrainingItem, grade: SrsGrade, moveUci: string) => void;
  onFinished?: () => void;
};

type Stage = "solve" | "grading" | "result";

export default function TrainingSession({
  items,
  evaluate,
  onGraded,
  onFinished,
}: TrainingSessionProps): ReactNode {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("solve");
  const [attempt, setAttempt] = useState<{ uci: string; san: string } | null>(null);
  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [score, setScore] = useState({ solved: 0, total: 0 });

  const item = items[index];
  const solutionUci = useMemo(() => item?.solutionUci[0] ?? null, [item]);

  if (!item) {
    return (
      <div className="stack">
        <p className="lede">
          {score.total > 0
            ? `Session complete — ${score.solved} of ${score.total} solved.`
            : "No training positions yet. Analyse a game and your own mistakes become the puzzles."}
        </p>
        <div className="btn-row">
          <button
            className="btn primary"
            onClick={() => {
              setIndex(0);
              setStage("solve");
              setAttempt(null);
              setEvaluation(null);
              setScore({ solved: 0, total: 0 });
            }}
          >
            Restart session
          </button>
          {onFinished && (
            <button className="btn ghost" onClick={onFinished}>
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  const correct = attempt !== null && solutionUci !== null && attempt.uci === solutionUci;

  const handleMove = (from: Square, to: Square, promotion: PieceSymbol | null) => {
    if (stage !== "solve") return false;
    let san = `${from}${to}`;
    try {
      const board = new Chess(item.fen);
      const played = board.move({ from, to, promotion: promotion ?? undefined });
      if (!played) return false;
      san = played.san;
    } catch {
      return false;
    }
    const uci = `${from}${to}${promotion ?? ""}`;
    setAttempt({ uci, san });
    setStage("grading");
    const fenAfter = applyUci(item.fen, uci);
    if (fenAfter) {
      void evaluate(fenAfter)
        .then(setEvaluation)
        .catch(() => setEvaluation(null))
        .finally(() => setStage("result"));
    } else {
      setStage("result");
    }
    return true;
  };

  const grade: SrsGrade = correct ? "good" : stage === "result" ? "fail" : "hard";

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <p className="eyebrow">
            Position {index + 1} / {items.length} · {item.theme}
          </p>
          <div className="row" style={{ gap: "var(--s-2)" }}>
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`chip ${i < item.difficulty ? "gold" : ""}`}
                style={{ padding: "1px 4px" }}
                aria-hidden="true"
              >
                ◆
              </span>
            ))}
            <span className="small faint">difficulty {item.difficulty}/5</span>
          </div>
        </div>
        <span className="chip">{item.source}</span>
      </div>

      <ChessBoard
        fen={item.fen}
        interactive={stage === "solve"}
        previousFen={item.fen}
        showCoords
        lastMove={null}
        onMove={handleMove}
      />

      {stage === "solve" && (
        <div className="row between wrap">
          <p className="small dim" style={{ margin: 0 }}>
            Your move. Play it on the board — the engine will score it.
          </p>
          <button className="btn small ghost" onClick={() => setStage("result")}>
            I don't know — show me
          </button>
        </div>
      )}

      {stage === "grading" && (
        <div className="working">
          <span className="bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          Scoring your move…
        </div>
      )}

      {stage === "result" && (
        <div className="why">
          <div className="why-item" data-src={correct ? "fact" : "engine"}>
            <span className={`src ${correct ? "src-fact" : "src-engine"}`}>
              {correct ? "Correct" : "Not the engine's move"}
            </span>
            <span className="why-text">
              {attempt ? (
                <>
                  You played <strong>{attempt.san}</strong>.
                </>
              ) : (
                <>You passed on this one.</>
              )}{" "}
              The solution was{" "}
              <strong>{item.solutionSan[0] ?? solutionUci ?? "—"}</strong>
              {item.solutionSan.length > 1 && <> {item.solutionSan.slice(1).join(" ")}</>}.
              {evaluation && (
                <>
                  {" "}
                  Your move leads to {formatEval(evaluation.scoreCp, evaluation.mateIn)}.
                </>
              )}
            </span>
          </div>

          <div className="why-item" data-src="coach">
            <span className="src src-coach">From your game</span>
            <span className="why-text">
              {item.explanation ??
                `This position comes from ${item.source}. You played ${
                  item.playedSan ?? "something else"
                } there.`}
            </span>
          </div>

          <div className="why-item" data-src="training">
            <span className="src src-training">Lesson</span>
            <span className="why-text">
              {item.lesson ?? `Theme: ${item.theme}. Look for the forcing moves first.`}
            </span>
          </div>

          <div className="row between wrap">
            <span className="small faint">
              Theme: {item.theme} · {correct ? "scheduled further out" : "comes back in ten minutes"}
            </span>
            <div className="btn-row">
              <button
                className="btn small ghost"
                onClick={() => onGraded(item, "hard", attempt?.uci ?? "")}
              >
                Too easy
              </button>
              <button
                className="btn primary small"
                onClick={() => {
                  onGraded(item, grade, attempt?.uci ?? "");
                  setScore((current) => ({
                    solved: current.solved + (correct ? 1 : 0),
                    total: current.total + 1,
                  }));
                  setIndex((current) => current + 1);
                  setStage("solve");
                  setAttempt(null);
                  setEvaluation(null);
                }}
              >
                {correct ? "Next position" : "Got it — next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
