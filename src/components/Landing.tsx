import { useState, type ReactNode } from "react";
import HeroBoard from "@/components/HeroBoard";
import { MiniBoard } from "@/components/viz";
import { Reveal } from "@/components/ambient";
import { navigate } from "@/lib/router";
import { useEngine } from "@/lib/engineContext";
import { useSettings } from "@/lib/settingsContext";
import { analyzeGame, formatEval } from "@/lib/chess/analysis";
import { buildGameStory } from "@/lib/chess/story";
import { DEMO_GAME } from "@/lib/demoGame";
import { ENGINE_BUILD } from "@/lib/engine/buildInfo";
import { AnalysisAbortedError } from "@/lib/engine/types";
import type { ReviewedGame } from "@/lib/chess/review";

/**
 * Landing (brief §53, §54, §55).
 *
 * Shown until the first PGN arrives. It demonstrates rather than describes:
 * the hero board is genuinely playable, and "Analyse this game" runs the real
 * two-stage review on a built-in miniature so a visitor sees accuracy, The
 * Moment, the deterministic explanation and the training lesson with real
 * numbers before importing anything.
 */

const STEPS = [
  {
    n: "01",
    title: "Play",
    body: "A full board with Stockfish 19 running locally in a Web Worker. Every move is evaluated in front of you.",
  },
  {
    n: "02",
    title: "Analyse",
    body: "Import a PGN and every game is reviewed twice: a fast sweep of all positions, then a deep search of only the moments that mattered.",
  },
  {
    n: "03",
    title: "Understand",
    body: "Accuracy, ACPL, move classification and the tactical motif behind each error — computed from engine facts, never guessed.",
  },
  {
    n: "04",
    title: "Find the pattern",
    body: "Across your games the same weaknesses repeat. Chess Intelligence counts them, ranks them by cost, and names them.",
  },
  {
    n: "05",
    title: "Get the explanation",
    body: "The coach explains the position. When a local Gemma runtime is unavailable it says so and uses deterministic rules instead of pretending.",
  },
  {
    n: "06",
    title: "Train it",
    body: "Your own mistakes become puzzles, scheduled with spaced repetition so the fix actually sticks.",
  },
  {
    n: "07",
    title: "Measure it",
    body: "Rating, accuracy and all ten Chess DNA axes are tracked over time so improvement is visible, not felt.",
  },
];

export default function Landing(): ReactNode {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow accent">Local · private · on-device</p>
          <h1 className="hero-title">
            CHESS
            <br />
            <em>Intelligence</em>
          </h1>
          <p className="lede">
            Your games know more about your chess than your rating does. Import a PGN and this
            becomes a private laboratory for your own play.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => navigate("/games")}>
              Import your games
            </button>
            <button className="btn ghost" onClick={() => navigate("/board")}>
              Open the analysis board
            </button>
          </div>
          <div className="hero-meta">
            <span className="chip jade">No account</span>
            <span className="chip">No cloud</span>
            <span className="chip">Stockfish {ENGINE_BUILD.packageVersion}</span>
            <span className="chip">Works offline</span>
          </div>
        </div>

        <div className="hero-board-wrap">
          <HeroBoard />
        </div>
      </section>

      <Reveal as="section" className="reel-section">
        <p className="eyebrow">Try it now</p>
        <h2 className="statement">See the whole pipeline on one short game.</h2>
        <DemoAnalysis />
      </Reveal>

      <div className="landing">
        {STEPS.map((step, index) => (
          <Reveal key={step.n} delay={((index % 3) as 0 | 1 | 2)} className="landing-step">
            <div className="step-no" aria-hidden="true">
              {step.n}
            </div>
            <div>
              <h3 className="step-title">{step.title}</h3>
              <p className="prose">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal as="section" className="reel-section">
        <p className="eyebrow">Privacy</p>
        <h2 className="statement">
          Your chess never leaves <em>this device.</em>
        </h2>
        <p className="prose">
          Games, reviews, coach conversations and statistics live in IndexedDB in your browser.
          There is no server, no account and no API key. The engine is Stockfish compiled to
          WebAssembly and the coach is either a local model or deterministic chess rules — and it
          always tells you which one answered.
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => navigate("/games")}>
            Import your games
          </button>
        </div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------- demo analysis */

function DemoAnalysis(): ReactNode {
  const engine = useEngine();
  const { settings } = useSettings();
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "running"; text: string; ratio: number }
    | { status: "done"; review: ReviewedGame }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const run = async () => {
    if (!engine) return;
    setState({ status: "running", text: "Reconstructing your game…", ratio: 0.02 });
    try {
      const review = await analyzeGame({
        uciMoves: DEMO_GAME.uci,
        analyze: (fen, strength) => engine.analyze({ fen, strength, priority: 2 }).promise,
        intensity: settings.analysisIntensity,
        engineBuild: `${ENGINE_BUILD.npmPackage}@${ENGINE_BUILD.packageVersion}`,
        onProgress: (progress) =>
          setState({ status: "running", text: progress.text, ratio: progress.ratio }),
      });
      setState({ status: "done", review });
    } catch (error) {
      if (error instanceof AnalysisAbortedError) {
        setState({ status: "idle" });
        return;
      }
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (state.status === "idle") {
    return (
      <div className="panel stack">
        <p className="prose small">
          {DEMO_GAME.white} — {DEMO_GAME.black} · {DEMO_GAME.sans.join(" ")}{" "}
          <span className="faint">({DEMO_GAME.name})</span>
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => void run()} disabled={!engine}>
            Analyse this game
          </button>
          <span className="small faint">
            Runs the real review — nothing is saved and nothing leaves the device.
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "running") {
    return (
      <div className="panel stack">
        <div className="working">
          <span className="bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          {state.text}
        </div>
        <div className="progress thick">
          <i style={{ width: `${Math.round(state.ratio * 100)}%` }} />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="panel">
        <p className="small" style={{ color: "var(--neg)" }}>
          {state.message}
        </p>
      </div>
    );
  }

  const { review } = state;
  const moment = review.moments
    .filter((entry) => entry.mover === DEMO_GAME.perspective)
    .sort((a, b) => b.cpLoss - a.cpLoss)[0] ?? review.moments[0];
  const story = moment
    ? buildGameStory(review, { perspective: DEMO_GAME.perspective, result: DEMO_GAME.result })
    : null;

  return (
    <div className="stack">
      <div className="grid cols-3">
        <div className="tile">
          <span className="stat-label">White accuracy</span>
          <span className="stat-value num">{review.white.accuracy}%</span>
          <span className="stat-sub">ACPL {review.white.acpl}</span>
        </div>
        <div className="tile">
          <span className="stat-label">Black accuracy</span>
          <span className="stat-value num">{review.black.accuracy}%</span>
          <span className="stat-sub">ACPL {review.black.acpl}</span>
        </div>
        <div className="tile is-warn">
          <span className="stat-label">Positions searched</span>
          <span className="stat-value num">{review.analyzedPlies}</span>
          <span className="stat-sub">{review.deepPlies} at deep strength</span>
        </div>
      </div>

      {moment && (
        <div className="moment-hero">
          <span className="moment-kicker">The moment</span>
          <div className="row wrap" style={{ gap: "var(--s-4)" }}>
            <MiniBoard fen={moment.fenBefore} size={168} label={`Position before ${moment.san}`} />
            <div className="stack tight">
              <h3 className="display-m" style={{ margin: 0 }}>
                {Math.ceil(moment.ply / 2)}
                {moment.ply % 2 === 1 ? "." : "…"} {moment.san}
              </h3>
              <div className="moment-swing">
                <span className="moment-eval">
                  {formatEval(moment.evalBeforeCp, moment.mateBefore)}
                  <span className="arrow">→</span>
                  <span className="bad">{formatEval(moment.evalAfterCp, moment.mateAfter)}</span>
                </span>
                <span className="chip gold">{moment.bestSan ? `best: ${moment.bestSan}` : "engine move"}</span>
              </div>
              <p className="why-text" style={{ margin: 0 }}>
                {moment.explanation}
              </p>
              <p className="small faint" style={{ margin: 0 }}>
                {moment.lesson}
              </p>
            </div>
          </div>
        </div>
      )}

      {story && (
        <div className="panel">
          <p className="eyebrow">Deterministic game story</p>
          {story.beats.map((beat, index) => (
            <article className="beat" key={index} data-tone={beat.tone}>
              <span className="beat-label">{beat.label}</span>
              <p className="beat-text">{beat.text}</p>
            </article>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={() => navigate("/games")}>
          Do this with my own games
        </button>
        <button className="btn ghost" onClick={() => setState({ status: "idle" })}>
          Run it again
        </button>
      </div>
    </div>
  );
}
