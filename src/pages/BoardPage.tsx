import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChessBoard from "@/components/ChessBoard";
import MoveList from "@/components/MoveList";
import EnginePanel from "@/components/EnginePanel";
import CoachPanel from "@/components/CoachPanel";
import BottomSheet from "@/components/BottomSheet";
import { useChessGame } from "@/lib/useChessGame";
import { useSettings } from "@/lib/settingsContext";
import { useEngine } from "@/lib/engineContext";
import { buildCoachContext } from "@/lib/coach/context";
import { isValidFen, importPgn } from "@/lib/chess/pgn";
import { detectOpening } from "@/lib/chess/openings";
import type { EngineEvaluation } from "@/lib/engine/types";
import { navigate } from "@/lib/router";
import type { PieceSymbol, Square } from "chess.js";

/**
 * Analysis board (Phase 1 core, spec §56–62).
 * Mobile order: board → evaluation → moves → coach (bottom sheet available).
 *
 * Auto-analysis keeps cached evaluations keyed by FEN so the coach always
 * has `evaluationBefore` + `evaluationAfter` for the viewed move.
 */
export default function BoardPage() {
  const game = useChessGame();
  const { settings } = useSettings();
  const engine = useEngine();
  const [fenInput, setFenInput] = useState("");
  const [pgnOpen, setPgnOpen] = useState(false);
  const [pgnInput, setPgnInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [coachSheet, setCoachSheet] = useState(false);
  const [flip, setFlip] = useState(settings.orientation === "black");
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  /** Cached evaluations keyed by FEN (position after that FEN applies). */
  const [evals, setEvals] = useState<Record<string, EngineEvaluation>>({});
  const evalsRef = useRef(evals);
  evalsRef.current = evals;

  const recordEval = useCallback((evaluation: EngineEvaluation) => {
    setEvals((current) => ({ ...current, [evaluation.fen]: evaluation }));
  }, []);

  const fenAfter = game.fens[Math.min(game.viewPly, game.fens.length - 1)] ?? game.fens[0]!;
  const fenBefore = game.viewPly > 0 ? game.fens[game.viewPly - 1]! : fenAfter;

  // Auto-analyze viewed position + the position before the viewed move.
  useEffect(() => {
    if (!autoAnalyze || !engine) return;
    const needed: string[] = [];
    if (!evalsRef.current[fenAfter]) needed.push(fenAfter);
    if (fenBefore !== fenAfter && !evalsRef.current[fenBefore]) needed.push(fenBefore);
    if (needed.length === 0) return;

    const handles = needed.map((fen, index) =>
      engine.analyze({
        fen,
        strength: "fast",
        priority: index === 0 ? 1 : 2,
      }),
    );
    for (const handle of handles) {
      handle.promise.then(recordEval).catch(() => undefined);
    }
    return () => {
      for (const handle of handles) handle.cancel();
    };
  }, [autoAnalyze, engine, fenAfter, fenBefore, recordEval, evals]);

  const handleMove = useCallback(
    (from: Square, to: Square, promotion: PieceSymbol | null) => {
      const result = game.tryMove(from, to, promotion);
      if (!result) {
        setNotice(
          "Illegal move — or you're browsing history (return to the last move to play).",
        );
        window.setTimeout(() => setNotice(null), 2200);
        return false;
      }
      return true;
    },
    [game],
  );

  const loadFen = () => {
    const candidate = fenInput.trim();
    if (!isValidFen(candidate)) {
      setNotice("Invalid FEN.");
      window.setTimeout(() => setNotice(null), 2200);
      return;
    }
    game.reset(candidate);
    setEvals({});
    setFenInput("");
    setNotice("Position loaded.");
    window.setTimeout(() => setNotice(null), 1600);
  };

  const loadPgn = () => {
    const result = importPgn(pgnInput);
    const first = result.games[0];
    if (!first) {
      setNotice(result.errors[0]?.message ?? "Could not parse PGN.");
      window.setTimeout(() => setNotice(null), 2400);
      return;
    }
    game.load({ sans: first.sanList, uci: first.uciList, headers: first.headers });
    setEvals({});
    setPgnInput("");
    setPgnOpen(false);
    setNotice(`Loaded ${first.sanList.length} plies.`);
    window.setTimeout(() => setNotice(null), 2000);
  };

  const opening = useMemo(() => {
    const match = detectOpening(game.sans);
    return match
      ? `${match.eco} · ${match.name}${match.variation ? ` — ${match.variation}` : ""}`
      : null;
  }, [game.sans]);

  const coachContext = useMemo(
    () =>
      buildCoachContext({
        fenBefore,
        fenAfter,
        san: game.viewPly > 0 ? game.sans[game.viewPly - 1] : undefined,
        uci: game.viewPly > 0 ? game.uci[game.viewPly - 1] : undefined,
        evalBefore: evals[fenBefore] ?? null,
        evalAfter: evals[fenAfter] ?? null,
        ply: game.viewPly,
      }),
    [fenBefore, fenAfter, game, evals],
  );

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "ArrowLeft") game.go(game.viewPly - 1);
      if (event.key === "ArrowRight") game.go(game.viewPly + 1);
      if (event.key === "ArrowUp") game.go(0);
      if (event.key === "ArrowDown") game.go(game.sans.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  const orientation = flip ? "black" : "white";

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Analysis board</h1>
        <div className="btn-row">
          <button className="btn small ghost" onClick={() => setFlip((f) => !f)} title="Flip board">
            ⟲ flip
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              game.reset();
              setEvals({});
            }}
          >
            reset
          </button>
          <button className="btn small ghost" onClick={() => setPgnOpen((o) => !o)}>
            PGN
          </button>
          <button className="btn small ghost" onClick={() => navigate("/games")}>
            import
          </button>
        </div>
      </div>

      {opening && <div className="chip gold">{opening}</div>}

      <div className="pgn-board-layout">
        <div className="stack">
          <ChessBoard
            fen={game.fen}
            orientation={orientation}
            onMove={handleMove}
            lastMove={game.lastMove}
            interactive
          />

          <div className="row between wrap small">
            <div className="btn-row">
              <button className="btn small ghost" onClick={() => game.go(0)} aria-label="First position">
                ⏮
              </button>
              <button
                className="btn small ghost"
                onClick={() => game.go(game.viewPly - 1)}
                aria-label="Previous move"
              >
                ◀
              </button>
              <button
                className="btn small ghost"
                onClick={() => game.go(game.viewPly + 1)}
                aria-label="Next move"
              >
                ▶
              </button>
              <button
                className="btn small ghost"
                onClick={() => game.go(game.sans.length)}
                aria-label="Latest position"
              >
                ⏭
              </button>
            </div>
            <label className="row small dim" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(event) => setAutoAnalyze(event.target.checked)}
                style={{ width: 16, minHeight: 16 }}
              />
              auto-analyze (fast)
            </label>
          </div>

          {pgnOpen && (
            <div className="card stack">
              <h3>Load PGN</h3>
              <textarea
                value={pgnInput}
                onChange={(event) => setPgnInput(event.target.value)}
                placeholder={'[Event "…"]\n1. e4 e5 2. Nf3 Nc6 …'}
                aria-label="PGN text"
              />
              <div className="btn-row">
                <button className="btn small primary" onClick={loadPgn}>
                  Load game
                </button>
                <button className="btn small ghost" onClick={() => setPgnOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="card stack">
            <h3>Load FEN</h3>
            <div className="row">
              <input
                type="text"
                value={fenInput}
                onChange={(event) => setFenInput(event.target.value)}
                placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                aria-label="FEN"
                className="mono"
              />
              <button className="btn small" onClick={loadFen}>
                Load
              </button>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>
              Engine
              <span className="small faint">{engine ? engine.engineName : "starting…"}</span>
            </h2>
            <EnginePanel
              fen={game.fen}
              strength="fast"
              onEvaluation={recordEval}
              externalEval={evals[game.fen] ?? null}
            />
          </div>

          <div className="card">
            <h2>
              Moves {game.viewPly > 0 && <span className="small faint">ply {game.viewPly}</span>}
            </h2>
            <MoveList sans={game.sans} currentPly={game.viewPly} onSelect={game.go} />
          </div>

          <div className="card">
            <h2>
              Coach
              <button className="btn small ghost" onClick={() => setCoachSheet(true)}>
                open sheet
              </button>
            </h2>
            <CoachPanel context={coachContext} />
          </div>
        </div>
      </div>

      <BottomSheet open={coachSheet} onClose={() => setCoachSheet(false)} title="Coach">
        <CoachPanel context={coachContext} />
      </BottomSheet>

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
