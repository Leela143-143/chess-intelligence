import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlayer } from "@/lib/player/context";
import { toDnaGames, toPlayerGames } from "@/lib/player/analytics";
import { computePlayerStats } from "@/lib/player/stats";
import { computeChessDna, type DnaDimension } from "@/lib/chess/dna";
import { buildOpeningTree, openingTreeSummary } from "@/lib/chess/openingTree";
import { Radar, RatingTimeline, Sparkline, HeatStrip, Ring } from "@/components/viz";
import OpeningTree from "@/components/OpeningTree";
import { Reveal } from "@/components/ambient";
import { getProfile, type ProfileRecord } from "@/lib/db/schema";
import { navigate } from "@/lib/router";

/**
 * Profile (brief §26–§31, §57–§58).
 *
 * Not "avatar + eight statistic cards". The page is a longitudinal instrument:
 * identity → your chess over time → Chess DNA → your chess map → recurring
 * patterns → opening map. Every number carries its sample size, and the
 * scrubber re-derives the aggregates from a real game window rather than
 * interpolating.
 */

type WindowKey = "30" | "90" | "all";

const WINDOWS: Array<{ key: WindowKey; label: string; take: number }> = [
  { key: "30", label: "30 games", take: 30 },
  { key: "90", label: "90 games", take: 90 },
  { key: "all", label: "All time", take: Number.POSITIVE_INFINITY },
];

export default function ProfilePage(): ReactNode {
  const player = usePlayer();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [dimensionId, setDimensionId] = useState<string | null>(null);
  const [openPattern, setOpenPattern] = useState<string | null>(null);
  const [colourMap, setColourMap] = useState<"w" | "b">("w");

  useEffect(() => {
    void getProfile().then(setProfile);
  }, []);

  const games = useMemo(() => toPlayerGames(player.pairs), [player.pairs]);
  const slice = useMemo(() => {
    const take = WINDOWS.find((entry) => entry.key === windowKey)!.take;
    return Number.isFinite(take) ? games.slice(-take) : games;
  }, [games, windowKey]);

  const windowStats = useMemo(() => computePlayerStats(slice), [slice]);
  const previousDna = useMemo(() => {
    if (player.pairs.length < 6) return null;
    const half = Math.floor(player.pairs.length / 2);
    return computeChessDna(toDnaGames(player.pairs.slice(0, half)));
  }, [player.pairs]);

  const dna = player.dna;
  const selected: DnaDimension =
    dna.dimensions.find((entry) => entry.id === dimensionId) ??
    dna.dimensions.find((entry) => entry.id === dna.weaknesses[0]) ??
    dna.dimensions[0]!;

  const tree = useMemo(
    () =>
      buildOpeningTree(
        player.pairs.map(({ game, analysis }) => {
          const color = game.playerColor ?? analysis.perspective ?? null;
          const accuracy =
            color === "w" ? analysis.whiteAccuracy : color === "b" ? analysis.blackAccuracy : undefined;
          return {
            sans: game.sanList,
            color,
            result: game.result,
            ...(accuracy !== undefined ? { accuracy } : {}),
          };
        }),
        colourMap,
        10,
      ),
    [player.pairs, colourMap],
  );
  const treeSummary = useMemo(() => openingTreeSummary(tree), [tree]);

  if (player.ready && player.total === 0) {
    return (
      <div className="stack">
        <header className="page-head">
          <div className="page-head-titles">
            <p className="eyebrow">Profile</p>
            <h1 className="display-l">Your chess, measured.</h1>
          </div>
        </header>
        <div className="empty-state">
          <div className="glyph">◍</div>
          <h3>No games yet</h3>
          <p className="dim">
            Import your first PGN and this page builds itself — accuracy over time, a DNA radar
            with evidence behind every axis, and the patterns you keep repeating.
          </p>
          <button className="btn primary" onClick={() => navigate("/games")}>
            Import games
          </button>
        </div>
      </div>
    );
  }

  const rating = windowStats.rating;
  const accuracyValues = windowStats.accuracySeries.map((point) => point.accuracy);
  const name = profile?.displayName?.trim() || "Your account";

  return (
    <div className="stack">
      {/* ------------------------------------------------------------ identity */}
      <header className="profile-hero">
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            {profile?.avatar?.trim() || "♞"}
          </span>
          <div>
            <p className="eyebrow">{player.analysed} of {player.total} games reviewed</p>
            <h1 className="display-l">{name}</h1>
            <p className="lede">{windowStats.headline}</p>
          </div>
        </div>
        <dl className="profile-figures">
          <div>
            <dt>Score</dt>
            <dd className="num">{windowStats.scorePct}%</dd>
            <span className="stat-sub">
              {windowStats.wins}W · {windowStats.draws}D · {windowStats.losses}L
            </span>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd className="num">
              {accuracyValues.length > 0
                ? `${Math.round(
                    accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length,
                  )}%`
                : "—"}
            </dd>
            <span className="stat-sub">
              {windowStats.accuracyTrend === null
                ? "needs more games"
                : `${windowStats.accuracyTrend >= 0 ? "+" : ""}${windowStats.accuracyTrend}% vs earlier`}
            </span>
          </div>
          <div>
            <dt>Blunders / game</dt>
            <dd className="num">{windowStats.errorFrequency.blundersPerGame.toFixed(2)}</dd>
            <span className="stat-sub">
              over {windowStats.errorFrequency.gamesWithAnalysis} reviewed games
            </span>
          </div>
          <div>
            <dt>Best accuracy</dt>
            <dd className="num">{windowStats.bests.accuracy ? `${windowStats.bests.accuracy.value}%` : "—"}</dd>
            <span className="stat-sub">
              {windowStats.streak.length > 0 && windowStats.streak.kind !== "unknown"
                ? `${windowStats.streak.length} ${windowStats.streak.kind} streak`
                : "no streak yet"}
            </span>
          </div>
        </dl>
      </header>

      {/* --------------------------------------------------- over time (§57) */}
      <Reveal as="section" className="reel-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Your chess, over time</p>
            <h2 className="display-m">Scrub the window</h2>
          </div>
          <div className="seg" role="group" aria-label="Game window">
            {WINDOWS.map((entry) => (
              <button
                key={entry.key}
                aria-pressed={windowKey === entry.key}
                onClick={() => setWindowKey(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid cols-2">
          <div className="panel viz-card">
            <span className="stat-label">Accuracy per reviewed game</span>
            <Sparkline
              values={accuracyValues}
              height={64}
              label={`Accuracy across ${accuracyValues.length} games`}
            />
            <span className="small faint">
              {accuracyValues.length === 0
                ? "Review a game to start this series."
                : `${accuracyValues.length} games · latest ${accuracyValues[accuracyValues.length - 1]}%`}
            </span>
          </div>
          <div className="panel viz-card">
            <span className="stat-label">Phase ACPL — where the points go</span>
            <div className="phase-bars">
              {(["opening", "middlegame", "endgame"] as const).map((phase) => {
                const value = windowStats.phaseAcpl[phase];
                return (
                  <div className="phase-bar" key={phase}>
                    <span className="pb-label">{phase}</span>
                    <span className="pb-track">
                      <i style={{ width: `${Math.min(100, ((value ?? 0) / 160) * 100)}%` }} />
                    </span>
                    <span className="pb-value num">{value === null ? "—" : value}</span>
                  </div>
                );
              })}
            </div>
            <span className="small faint">
              Average centipawn loss per phase. Lower is better; 160 cp fills the bar.
            </span>
          </div>
        </div>

        {rating.length >= 2 && (
          <div className="panel viz-card">
            <div className="panel-head">
              <div>
                <div className="panel-eyebrow">Rating trajectory</div>
                <div className="panel-title">
                  {rating[0]!.elo} → {rating[rating.length - 1]!.elo}
                  {windowStats.ratingTrend !== null && (
                    <span className={`stat-delta ${windowStats.ratingTrend >= 0 ? "up" : "down"}`}>
                      {windowStats.ratingTrend >= 0 ? "+" : ""}
                      {windowStats.ratingTrend}
                    </span>
                  )}
                </div>
              </div>
              <span className="chip">{rating.length} rated games</span>
            </div>
            <RatingTimeline
              points={rating}
              onOpenGame={(gameId) => navigate(`/game/${gameId}`)}
            />
          </div>
        )}

        <div className="grid cols-4">
          {windowStats.timeBuckets
            .filter((bucket) => bucket.games > 0)
            .map((bucket) => (
              <div className="tile" key={bucket.bucket}>
                <span className="stat-label">{bucket.bucket}</span>
                <span className="stat-value num">{bucket.score}%</span>
                <span className="stat-sub">
                  {bucket.games} games{bucket.accuracy !== null ? ` · ${bucket.accuracy}% acc` : ""}
                </span>
              </div>
            ))}
        </div>
      </Reveal>

      {/* ---------------------------------------------------- chess DNA (§27) */}
      <Reveal as="section" className="reel-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Chess DNA</p>
            <h2 className="display-m">Ten axes, each with evidence</h2>
          </div>
          <span className="chip">{dna.gamesUsed} games · {dna.movesUsed} of your moves</span>
        </div>

        <div className="dna-layout">
          <div className="panel dna-radar">
            <Radar
              dimensions={dna.dimensions}
              selected={selected.id}
              onSelect={(id) => setDimensionId(id)}
              previous={previousDna?.dimensions.map((entry) => entry.score)}
            />
            <p className="small faint">
              Dashed outline: your earlier half of games. Solid shape: your latest half.
            </p>
          </div>

          <div className="stack">
            <div className="panel stack tight" aria-live="polite">
              <div className="row between">
                <span className="stat-label">{selected.label}</span>
                {selected.provisional ? (
                  <span className="chip steel">provisional</span>
                ) : selected.delta !== undefined ? (
                  <span className={`stat-delta ${selected.delta >= 0 ? "up" : "down"}`}>
                    {selected.delta >= 0 ? "+" : ""}
                    {selected.delta} vs earlier
                  </span>
                ) : null}
              </div>
              <span className="display-l num">{selected.score}</span>
              <p className="small">{selected.evidence}</p>
              <span className="small faint">Sample: {selected.sample}</span>
              <div className="btn-row">
                <button className="btn small" onClick={() => navigate("/training")}>
                  Train this
                </button>
                <button className="btn small ghost" onClick={() => navigate("/games")}>
                  See the games
                </button>
              </div>
            </div>

            <div className="panel stack tight">
              <span className="stat-label">Reading the radar</span>
              <p className="small faint">
                Scores are percentile-style against a 50 baseline, not ratings. An axis marked
                provisional has too few positions behind it to trust — expand the window or review
                more games.
              </p>
            </div>

            <div className="panel stack tight">
              <span className="stat-label">Strongest / weakest</span>
              {dna.strengths.length > 0 ? (
                <p className="small">
                  Strongest:{" "}
                  {dna.strengths
                    .map((id) => dna.dimensions.find((entry) => entry.id === id)?.label ?? id)
                    .join(", ")}
                </p>
              ) : (
                <p className="small faint">No axis is clear of the baseline yet.</p>
              )}
              {dna.weaknesses.length > 0 && (
                <p className="small">
                  Weakest:{" "}
                  {dna.weaknesses
                    .map((id) => dna.dimensions.find((entry) => entry.id === id)?.label ?? id)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ------------------------------------------------- chess map (§58) */}
      <Reveal as="section" className="reel-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">The map</p>
            <h2 className="display-m">Opening → middlegame → conversion</h2>
          </div>
        </div>

        <div className="phase-map">
          {[
            { id: "opening", label: "Opening", note: "theory and development" },
            { id: "middlegame", label: "Middlegame", note: "calculation and plans" },
            { id: "tactics", label: "Tactics", note: "seeing what the position allows" },
            { id: "endgame", label: "Endgame", note: "technique with few pieces" },
            { id: "conversion", label: "Conversion", note: "turning an edge into a win" },
          ].map((node, index) => {
            const dimension = dna.dimensions.find((entry) => entry.id === node.id);
            const score = dimension?.score ?? null;
            const phaseAcpl =
              node.id === "opening" || node.id === "middlegame" || node.id === "endgame"
                ? windowStats.phaseAcpl[node.id]
                : null;
            const tone = score === null ? "none" : score >= 60 ? "good" : score <= 45 ? "bad" : "even";
            return (
              <button
                key={node.id}
                type="button"
                className="phase-node"
                data-tone={tone}
                onClick={() => dimension && setDimensionId(dimension.id)}
                aria-label={`${node.label}: ${score ?? "no score"}`}
              >
                <span className="pn-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="pn-label">{node.label}</span>
                <span className="pn-score num">{score ?? "—"}</span>
                <span className="pn-note">{node.note}</span>
                {phaseAcpl !== null && <span className="pn-sub">ACPL {phaseAcpl}</span>}
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* ------------------------------------------------- patterns (§29) */}
      <Reveal as="section" className="reel-section split">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Recurring patterns</p>
              <h2 className="display-m">What keeps happening</h2>
            </div>
            {player.patterns.length > 0 && (
              <span className="chip">{player.patterns.length} detected</span>
            )}
          </div>

          {player.patterns.length === 0 ? (
            <div className="panel">
              <p className="prose small">
                No recurring pattern is strong enough to report yet. Patterns need at least three
                occurrences across your reviewed games — review a few more and they appear here
                with the exact games behind them.
              </p>
            </div>
          ) : (
            <div className="pattern-grid">
              {player.patterns.map((pattern) => {
                const open = openPattern === pattern.id;
                return (
                  <article className="pattern-card" key={pattern.id} data-severity={pattern.severity}>
                    <header>
                      <span className="eyebrow">{pattern.severity} impact</span>
                      <h3>{pattern.title}</h3>
                    </header>
                    <p className="small">{pattern.detail}</p>
                    <dl className="kv">
                      <div>
                        <dt>Detected</dt>
                        <dd>{pattern.games} games · {pattern.occurrences} times</dd>
                      </div>
                      <div>
                        <dt>Average swing</dt>
                        <dd className="num">{Math.round(pattern.avgSwingCp / 100 * 10) / 10} pawns</dd>
                      </div>
                      <div>
                        <dt>Training ready</dt>
                        <dd>{pattern.training} positions</dd>
                      </div>
                    </dl>
                    <div className="btn-row">
                      <button className="btn small" onClick={() => setOpenPattern(open ? null : pattern.id)}>
                        {open ? "Hide evidence" : "Show evidence"}
                      </button>
                      <button className="btn small ghost" onClick={() => navigate("/training")}>
                        Train it
                      </button>
                    </div>
                    {open && (
                      <div className="pattern-evidence">
                        <p className="small faint">{pattern.evidence}</p>
                        <ul className="pattern-examples">
                          {pattern.examples.map((example, index) => (
                            <li key={`${example.gameId}-${index}`}>
                              <button
                                className="btn small ghost"
                                onClick={() => navigate(`/game/${example.gameId}`)}
                              >
                                Game #{example.gameId} · move {Math.ceil(example.ply / 2)}
                                {example.san ? ` · ${example.san}` : ""}
                              </button>
                              {pattern.lastGameId === example.gameId && (
                                <span className="small faint">most recent</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* ------------------------------------------- opening map (§30/§31) */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-eyebrow">Opening map</div>
              <div className="panel-title">
                {colourMap === "w" ? "As White" : "As Black"}
              </div>
            </div>
            <div className="seg" role="group" aria-label="Colour">
              <button aria-pressed={colourMap === "w"} onClick={() => setColourMap("w")}>
                White
              </button>
              <button aria-pressed={colourMap === "b"} onClick={() => setColourMap("b")}>
                Black
              </button>
            </div>
          </div>
          <p className="small faint">
            {treeSummary.lines} lines played · {treeSummary.weak} leaking points ·{" "}
            {treeSummary.unplayed} never tried
          </p>
          <OpeningTree nodes={tree} />

          {windowStats.openings.length > 0 && (
            <div className="panel-rows" style={{ marginTop: "var(--s-4)" }}>
              {windowStats.openings.slice(0, 6).map((opening) => (
                <div className="panel-row" key={opening.key}>
                  <span className="small" style={{ minWidth: 0, flex: 1 }}>
                    {opening.name}
                    {opening.eco ? <span className="faint"> · {opening.eco}</span> : null}
                  </span>
                  <span className="chip">{opening.games}</span>
                  <span className="num small">{opening.score}%</span>
                  <span className="small faint">
                    {opening.accuracy !== null ? `${opening.accuracy}% acc` : "unreviewed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>

      {/* ------------------------------------------------- last reviewed game */}
      {player.pairs.length > 0 && (
        <Reveal as="section" className="reel-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Latest review</p>
              <h2 className="display-m">How the last game went</h2>
            </div>
          </div>
          <LatestGame />
        </Reveal>
      )}
    </div>
  );
}

/** The most recently imported reviewed game, with its own instruments. */
function LatestGame(): ReactNode {
  const player = usePlayer();
  const latest = useMemo(() => {
    const sorted = [...player.pairs].sort(
      (a, b) => (b.game.importedAt ?? 0) - (a.game.importedAt ?? 0),
    );
    return sorted[0] ?? null;
  }, [player.pairs]);

  if (!latest) return null;
  const { game, analysis } = latest;
  const color = game.playerColor ?? analysis.perspective ?? null;
  const accuracy = color === "w" ? analysis.whiteAccuracy : color === "b" ? analysis.blackAccuracy : null;
  const moves = analysis.moves ?? [];

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">
            {game.headers.white ?? "White"} — {game.headers.black ?? "Black"}
          </div>
          <div className="small faint">
            {game.result}
            {analysis.opening?.name ? ` · ${analysis.opening.name}` : ""}
            {game.headers.date ? ` · ${game.headers.date}` : ""}
          </div>
        </div>
        <button className="btn primary small" onClick={() => navigate(`/game/${game.id}`)}>
          Open review
        </button>
      </div>
      <div className="row wrap" style={{ marginBottom: "var(--s-3)" }}>
        {accuracy !== null && <span className="chip gold">{accuracy}% accuracy</span>}
        <span className="chip">{moves.filter((move) => move.classification === "blunder").length} blunders</span>
        <span className="chip steel">{(analysis.moments ?? []).length} key moments</span>
      </div>
      {color && moves.length > 0 ? (
        <HeatStrip moves={moves} color={color} />
      ) : (
        <p className="small faint">
          The player's colour could not be determined for this game, so per-move quality cannot be
          attributed. Set it on the game page.
        </p>
      )}
      <div className="row between wrap" style={{ marginTop: "var(--s-3)" }}>
        <Ring value={accuracy ?? 0} caption="Accuracy" />
        <span className="small faint" style={{ flex: 1 }}>
          {analysis.summary}
        </span>
      </div>
    </div>
  );
}
