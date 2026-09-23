import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type PieceSymbol, type Square } from "chess.js";
import ChessBoard, { type BoardArrow } from "@/components/ChessBoard";
import MoveTimeline from "@/components/MoveTimeline";
import CoachPanel from "@/components/CoachPanel";
import EnginePanel from "@/components/EnginePanel";
import { EvalBar } from "@/components/EvaluationGraph";
import { TheMoment, WhyPanel } from "@/components/moment";
import { useChessGame } from "@/lib/useChessGame";
import { useSettings } from "@/lib/settingsContext";
import { useEngine } from "@/lib/engineContext";
import { assessMove, evalTier, formatEval } from "@/lib/chess/analysis";
import { buildCoachContext } from "@/lib/coach/context";
import { isValidFen, importPgn } from "@/lib/chess/pgn";
import { detectOpening } from "@/lib/chess/openings";
import { sanLineToUci } from "@/lib/chess/replay";
import { DEMO_GAME } from "@/lib/demoGame";
import { navigate } from "@/lib/router";
import { pushToast } from "@/lib/toast";
import type { EngineEvaluation } from "@/lib/engine/types";
import type { KeyMoment } from "@/lib/chess/review";

/**
 * Analysis workspace (brief §16, §20, §21, §68).
 *
 * Desktop: a board column beside a sticky instrument column
 * (evaluation → timeline → why → advanced engine → coach).
 * Mobile: the same order, stacked, with the coach behind a sheet.
 *
 * The engine cache is keyed by FEN, so the coach, the eval bar, the why-panel
 * and the advanced readout can never disagree about a position.
 */

export default function BoardPage({ params }: { params?: URLSearchParams }): ReactNode {
  const game = useChessGame();
  const { settings } = useSettings();
  const engine = useEngine();

  const [flip, setFlip] = useState(settings.orientation === "black");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [fenInput, setFenInput] = useState("");
  const [pgnInput, setPgnInput] = useState("");
  const [ioOpen, setIoOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [momentPly, setMomentPly] = useState<number | null>(null);
  const [attempt, setAttempt] = useState<{ uci: string; san: string } | null>(null);

  /** Position evaluations keyed by FEN. */
  const [evals, setEvals] = useState<Record<string, EngineEvaluation>>({});
  const evalsRef = useRef(evals);
  evalsRef.current = evals;

  const recordEval = useCallback((evaluation: EngineEvaluation) => {
    setEvals((current) =>
      current[evaluation.fen] ? current : { ...current, [evaluation.fen]: evaluation },
    );
  }, []);

  const fenAfter = game.fens[Math.min(game.viewPly, game.fens.length - 1)] ?? game.fens[0]!;
  const fenBefore = game.viewPly > 0 ? game.fens[game.viewPly - 1]! : fenAfter;
  const evalAfter = evals[fenAfter] ?? null;
  const evalBefore = evals[fenBefore] ?? null;

  // Deep link: #/board?fen=…
  useEffect(() => {
    const fen = params?.get("fen");
    if (fen && isValidFen(fen)) {
      game.reset(fen);
      setEvals({});
    }
     
  }, []);

  // Auto-analyse the displayed position (and the one before the viewed move).
  useEffect(() => {
    if (!autoAnalyze || !engine) return;
    const needed: string[] = [];
    if (!evalsRef.current[fenAfter]) needed.push(fenAfter);
    if (fenBefore !== fenAfter && !evalsRef.current[fenBefore]) needed.push(fenBefore);
    if (needed.length === 0) return;
    const handles = needed.map((fen, index) =>
      engine.analyze({
        fen,
        strength: settings.analysisIntensity === "deep" ? "standard" : "fast",
        priority: index === 0 ? 1 : 2,
      }),
    );
    for (const handle of handles) handle.promise.then(recordEval).catch(() => undefined);
    return () => {
      for (const handle of handles) handle.cancel();
    };
  }, [autoAnalyze, engine, fenAfter, fenBefore, recordEval, settings.analysisIntensity]);

  /** Assessment of the move currently being viewed. */
  const assessment = useMemo(() => {
    if (game.viewPly === 0 || !evalBefore || !evalAfter) return null;
    const uci = game.uci[game.viewPly - 1];
    const san = game.sans[game.viewPly - 1];
    if (!uci || !san) return null;
    try {
      return assessMove({
        ply: game.viewPly,
        san,
        uci,
        fenBefore,
        fenAfter,
        evalBefore,
        evalAfter,
      });
    } catch {
      return null;
    }
  }, [game.viewPly, game.uci, game.sans, evalBefore, evalAfter, fenBefore, fenAfter]);

  const syntheticMoment: KeyMoment | null = useMemo(() => {
    if (!assessment) return null;
    if (assessment.cpLoss < 150) return null;
    return {
      ply: assessment.ply,
      kind: assessment.cpLoss >= 400 ? "material-loss" : "largest-swing",
      san: assessment.san,
      mover: assessment.mover,
      fenBefore,
      fenAfter,
      evalBeforeCp: assessment.evalBeforeCp,
      evalAfterCp: assessment.evalAfterCp,
      mateBefore: assessment.evalBeforeMate,
      mateAfter: assessment.evalAfterMate,
      cpLoss: assessment.cpLoss,
      bestUci: assessment.bestUci,
      bestSan: assessment.bestSan,
      classification: assessment.classification,
      phase: assessment.phase,
      motifs: assessment.motifs,
      allowedMotifs: assessment.allowedMotifs,
      explanation: `${assessment.san} costs ${(assessment.cpLoss / 100).toFixed(2)} pawns${
        assessment.bestSan ? `; the engine preferred ${assessment.bestSan}` : ""
      }.`,
      lesson: assessment.allowedMotifs[0]
        ? `Watch for ${assessment.allowedMotifs[0].replace(/-/g, " ")} in this kind of position.`
        : "Compare two or three candidate moves before committing.",
      deep: false,
    };
  }, [assessment, fenBefore, fenAfter]);

  const handleMove = useCallback(
    (from: Square, to: Square, promotion: PieceSymbol | null) => {
      const result = game.tryMove(from, to, promotion);
      if (!result) {
        pushToast("Illegal move, or you are browsing history.", "warn", "Return to the last move to play on.");
        return false;
      }
      // A move played while a moment is armed becomes the player's attempt.
      if (momentPly !== null) {
        setAttempt({ uci: result.uci, san: result.san });
      }
      return true;
    },
    [game, momentPly],
  );

  const opening = useMemo(() => {
    const match = detectOpening(game.sans);
    return match ? `${match.eco} · ${match.name}` : null;
  }, [game.sans]);

  const coachContext = useMemo(
    () =>
      buildCoachContext({
        fenBefore,
        fenAfter,
        ...(game.viewPly > 0 && game.sans[game.viewPly - 1]
          ? { san: game.sans[game.viewPly - 1], uci: game.uci[game.viewPly - 1] }
          : {}),
        evalBefore,
        evalAfter,
        ply: game.viewPly,
      }),
    [fenBefore, fenAfter, game.viewPly, game.sans, game.uci, evalBefore, evalAfter],
  );

  // Keyboard ply navigation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      if (event.key === "ArrowLeft") game.go(game.viewPly - 1);
      if (event.key === "ArrowRight") game.go(game.viewPly + 1);
      if (event.key === "ArrowUp") game.go(0);
      if (event.key === "ArrowDown") game.go(game.sans.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  const arrows: BoardArrow[] = useMemo(() => {
    if (!evalBefore?.bestMove) return [];
    return [
      {
        from: evalBefore.bestMove.slice(0, 2),
        to: evalBefore.bestMove.slice(2, 4),
        tone: "accent",
      },
    ];
  }, [evalBefore]);

  const cp = evalAfter?.scoreCp ?? 0;
  const mate = evalAfter?.mateIn ?? null;

  const loadPgn = () => {
    const result = importPgn(pgnInput);
    const first = result.games[0];
    if (!first) {
      pushToast("Could not read that PGN.", "error", result.errors[0]?.message);
      return;
    }
    game.load({ sans: first.sanList, uci: first.uciList, headers: first.headers });
    setEvals({});
    setPgnInput("");
    setIoOpen(false);
    pushToast(`Loaded ${first.sanList.length} plies`, "success");
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div className="page-head-titles">
          <p className="eyebrow">Workspace</p>
          <h1 className="display-m">
            {game.headers?.white && game.headers?.black
              ? `${game.headers.white} — ${game.headers.black}`
              : "Analysis board"}
          </h1>
          <p className="small faint">
            {opening ?? "Free analysis"}
            {game.sans.length > 0 && ` · ${game.sans.length} plies`}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn small ghost" onClick={() => setFlip((value) => !value)}>
            Flip
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              game.reset();
              setEvals({});
              setMomentPly(null);
            }}
          >
            Reset
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              const uci = sanLineToUci(
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                DEMO_GAME.sans,
              );
              game.load({ sans: DEMO_GAME.sans, uci });
              setEvals({});
              pushToast("Demo game loaded", "info", "Scholar's mate — find the blunder at move 3.");
            }}
          >
            Demo game
          </button>
          <button className="btn small" onClick={() => setIoOpen((open) => !open)}>
            Load PGN / FEN
          </button>
          <button className="btn small ghost" onClick={() => navigate("/games")}>
            Import
          </button>
        </div>
      </header>

      <div className="workspace">
        {/* ------------------------------------------------------- board */}
        <div className="stack">
          <div className="board-stage">
            <EvalBar cp={cp} mate={mate} stretch />
            <ChessBoard
              fen={fenAfter}
              orientation={flip ? "black" : "white"}
              onMove={handleMove}
              lastMove={game.lastMove}
              arrows={arrows}
              advantage={cp > 40 ? "white" : cp < -40 ? "black" : null}
              bracketSquares={
                momentPly !== null && game.viewPly === momentPly
                  ? [game.lastMove?.to ?? "e4"]
                  : undefined
              }
              interactive
            />
          </div>

          <div className="row between wrap">
            <div className="btn-row tight">
              <button className="btn icon small ghost" onClick={() => game.go(0)} aria-label="Start">
                ⏮
              </button>
              <button
                className="btn icon small ghost"
                onClick={() => game.go(game.viewPly - 1)}
                aria-label="Previous move"
              >
                ◀
              </button>
              <button
                className="btn icon small ghost"
                onClick={() => game.go(game.viewPly + 1)}
                aria-label="Next move"
              >
                ▶
              </button>
              <button
                className="btn icon small ghost"
                onClick={() => game.go(game.sans.length)}
                aria-label="Latest position"
              >
                ⏭
              </button>
              <span className="chip mono">
                {game.viewPly === 0
                  ? "start"
                  : `${Math.ceil(game.viewPly / 2)}${game.viewPly % 2 ? "." : "…"}`}
              </span>
            </div>
            <label className="row small dim" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(event) => setAutoAnalyze(event.target.checked)}
              />
              Evaluate every position
            </label>
          </div>

          {ioOpen && (
            <div className="panel stack">
              <div className="panel-head">
                <div>
                  <div className="panel-eyebrow">Import</div>
                  <div className="panel-title">Load a PGN or a FEN</div>
                </div>
                <button className="btn small ghost" onClick={() => setIoOpen(false)}>
                  Close
                </button>
              </div>
              <div className="field">
                <label htmlFor="pgn">PGN</label>
                <textarea
                  id="pgn"
                  value={pgnInput}
                  onChange={(event) => setPgnInput(event.target.value)}
                  placeholder={'[Event "…"]\n1. e4 e5 2. Nf3 Nc6 …'}
                  spellCheck={false}
                />
                <div className="btn-row">
                  <button className="btn primary small" onClick={loadPgn} disabled={!pgnInput.trim()}>
                    Load game
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="fen">FEN</label>
                <div className="row">
                  <input
                    id="fen"
                    type="text"
                    className="mono"
                    value={fenInput}
                    onChange={(event) => setFenInput(event.target.value)}
                    placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                  />
                  <button
                    className="btn small"
                    onClick={() => {
                      if (!isValidFen(fenInput.trim())) {
                        pushToast("That FEN is not valid.", "error");
                        return;
                      }
                      game.reset(fenInput.trim());
                      setEvals({});
                      setFenInput("");
                    }}
                  >
                    Load
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --------------------------------------------------- instruments */}
        <div className="workspace-side stack">
          <section className="panel">
            <div className="row between wrap">
              <div>
                <div className="panel-eyebrow">Evaluation</div>
                <div className="engine-eval">{evalAfter ? formatEval(cp, mate) : "…"}</div>
                <div className="small faint">
                  {evalAfter ? evalTier(cp, mate) : engine?.statusMessage ?? "engine starting"}
                </div>
              </div>
              <div className="stack tight" style={{ textAlign: "right" }}>
                <span className="chip steel">
                  {evalAfter?.bestMove ? `best ${evalAfter.bestMove}` : "searching"}
                </span>
                {evalAfter && <span className="small faint">depth {evalAfter.depth}</span>}
              </div>
            </div>
            {evalAfter && evalAfter.pv.length > 0 && (
              <p className="engine-line">{evalAfter.pv.slice(0, 10).join(" ")}</p>
            )}
          </section>

          {game.sans.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-eyebrow">Timeline</div>
                  <div className="panel-title">Moves</div>
                </div>
              </div>
              <MoveTimeline
                moves={[]}
                sans={game.sans}
                currentPly={game.viewPly}
                onSelect={game.go}
                showTrack={false}
              />
            </section>
          )}

          {assessment && (
            <section className="panel">
              <WhyPanel move={assessment} moments={[]} />
            </section>
          )}

          {syntheticMoment && (
            <TheMoment
              moment={syntheticMoment}
              index={0}
              total={1}
              onFocus={() => setMomentPly(syntheticMoment.ply)}
              armed={momentPly === syntheticMoment.ply}
              attempt={attempt}
              onAttemptHandled={() => setAttempt(null)}
              evaluate={
                engine
                  ? (fen) =>
                      engine
                        .analyze({ fen, strength: "fast", priority: 1 })
                        .promise.catch(() => null)
                  : undefined
              }
            />
          )}

          <details className="panel">
            <summary className="panel-title" style={{ cursor: "pointer" }}>
              Advanced engine detail
            </summary>
            <div style={{ marginTop: "var(--s-3)" }}>
              <EnginePanel
                fen={fenAfter}
                strength="fast"
                onEvaluation={recordEval}
                externalEval={evalAfter}
              />
            </div>
          </details>

          <details
            className="panel"
            open={coachOpen}
            onToggle={(event) => setCoachOpen((event.target as HTMLDetailsElement).open)}
          >
            <summary className="panel-title" style={{ cursor: "pointer" }}>
              Coach
            </summary>
            <div style={{ marginTop: "var(--s-3)" }}>
              <CoachPanel
                context={coachContext}
                emptyHint="Navigate to a move to ask the coach about it."
              />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
