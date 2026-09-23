import { useMemo, type ReactNode } from "react";
import { navigate } from "@/lib/router";
import { usePlayer } from "@/lib/player/context";
import { useEngine } from "@/lib/engineContext";
import { useSettings } from "@/lib/settingsContext";
import { outcomeOf } from "@/lib/player/stats";
import { momentRole } from "@/lib/chess/story";
import { formatEval } from "@/lib/chess/analysis";
import { buildDailyMission } from "@/lib/training/engine";
import type { KeyMoment } from "@/lib/chess/review";
import HeroBoard from "@/components/HeroBoard";
import Landing from "@/components/Landing";
import { MiniBoard, Radar, Sparkline } from "@/components/viz";
import { Reveal } from "@/components/ambient";

/**
 * HomePage (brief §6, §7, §14, §15, §55).
 *
 * Not a grid of statistic cards: a hero built around the board and the
 * player's own rating, then a scrolling narrative — form, the recent game,
 * The Moment, Chess DNA, the recurring pattern, training, and what to
 * continue. Every number here comes from the local database.
 */

export default function HomePage(): ReactNode {
  const player = usePlayer();
  const { settings } = useSettings();
  const engine = useEngine();

  if (!player.ready) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 320 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  if (player.total === 0) return <Landing />;

  const { stats, dna, patterns, pairs, pool, due } = player;

  const bestMoment = useMemo(() => {
    let best: { moment: KeyMoment; gameId: number } | null = null;
    for (const { game, analysis } of pairs) {
      for (const moment of analysis.moments ?? []) {
        if (!best || moment.cpLoss > best.moment.cpLoss) {
          best = { moment, gameId: game.id! };
        }
      }
    }
    return best;
  }, [pairs]);

  const recent = pairs[0];
  const accuracySeries = stats.accuracySeries.map((entry) => entry.accuracy);
  const mission = buildDailyMission({
    dueCount: due.length + pool.length,
    patterns,
    stats,
  });

  const rating = stats.bests.rating;
  const unanalysed = player.total - player.analysed;

  return (
    <div className="stack" style={{ gap: "var(--s-8)" }}>
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow accent">
            {engine?.status === "ready" ? "Engine ready" : "Engine starting"} ·{" "}
            {player.analysed} of {player.total} games reviewed
          </p>
          <h1 className="hero-title">
            YOUR CHESS
            <br />
            IS A <em>system.</em>
          </h1>
          <p className="lede">{stats.headline}</p>
          <div className="hero-meta">
            <span className="stat" style={{ minWidth: 120 }}>
              <span className="stat-label">Rating</span>
              <span className="stat-value">{rating ?? "—"}</span>
              {stats.ratingTrend !== null && (
                <span className={`stat-delta ${stats.ratingTrend >= 0 ? "up" : "down"}`}>
                  {stats.ratingTrend >= 0 ? "+" : ""}
                  {stats.ratingTrend} between halves
                </span>
              )}
            </span>
            <span className="stat" style={{ minWidth: 120 }}>
              <span className="stat-label">Score</span>
              <span className="stat-value">{stats.scorePct}%</span>
              <span className="stat-sub">
                {stats.wins}W · {stats.draws}D · {stats.losses}L
              </span>
            </span>
            <span className="stat" style={{ minWidth: 120 }}>
              <span className="stat-label">Accuracy</span>
              <span className="stat-value">
                {accuracySeries.length > 0
                  ? accuracySeries[accuracySeries.length - 1]!.toFixed(1)
                  : "—"}
              </span>
              {stats.accuracyTrend !== null && (
                <span className={`stat-delta ${stats.accuracyTrend >= 0 ? "up" : "down"}`}>
                  {stats.accuracyTrend >= 0 ? "+" : ""}
                  {stats.accuracyTrend} pts
                </span>
              )}
            </span>
          </div>
          <div className="btn-row">
            <button className="btn primary" onClick={() => navigate("/board")}>
              Analyse a position
            </button>
            <button className="btn ghost" onClick={() => navigate("/games")}>
              Import more games
            </button>
          </div>
        </div>

        <HeroBoard />
      </section>

      {/* ---------------------------------------------------------- the reel */}
      <div className="reel">
        <Reveal as="section" className="reel-section">
          <div className="row between wrap">
            <div>
              <p className="eyebrow">Form</p>
              <h2 className="statement">
                {stats.recentForm.games > 0
                  ? `${stats.recentForm.wins}W · ${stats.recentForm.draws}D · ${stats.recentForm.losses}L`
                  : "No decided games yet"}
              </h2>
            </div>
            <div style={{ width: "min(240px, 100%)" }}>
              <Sparkline
                values={accuracySeries}
                height={44}
                label="Accuracy over your analysed games"
              />
              <p className="small faint">Accuracy across analysed games</p>
            </div>
          </div>
          <div className="row wrap">
            <span className="chip">
              As White {stats.byColour.w.score}% ({stats.byColour.w.games})
            </span>
            <span className="chip">
              As Black {stats.byColour.b.score}% ({stats.byColour.b.games})
            </span>
            {stats.streak.kind !== "unknown" && stats.streak.length > 1 && (
              <span className={`chip ${stats.streak.kind === "win" ? "green" : stats.streak.kind === "loss" ? "red" : ""}`}>
                {stats.streak.length} straight {stats.streak.kind}s
              </span>
            )}
            {stats.bests.accuracy && (
              <span className="chip jade">
                best accuracy {stats.bests.accuracy.value.toFixed(1)}%
              </span>
            )}
          </div>
        </Reveal>

        {recent && (
          <Reveal as="section" className="reel-section split">
            <div>
              <p className="eyebrow">Your most recent game</p>
              <h2 className="statement">
                {recent.game.headers.white ?? "White"} — {recent.game.headers.black ?? "Black"}
              </h2>
              <p className="prose small">
                {recent.game.headers.date ?? "date unknown"}
                {recent.game.openingName ? ` · ${recent.game.openingName}` : ""} ·{" "}
                {outcomeOf(recent.game.result, recent.game.playerColor ?? null) || "unknown"} ·{" "}
                {recent.analysis.whiteAccuracy}% / {recent.analysis.blackAccuracy}% accuracy
              </p>
              <div className="btn-row">
                <button
                  className="btn primary small"
                  onClick={() => navigate(`/game/${recent.game.id}`)}
                >
                  Open the review
                </button>
                {recent.analysis.moments?.[0] && (
                  <span className="chip gold">
                    {recent.analysis.moments.length} critical moment
                    {recent.analysis.moments.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <MiniBoard
              fen={
                recent.analysis.moments?.[0]?.fenBefore ??
                recent.analysis.moves?.[0]?.fenBefore ??
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              }
              size={200}
              label="Key position from your most recent game"
            />
          </Reveal>
        )}

        {bestMoment && (
          <Reveal as="section" className="reel-section split">
            <div className="stack tight">
              <p className="eyebrow">The moment</p>
              <h2 className="statement">
                {Math.ceil(bestMoment.moment.ply / 2)}
                {bestMoment.moment.ply % 2 === 1 ? "." : "…"} {bestMoment.moment.san} —{" "}
                {momentRole(bestMoment.moment)}
              </h2>
              <div className="moment-swing">
                <span className="moment-eval">
                  {formatEval(bestMoment.moment.evalBeforeCp, bestMoment.moment.mateBefore)}
                  <span className="arrow">→</span>
                  <span className="bad">
                    {formatEval(bestMoment.moment.evalAfterCp, bestMoment.moment.mateAfter)}
                  </span>
                </span>
                {bestMoment.moment.bestSan && (
                  <span className="chip">engine: {bestMoment.moment.bestSan}</span>
                )}
              </div>
              <p className="prose">{bestMoment.moment.explanation}</p>
              <p className="small faint">{bestMoment.moment.lesson}</p>
              <div className="btn-row">
                <button
                  className="btn primary small"
                  onClick={() => navigate(`/game/${bestMoment.gameId}`)}
                >
                  Replay it
                </button>
              </div>
            </div>
            <MiniBoard
              fen={bestMoment.moment.fenBefore}
              size={220}
              label="Position at the decisive moment"
            />
          </Reveal>
        )}

        <Reveal as="section" className="reel-section">
          <div className="row between wrap">
            <div>
              <p className="eyebrow">Your chess DNA</p>
              <h2 className="statement">{dna.headline}</h2>
            </div>
            <button className="btn small ghost" onClick={() => navigate("/profile")}>
              Open profile
            </button>
          </div>
          <div className="row top wrap" style={{ gap: "var(--s-6)" }}>
            <Radar dimensions={dna.dimensions} />
            <div className="stack tight" style={{ flex: "1 1 260px" }}>
              {dna.dimensions
                .filter((dim) => !dim.provisional)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((dim) => (
                  <div className="row between" key={dim.id}>
                    <span>{dim.label}</span>
                    <span className="row" style={{ gap: "var(--s-2)" }}>
                      <span className="num">{dim.score}</span>
                      {dim.delta !== undefined && dim.delta !== 0 && (
                        <span className={`stat-delta ${dim.delta > 0 ? "up" : "down"}`}>
                          {dim.delta > 0 ? "+" : ""}
                          {dim.delta}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              <p className="small faint">
                Based on {dna.movesUsed} of your moves across {dna.gamesUsed} analysed games.
              </p>
            </div>
          </div>
        </Reveal>

        {patterns[0] && (
          <Reveal as="section" className="reel-section">
            <p className="eyebrow">Recurring pattern</p>
            <h2 className="statement">{patterns[0].title}</h2>
            <div className="grid cols-3">
              <div className="tile is-warn">
                <span className="stat-label">Detected</span>
                <span className="stat-value num">{patterns[0].occurrences}×</span>
                <span className="stat-sub">in {patterns[0].games} games</span>
              </div>
              <div className="tile">
                <span className="stat-label">Impact</span>
                <span className="stat-value num">
                  −{(patterns[0].avgSwingCp / 100).toFixed(1)}
                </span>
                <span className="stat-sub">average evaluation swing</span>
              </div>
              <div className="tile">
                <span className="stat-label">Training</span>
                <span className="stat-value num">{patterns[0].training}</span>
                <span className="stat-sub">positions ready</span>
              </div>
            </div>
            <p className="prose small">{patterns[0].detail}</p>
            <div className="btn-row">
              <button className="btn primary small" onClick={() => navigate("/training")}>
                Train this pattern
              </button>
              <button className="btn small ghost" onClick={() => navigate("/profile")}>
                See all patterns
              </button>
            </div>
          </Reveal>
        )}

        <Reveal as="section" className="reel-section">
          <div className="row between wrap">
            <div>
              <p className="eyebrow">Suggested session</p>
              <h2 className="statement">{mission.headline}</h2>
              <p className="small faint">{mission.reason}</p>
            </div>
            <button className="btn primary small" onClick={() => navigate("/training")}>
              Start training
            </button>
          </div>
          <div className="grid cols-3">
            {mission.blocks.map((block) => (
              <div className="tile" key={block.id}>
                <span className="stat-label">{block.title}</span>
                <span className="stat-value num">{block.minutes}m</span>
                <span className="stat-sub">{block.detail}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {unanalysed > 0 && (
          <Reveal as="section" className="reel-section">
            <p className="eyebrow">Continue</p>
            <h2 className="statement">
              {unanalysed} game{unanalysed === 1 ? "" : "s"} still unreviewed
            </h2>
            <p className="prose small">
              Reviewing a game takes seconds for a short one and produces accuracy, critical
              moments and the deterministic story. Nothing is uploaded.
            </p>
            <div className="btn-row">
              <button className="btn primary small" onClick={() => navigate("/games")}>
                Pick a game to review
              </button>
              <span className="chip">{settings.analysisIntensity} intensity</span>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
