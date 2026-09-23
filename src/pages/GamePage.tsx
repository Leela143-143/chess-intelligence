import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PieceSymbol, Square } from "chess.js";
import ChessBoard, { type BoardArrow } from "@/components/ChessBoard";
import MoveTimeline from "@/components/MoveTimeline";
import EvaluationGraph, { EvalBar } from "@/components/EvaluationGraph";
import { CriticalMoments, TheMoment, WhyPanel, useReplay } from "@/components/moment";
import { GameStoryView, ReplayBar } from "@/components/story";
import { useChessGame } from "@/lib/useChessGame";
import { useEngine } from "@/lib/engineContext";
import { useGameReview } from "@/lib/useGameReview";
import { usePlayer } from "@/lib/player/context";
import {
  deleteGame,
  getAnalysis,
  getGame,
  type GameAnalysis,
  type GameRecord,
} from "@/lib/db/schema";
import { detectOpening } from "@/lib/chess/openings";
import { formatEval, evalTier, plotCp } from "@/lib/chess/analysis";
import { outcomeOf } from "@/lib/player/stats";
import { navigate } from "@/lib/router";
import { pushToast } from "@/lib/toast";
import type { EvalPoint, KeyMoment, MoveAssessment } from "@/lib/chess/review";
import type { EngineEvaluation } from "@/lib/engine/types";

/**
 * Game review (brief §16–§24, §56).
 *
 * Desktop: board beside a sticky instrument column
 * (summary → graph → timeline → The Moment → critical moments → story → why).
 * Mobile: board → evaluation → timeline → moments → coach.
 *
 * Pressing Review runs the real two-stage pipeline; the progress line is
 * driven by the pipeline's own stage, never a fake timer.
 */

export default function GamePage({ id }: { id: number }): ReactNode {
  const engine = useEngine();
  const player = usePlayer();
  const model = useChessGame();

  const [record, setRecord] = useState<GameRecord | null>(null);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [missing, setMissing] = useState(false);
  const [flip, setFlip] = useState(false);
  const [momentIndex, setMomentIndex] = useState(0);
  const [momentArmed, setMomentArmed] = useState(false);
  const [attempt, setAttempt] = useState<{ uci: string; san: string } | null>(null);
  const [evals, setEvals] = useState<Record<string, EngineEvaluation>>({});
  const evalsRef = useRef(evals);
  evalsRef.current = evals;

  const review = useGameReview(record, (saved) => {
    setAnalysis(saved);
    void player.refresh();
    pushToast("Review complete", "success", `${saved.moments?.length ?? 0} key moments identified.`);
  });

  /* --------------------------------------------------------------- loading */
  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setAnalysis(null);
    setMissing(false);
    setMomentIndex(0);
    setEvals({});
    Promise.all([getGame(id), getAnalysis(id)])
      .then(([game, existing]) => {
        if (cancelled) return;
        if (!game) {
          setMissing(true);
          return;
        }
        setRecord(game);
        setAnalysis(existing ?? null);
        model.load({ sans: game.sanList, uci: game.uciList, headers: game.headers });
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
     
  }, [id]);

  const recordEval = useCallback((evaluation: EngineEvaluation) => {
    setEvals((current) =>
      current[evaluation.fen] ? current : { ...current, [evaluation.fen]: evaluation },
    );
  }, []);

  const fenAfter = model.fens[Math.min(model.viewPly, model.fens.length - 1)] ?? "";

  /** The reviewed move for the current ply (falls back to live evals). */
  const reviewMove: MoveAssessment | null = useMemo(() => {
    const fromReview = analysis?.moves?.[model.viewPly - 1];
    if (fromReview) return fromReview;
    return null;
  }, [analysis, model.viewPly]);

  // Live evaluation only when this game has no review yet.
  useEffect(() => {
    if (analysis || !engine || !fenAfter) return;
    if (evalsRef.current[fenAfter]) return;
    const handle = engine.analyze({ fen: fenAfter, strength: "fast", priority: 1 });
    handle.promise.then(recordEval).catch(() => undefined);
    return () => handle.cancel();
  }, [analysis, engine, fenAfter, recordEval]);

  const moments = analysis?.moments ?? [];
  const activeMoment: KeyMoment | null = moments.length > 0
    ? moments[Math.max(0, Math.min(momentIndex, moments.length - 1))] ?? null
    : null;

  const criticalPlies = useMemo(() => moments.map((moment) => moment.ply), [moments]);

  const evalPoints: EvalPoint[] = useMemo(() => {
    const moves = analysis?.moves ?? [];
    if (moves.length === 0) {
      return model.fens
        .map((fen, ply) => ({ point: evals[fen], ply }))
        .filter((entry): entry is { point: EngineEvaluation; ply: number } => Boolean(entry.point))
        .map((entry) => ({
          ply: entry.ply,
          cp: entry.point.mateIn !== null && entry.point.mateIn !== 0
            ? Math.sign(entry.point.mateIn) * 1000
            : entry.point.scoreCp,
          mate: entry.point.mateIn,
        }));
    }
    return [
      {
        ply: 0,
        cp: plotCp(moves[0]?.evalBeforeCp ?? 0, moves[0]?.evalBeforeMate ?? null),
        mate: moves[0]?.evalBeforeMate ?? null,
      },
      ...moves.map((move) => ({
        ply: move.ply,
        cp: plotCp(move.evalAfterCp, move.evalAfterMate),
        mate: move.evalAfterMate,
      })),
    ];
  }, [analysis, model.fens, evals]);

  const replay = useReplay({
    totalPlies: model.sans.length,
    decisionPlies: criticalPlies,
    onPly: model.go,
  });

  /* -- moment arming: the board sits *before* the moment so you can vote -- */

  const indexOfPly = useCallback(
    (ply: number) => moments.findIndex((entry) => entry.ply === ply),
    [moments],
  );

  const armMoment = useCallback(
    (moment: KeyMoment) => {
      setMomentIndex(indexOfPly(moment.ply));
      setMomentArmed(true);
      setAttempt(null);
      model.go(moment.ply - 1);
    },
    [indexOfPly, model],
  );

  const revealMoment = useCallback(
    (moment: KeyMoment) => {
      setMomentIndex(indexOfPly(moment.ply));
      setMomentArmed(false);
      setAttempt(null);
      model.go(moment.ply);
    },
    [indexOfPly, model],
  );

  useEffect(() => {
    if (!replay.state.atDecision) return;
    const index = indexOfPly(replay.state.ply);
    if (index >= 0) {
      setMomentIndex(index);
      setMomentArmed(true);
      setAttempt(null);
    }
  }, [replay.state.atDecision, replay.state.ply, indexOfPly]);

  const handleMove = useCallback(
    (from: Square, to: Square, promotion: PieceSymbol | null) => {
      const result = model.tryMove(from, to, promotion);
      if (!result) {
        pushToast("Browsing history — press ⏭ to return before moving.", "warn");
        return false;
      }
      if (momentArmed) {
        setAttempt({ uci: result.uci, san: result.san });
        return true;
      }
      return true;
    },
    [model, momentArmed],
  );

  // Keyboard ply navigation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable)
        return;
      if (event.key === "ArrowLeft") model.go(model.viewPly - 1);
      if (event.key === "ArrowRight") model.go(model.viewPly + 1);
      if (event.key === " ") {
        event.preventDefault();
        replay.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [model, replay]);

  /** Squares of the played move at the armed moment (corner brackets). */
  const bracketSquares: string[] | undefined = useMemo(() => {
    if (!momentArmed || !activeMoment) return undefined;
    const played = analysis?.moves?.[activeMoment.ply - 1]?.uci;
    if (!played) return undefined;
    return [played.slice(0, 2), played.slice(2, 4)];
  }, [momentArmed, activeMoment, analysis]);

  const arrows: BoardArrow[] = useMemo(() => {
    if (reviewMove?.bestUci) {
      return [
        {
          from: reviewMove.bestUci.slice(0, 2),
          to: reviewMove.bestUci.slice(2, 4),
          tone: reviewMove.cpLoss >= 150 ? "accent" : "steel",
        },
      ];
    }
    const live = evals[fenAfter]?.bestMove;
    if (live) return [{ from: live.slice(0, 2), to: live.slice(2, 4), tone: "accent" }];
    return [];
  }, [reviewMove, evals, fenAfter]);

  if (missing) {
    return (
      <div className="empty-state">
        <h3>That game is not in your database</h3>
        <p className="dim">It may have been deleted, or the link is out of date.</p>
        <button className="btn primary" onClick={() => navigate("/games")}>
          Back to games
        </button>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 320 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  const opening = analysis?.opening?.name ?? detectOpening(record.sanList)?.name;
  const colour = record.playerColor ?? analysis?.perspective ?? null;
  const outcome = outcomeOf(record.result, colour);
  const own = colour === "b" ? analysis?.blackAccuracy : analysis?.whiteAccuracy;
  const ownAcpl = colour === "b" ? analysis?.blackAcpl : analysis?.whiteAcpl;

  const cp = reviewMove
    ? reviewMove.evalAfterCp
    : evals[fenAfter]?.scoreCp ?? 0;
  const mate = reviewMove ? reviewMove.evalAfterMate : evals[fenAfter]?.mateIn ?? null;

  const running = review.state.status === "running";
  const progress = review.state.status === "running" ? review.state.progress : null;

  return (
    <div className="stack">
      <header className="page-head">
        <div className="page-head-titles">
          <p className="eyebrow">
            {outcome === "unknown" ? "Review" : outcome} ·{" "}
            {record.headers.date ?? "date unknown"}
          </p>
          <h1 className="display-m">
            {record.headers.white ?? "White"} — {record.headers.black ?? "Black"}
          </h1>
          <p className="small faint">
            {record.result}
            {opening ? ` · ${opening}` : ""}
            {record.headers.timeControl ? ` · ${record.headers.timeControl}` : ""}
            {record.headers.termination ? ` · ${record.headers.termination}` : ""}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn small ghost" onClick={() => setFlip((value) => !value)}>
            Flip
          </button>
          {analysis ? (
            <button className="btn small ghost" onClick={() => void review.start()}>
              Re-review
            </button>
          ) : (
            <button className="btn primary small" onClick={() => void review.start()} disabled={!engine || running}>
              {running ? "Reviewing…" : "Review this game"}
            </button>
          )}
          <button
            className="btn small danger"
            onClick={() => {
              if (!window.confirm("Delete this game and its review from this device?")) return;
              void deleteGame(record.id!).then(() => {
                void player.refresh();
                pushToast("Game deleted", "info");
                navigate("/games");
              });
            }}
          >
            Delete
          </button>
          <button className="btn small ghost" onClick={() => navigate("/games")}>
            ← Games
          </button>
        </div>
      </header>

      {progress && (
        <section className="panel stack tight" aria-live="polite">
          <div className="working">
            <span className="bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            {progress.text}
            {progress.stage === "shallow" && progress.totalPlies
              ? ` · position ${progress.ply ?? 0} / ${progress.totalPlies}`
              : ""}
            {progress.stage === "deep" && progress.totalPlies
              ? ` · moment ${progress.ply ?? 0} / ${progress.totalPlies}`
              : ""}
          </div>
          <div className="progress thick">
            <i style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          </div>
          <div className="row between wrap">
            <span className="small faint">{progress.detail ?? "local analysis"}</span>
            <button className="btn small ghost" onClick={review.cancel}>
              Stop
            </button>
          </div>
        </section>
      )}

      {review.state.status === "error" && (
        <section className="panel">
          <p className="small" style={{ color: "var(--neg)" }}>
            Review failed: {review.state.message}
          </p>
        </section>
      )}

      <div className="workspace">
        {/* ---------------------------------------------------------- board */}
        <div className="stack">
          <div className="board-stage">
            <EvalBar cp={cp} mate={mate} stretch />
            <ChessBoard
              fen={fenAfter}
              orientation={flip ? "black" : "white"}
              lastMove={model.lastMove}
              onMove={handleMove}
              arrows={arrows}
              advantage={cp > 40 ? "white" : cp < -40 ? "black" : null}
              bracketSquares={bracketSquares}
              previousFen={model.viewPly > 0 ? model.fens[model.viewPly - 1] ?? null : null}
              interactive
            />
          </div>

          <div className="row between wrap">
            <div className="btn-row tight">
              <button className="btn icon small ghost" onClick={() => model.go(0)} aria-label="Start">
                ⏮
              </button>
              <button
                className="btn icon small ghost"
                onClick={() => model.go(model.viewPly - 1)}
                aria-label="Previous move"
              >
                ◀
              </button>
              <button
                className="btn icon small ghost"
                onClick={() => model.go(model.viewPly + 1)}
                aria-label="Next move"
              >
                ▶
              </button>
              <button
                className="btn icon small ghost"
                onClick={() => model.go(model.sans.length)}
                aria-label="Latest position"
              >
                ⏭
              </button>
              <span className="chip mono">
                {model.viewPly === 0
                  ? "start"
                  : `${Math.ceil(model.viewPly / 2)}${model.viewPly % 2 ? "." : "…"}`}
              </span>
            </div>
            <span className="small faint">
              {moments.length > 0
                ? `${moments.length} key moment${moments.length === 1 ? "" : "s"} · ← → to scrub · space to replay`
                : "← → to scrub"}
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------- instruments */}
        <div className="workspace-side stack">
          {analysis ? (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="panel-eyebrow">Review</div>
                    <div className="panel-title">
                      {analysis.strength} sweep → {analysis.deepStrength ?? "deep"} verification
                    </div>
                  </div>
                  <span className="chip green">reviewed</span>
                </div>
                <div className="grid cols-2">
                  <div className="tile">
                    <span className="stat-label">Your accuracy</span>
                    <span className="stat-value num">{own !== undefined ? `${own}%` : "—"}</span>
                    <span className="stat-sub">ACPL {ownAcpl ?? "—"}</span>
                  </div>
                  <div className="tile">
                    <span className="stat-label">Opponent</span>
                    <span className="stat-value num">
                      {colour === "b" ? analysis.whiteAccuracy : analysis.blackAccuracy}%
                    </span>
                    <span className="stat-sub">
                      ACPL {colour === "b" ? analysis.whiteAcpl : analysis.blackAcpl}
                    </span>
                  </div>
                </div>
                <div className="row wrap" style={{ marginTop: "var(--s-3)" }}>
                  <span className="chip">
                    {analysis.classifications.filter((c) => c === "blunder").length} blunders
                  </span>
                  <span className="chip">
                    {analysis.classifications.filter((c) => c === "mistake").length} mistakes
                  </span>
                  <span className="chip">
                    {analysis.classifications.filter((c) => c === "inaccuracy").length} inaccuracies
                  </span>
                  {analysis.phaseAcpl && (
                    <span className="chip steel">
                      endgame ACPL {colour === "b" ? analysis.phaseAcpl.b.endgame : analysis.phaseAcpl.w.endgame}
                    </span>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="panel-eyebrow">Evaluation</div>
                    <div className="panel-title">
                      {formatEval(cp, mate)} — {evalTier(cp, mate)}
                    </div>
                  </div>
                  {moments.length > 0 && <span className="chip gold">{moments.length} moments</span>}
                </div>
                <EvaluationGraph
                  points={evalPoints}
                  moves={analysis.moves ?? []}
                  moments={moments}
                  selectedPly={model.viewPly}
                  onSelect={model.go}
                />
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="panel-eyebrow">Timeline</div>
                    <div className="panel-title">Every move, graded</div>
                  </div>
                </div>
                <MoveTimeline
                  moves={analysis.moves ?? []}
                  currentPly={model.viewPly}
                  onSelect={model.go}
                  criticalPlies={criticalPlies}
                />
              </section>

              {activeMoment && (
                <TheMoment
                  moment={activeMoment}
                  index={momentIndex}
                  total={moments.length}
                  onPrev={() => armMoment(moments[Math.max(0, momentIndex - 1)]!)}
                  onNext={() => armMoment(moments[Math.min(moments.length - 1, momentIndex + 1)]!)}
                  onFocus={() => armMoment(activeMoment)}
                  armed={momentArmed}
                  attempt={attempt}
                  onAttemptHandled={() => {
                    setAttempt(null);
                    if (activeMoment) revealMoment(activeMoment);
                  }}
                  evaluate={
                    engine
                      ? (fen) =>
                          engine.analyze({ fen, strength: "fast", priority: 1 }).promise.catch(() => null)
                      : undefined
                  }
                />
              )}

              {moments.length > 0 && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-eyebrow">Moments</div>
                      <div className="panel-title">Ranked by cost</div>
                    </div>
                  </div>
                  <CriticalMoments
                    moments={moments}
                    activePly={activeMoment?.ply}
                    onSelect={armMoment}
                  />
                </section>
              )}

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="panel-eyebrow">Replay</div>
                    <div className="panel-title">Play the game back</div>
                  </div>
                </div>
                <ReplayBar
                  state={replay.state}
                  totalPlies={model.sans.length}
                  onToggle={replay.toggle}
                  onSpeed={replay.setSpeed}
                  onStep={replay.step}
                  onAnswer={() => activeMoment && armMoment(activeMoment)}
                />
              </section>

              {reviewMove && (
                <section className="panel">
                  <WhyPanel
                    move={reviewMove}
                    moments={moments}
                    onJump={(ply) => {
                      const index = indexOfPly(ply);
                      if (index >= 0) armMoment(moments[index]!);
                    }}
                  />
                </section>
              )}

              {analysis.story && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-eyebrow">Story</div>
                      <div className="panel-title">{analysis.story.verdict}</div>
                    </div>
                  </div>
                  <GameStoryView story={analysis.story} onJump={model.go} />
                </section>
              )}
            </>
          ) : (
            <section className="panel stack">
              <div>
                <div className="panel-eyebrow">Not reviewed yet</div>
                <div className="panel-title">Run the two-stage review</div>
              </div>
              <p className="prose small">
                Stage one evaluates every position in this game. Stage two re-searches only the
                positions where the evaluation swung, then explains each one. A short game takes
                a few seconds; nothing is uploaded.
              </p>
              <div className="btn-row">
                <button
                  className="btn primary"
                  onClick={() => void review.start()}
                  disabled={!engine || running}
                >
                  {running ? "Reviewing…" : "Review this game"}
                </button>
                <span className="chip">{engine?.deviceClass ?? "engine"}</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

