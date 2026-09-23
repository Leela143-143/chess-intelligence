import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { formatEval } from "@/lib/chess/analysis";
import { momentRole } from "@/lib/chess/story";
import { applyUci, uciToSan } from "@/lib/chess/replay";
import { detectTacticsAfterMove } from "@/lib/chess/tactics";
import { detectPhase } from "@/lib/chess/phase";
import { classifyMove } from "@/lib/chess/classification";
import type { KeyMoment, MoveAssessment } from "@/lib/chess/review";
import type { EngineEvaluation } from "@/lib/engine/types";
import { MiniBoard } from "@/components/viz";

/**
 * The Moment, Critical Moments, the WHY panel and the replay controller
 * (brief §18, §19, §22–§24, §56).
 *
 * Every sentence is assembled from engine facts and deterministic analysis.
 * "What would you play?" scores the player's *own* attempt against the
 * engine's answer, which is what turns a review into a lesson.
 */

function plyLabel(ply: number, san: string): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "…"} ${san}`;
}

/* -------------------------------------------------------- critical moments */

export function CriticalMoments({
  moments,
  activePly,
  onSelect,
}: {
  moments: KeyMoment[];
  activePly?: number;
  onSelect: (moment: KeyMoment) => void;
}): ReactNode {
  if (moments.length === 0) {
    return (
      <p className="faint small">
        No critical moments — this game never swung by more than 1.5 pawns.
      </p>
    );
  }

  return (
    <div className="scroll-x hide-scroll" role="list" aria-label="Critical moments">
      {moments.map((moment, index) => (
        <button
          key={`${moment.ply}-${index}`}
          type="button"
          role="listitem"
          className="moment-card"
          data-active={activePly === moment.ply ? "1" : undefined}
          onClick={() => onSelect(moment)}
        >
          <span className="idx">Moment {String(index + 1).padStart(2, "0")}</span>
          <span className="board-thumb">
            <MiniBoard fen={moment.fenBefore} size={150} label={`Position before ${moment.san}`} />
          </span>
          <span className="mv">{plyLabel(moment.ply, moment.san)}</span>
          <span className="meta">
            {momentRole(moment)} · {moment.mover === "w" ? "White" : "Black"} moved
          </span>
          <span className="small faint" style={{ textAlign: "left" }}>
            {moment.explanation}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- the moment */

export type MomentAttempt = { uci: string; san: string };

export type MomentStageProps = {
  moment: KeyMoment;
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  /** Jump the board to this moment's position. */
  onFocus: () => void;
  /** Evaluate a position with the engine, for the player's own attempt. */
  evaluate?: (fen: string) => Promise<EngineEvaluation | null>;
  /** A move the player just played on the board while predicting. */
  attempt?: MomentAttempt | null;
  /** Called after an attempt has been scored, so the host can clear it. */
  onAttemptHandled?: () => void;
  /** True when the board is showing this moment's position. */
  armed?: boolean;
};

export function TheMoment({
  moment,
  index,
  total,
  onPrev,
  onNext,
  onFocus,
  evaluate,
  attempt,
  onAttemptHandled,
  armed = false,
}: MomentStageProps): ReactNode {
  const [phase, setPhase] = useState<"predict" | "thinking" | "reveal">("predict");
  const [result, setResult] = useState<{ san: string; evaluation: EngineEvaluation | null } | null>(
    null,
  );

  // Reset when the moment changes.
  useEffect(() => {
    setPhase("predict");
    setResult(null);
  }, [moment.ply]);

  // Score a move the player made on the board.
  useEffect(() => {
    if (!attempt || phase !== "predict") return;
    let cancelled = false;
    setPhase("thinking");
    const run = async () => {
      let evaluation: EngineEvaluation | null = null;
      if (evaluate) {
        const fen = applyUci(moment.fenBefore, attempt.uci);
        if (fen) {
          evaluation = await evaluate(fen).catch(() => null);
        }
      }
      if (cancelled) return;
      setResult({ san: attempt.san, evaluation });
      setPhase("reveal");
      onAttemptHandled?.();
    };
    void run();
    return () => {
      cancelled = true;
    };
     
  }, [attempt?.uci, moment.ply]);

  const isError = moment.cpLoss >= 150;
  const bestSan = moment.bestUci ? uciToSan(moment.fenBefore, moment.bestUci) : null;
  const matchesEngine = Boolean(result && bestSan && result.san === bestSan);

  return (
    <section className="moment" data-moment-ply={moment.ply}>
      <div className="moment-hero">
        <div className="row between wrap">
          <span className="moment-kicker">
            The moment · {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <div className="btn-row tight">
            <button className="btn icon small ghost" onClick={onPrev} aria-label="Previous moment">
              ◀
            </button>
            <button className="btn icon small ghost" onClick={onNext} aria-label="Next moment">
              ▶
            </button>
            <button className="btn small ghost" onClick={onFocus}>
              Show on board
            </button>
          </div>
        </div>

        <h3 className="display-m" style={{ margin: 0 }}>
          {isError ? "This changed the game." : "This is where the game turned."}
        </h3>

        <div className="moment-swing">
          <span className="eyebrow">Evaluation</span>
          <span className="moment-eval">
            {formatEval(moment.evalBeforeCp, moment.mateBefore)}
            <span className="arrow">→</span>
            <span className={isError ? "bad" : ""}>
              {formatEval(moment.evalAfterCp, moment.mateAfter)}
            </span>
          </span>
          <span className="chip gold">{momentRole(moment)}</span>
          <span className="chip">{moment.phase}</span>
          {moment.deep && <span className="chip steel">verified deep</span>}
        </div>

        <div className="row wrap" style={{ gap: "var(--s-3)" }}>
          <div className="moment-choice">
            <span className="c-label">You played</span>
            <span className="c-move">{plyLabel(moment.ply, moment.san)}</span>
            <span className="small faint">−{(moment.cpLoss / 100).toFixed(2)} pawns</span>
          </div>
          <div className="moment-choice">
            <span className="c-label">Engine move</span>
            <span className="c-move">{bestSan ?? moment.bestUci ?? "—"}</span>
            <span className="small faint">
              {moment.bestChildCp !== undefined && moment.bestChildCp !== null
                ? `reaches ${formatEval(moment.bestChildCp, null)}`
                : "best continuation"}
            </span>
          </div>
        </div>

        <p className="lede" style={{ fontSize: "1rem", margin: 0 }}>
          {moment.explanation}
        </p>

        {phase === "predict" ? (
          <div className="row between wrap" style={{ gap: "var(--s-3)" }}>
            <p className="small dim" style={{ margin: 0, maxWidth: "46ch" }}>
              {armed
                ? "Play what you think was best on the board, or reveal the engine's answer."
                : "Press “Show on board”, play what you think was best, or reveal the engine's answer."}
            </p>
            <div className="btn-row">
              <button className="btn primary small" onClick={() => setPhase("reveal")}>
                Reveal the answer
              </button>
            </div>
          </div>
        ) : (
          <div className="why">
            {phase === "thinking" && (
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
            <div className="why-item" data-src="engine">
              <span className="src src-engine">Engine</span>
              <span className="why-text">
                Stockfish searched the position before the move and again after it
                {moment.deep ? " at the deep strength" : ""}. The evaluation moved{" "}
                <strong>
                  {formatEval(moment.evalBeforeCp, moment.mateBefore)} →{" "}
                  {formatEval(moment.evalAfterCp, moment.mateAfter)}
                </strong>
                .
              </span>
            </div>
            {result && (
              <div className="why-item" data-src={matchesEngine ? "fact" : "engine"}>
                <span className={`src ${matchesEngine ? "src-fact" : "src-engine"}`}>
                  {matchesEngine ? "Correct" : "Your attempt"}
                </span>
                <span className="why-text">
                  You played <strong>{result.san}</strong>.{" "}
                  {matchesEngine
                    ? "That is exactly the engine's choice."
                    : bestSan
                      ? `The engine's choice was ${bestSan}.`
                      : "The engine's choice was a different move."}
                  {result.evaluation && (
                    <>
                      {" "}
                      Your move leads to{" "}
                      <strong>
                        {formatEval(result.evaluation.scoreCp, result.evaluation.mateIn)}
                      </strong>
                      .
                    </>
                  )}
                </span>
              </div>
            )}
            <div className="why-item" data-src="training">
              <span className="src src-training">Training</span>
              <span className="why-text">{moment.lesson}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- why panel */

export function WhyPanel({
  move,
  moments,
  onJump,
}: {
  move: MoveAssessment;
  moments: KeyMoment[];
  onJump?: (ply: number) => void;
}): ReactNode {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => setRevealed(false), [move.ply]);

  const tactics = (() => {
    try {
      return detectTacticsAfterMove(move.fenBefore, move.uci);
    } catch {
      return [];
    }
  })();

  const phase = (() => {
    try {
      return detectPhase(move.fenBefore, move.ply - 1);
    } catch {
      return move.phase;
    }
  })();

  const bestSan = move.bestUci ? uciToSan(move.fenBefore, move.bestUci) : null;
  const refined = (() => {
    try {
      return classifyMove({
        playedUci: move.uci,
        bestUci: move.bestUci,
        evalBeforeCp: move.evalBeforeCp,
        evalBeforeMate: move.evalBeforeMate,
        evalAfterCp: move.evalAfterCp,
        evalAfterMate: move.evalAfterMate,
        mover: move.mover,
        legalMoveCount: new Chess(move.fenBefore).moves().length,
      });
    } catch {
      return null;
    }
  })();

  const relatedMoment = moments.find((moment) => moment.ply === move.ply);

  return (
    <div className="why">
      <div className="row between wrap">
        <div>
          <span className="eyebrow">Why?</span>
          <div className="panel-title">{plyLabel(move.ply, move.san)}</div>
        </div>
        <span className="chip">{move.classification}</span>
      </div>

      <div className="why-item" data-src="engine">
        <span className="src src-engine">Engine fact</span>
        <span className="why-text">
          Before: <strong>{formatEval(move.evalBeforeCp, move.evalBeforeMate)}</strong> · after:{" "}
          <strong>{formatEval(move.evalAfterCp, move.evalAfterMate)}</strong>
          {bestSan && (
            <>
              {" "}
              · engine move: <strong>{bestSan}</strong>
            </>
          )}
          {refined && <> · {refined.cpLoss} cp lost</>}
        </span>
      </div>

      {tactics.length > 0 && (
        <div className="why-item" data-src="fact">
          <span className="src src-fact">Chess concept</span>
          <span className="why-text">
            This move created {tactics.map((tactic) => tactic.theme.replace(/-/g, " ")).join(", ")}.{" "}
            {tactics[0]?.description}
          </span>
        </div>
      )}

      {move.allowedMotifs.length > 0 && (
        <div className="why-item" data-src="engine">
          <span className="src src-engine">What it allowed</span>
          <span className="why-text">
            The reply available to your opponent creates{" "}
            <strong>{move.allowedMotifs.map((motif) => motif.replace(/-/g, " ")).join(", ")}</strong>.
          </span>
        </div>
      )}

      {move.allowedCheck && (
        <div className="why-item" data-src="training">
          <span className="src src-training">King safety</span>
          <span className="why-text">
            After this move your opponent has a check available — a reliable sign that the king or
            the centre is not settled.
          </span>
        </div>
      )}

      <div className="why-item" data-src="coach">
        <span className="src src-coach">Coach insight</span>
        <span className="why-text">
          {!revealed
            ? "Look at the position once more before reading the explanation."
            : move.classification === "best" || move.classification === "excellent"
              ? `A strong ${phase} move — the engine agrees, and it kept ${formatEval(move.evalAfterCp, move.evalAfterMate)}.`
              : `This ${phase} move cost ${(move.cpLoss / 100).toFixed(2)} pawns.${
                  bestSan
                    ? ` ${bestSan} kept the evaluation at ${formatEval(move.evalBeforeCp, move.evalBeforeMate)}.`
                    : ""
                }`}
        </span>
      </div>

      <div className="btn-row">
        {!revealed ? (
          <button className="btn primary small" onClick={() => setRevealed(true)}>
            Explain it to me
          </button>
        ) : (
          <button className="btn small ghost" onClick={() => setRevealed(false)}>
            Hide explanation
          </button>
        )}
        {relatedMoment && onJump && (
          <button className="btn small ghost" onClick={() => onJump(relatedMoment.ply)}>
            Open as The Moment
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- replay */

export type ReplayState = {
  playing: boolean;
  speed: number;
  ply: number;
  atDecision: boolean;
};

/**
 * Cinematic replay (brief §23). The host page owns the board; this hook owns
 * the clock and pauses on decision points so the player can answer
 * "what would you play?" before the game continues.
 */
export function useReplay(args: {
  totalPlies: number;
  decisionPlies: number[];
  onPly: (ply: number) => void;
  startPly?: number;
}): {
  state: ReplayState;
  setSpeed: (speed: number) => void;
  toggle: () => void;
  stop: () => void;
  resume: () => void;
  /** Step the replay clock manually (pauses playback). */
  step: (delta: number) => void;
} {
  const { totalPlies, decisionPlies, onPly, startPly = 0 } = args;
  const [state, setState] = useState<ReplayState>({
    playing: false,
    speed: 1,
    ply: startPly,
    atDecision: false,
  });
  const plyRef = useRef(startPly);
  const decisionsRef = useRef(decisionPlies);
  decisionsRef.current = decisionPlies;
  const onPlyRef = useRef(onPly);
  onPlyRef.current = onPly;

  useEffect(() => {
    if (!state.playing) return;
    const delay = Math.max(240, 900 / state.speed);
    const timer = window.setTimeout(() => {
      const next = plyRef.current + 1;
      if (next > totalPlies) {
        setState((current) => ({ ...current, playing: false }));
        return;
      }
      plyRef.current = next;
      onPlyRef.current(next);
      const atDecision = decisionsRef.current.includes(next);
      setState((current) => ({ ...current, ply: next, atDecision, playing: !atDecision }));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state.playing, state.speed, state.ply, totalPlies]);

  return {
    state,
    setSpeed: (speed) => setState((current) => ({ ...current, speed })),
    toggle: () => {
      if (plyRef.current >= totalPlies) {
        plyRef.current = startPly;
        onPlyRef.current(startPly);
      }
      setState((current) => ({ ...current, playing: !current.playing, atDecision: false }));
    },
    stop: () => setState((current) => ({ ...current, playing: false })),
    resume: () => setState((current) => ({ ...current, playing: true, atDecision: false })),
    step: (delta: number) => {
      const next = plyRef.current + delta;
      if (next > 0 && next < totalPlies) {
        plyRef.current = next;
        onPlyRef.current(next);
        setState((current) => ({ ...current, playing: false, atDecision: false, ply: next }));
      }
    },
  };
}
